import os
import math
import numpy as np
from collections import Counter, defaultdict
from ultralytics import YOLO

from app.risk.config import get_config
from app.schemas.detection import DetectedObject, BoundingBox, get_hazard_category


class Tracker:
    def __init__(self):
        self.config = get_config()
        # Prefer higher-accuracy yolov8s.pt (11.2M params) if available over yolov8n (3.2M params)
        model_path = self.config.model_path
        if model_path in ("models/yolov8n.pt", "yolov8n.pt") and os.path.exists("models/yolov8s.pt"):
            model_path = "models/yolov8s.pt"
        self.model = YOLO(model_path)

        # Dual-Model Architecture: Load Pose Estimation model for skeletal keypoints & pointing detection
        pose_path = "models/yolov8n-pose.pt" if os.path.exists("models/yolov8n-pose.pt") else "yolov8n-pose.pt"
        try:
            self.pose_model = YOLO(pose_path)
        except Exception:
            self.pose_model = None

        self.track_expiry = self.config.track_expiry_frames
        self._track_history: dict[int, int] = {}  # track_id -> frames_since_seen
        # Classification history per track ID: track_id -> list of (class_name, confidence)
        self._track_class_votes: dict[int, list[tuple[str, float]]] = defaultdict(list)

    def track(self, frame: np.ndarray) -> list[DetectedObject]:
        """Run tracking on a single frame with ByteTrack, temporal smoothing, and Pose estimation."""
        try:
            results = self.model.track(
                frame,
                persist=True,
                tracker="bytetrack.yaml",
                conf=0.15,
                imgsz=640,
                verbose=False,
            )[0]
        except Exception:
            # Fallback if tracker config not found in environment
            results = self.model.track(frame, persist=True, conf=0.15, verbose=False)[0]

        objects = []

        if results.boxes.id is None:
            self._increment_track_age()
            track_ids = [i + 1 for i in range(len(results.boxes))]
        else:
            track_ids = results.boxes.id.int().cpu().tolist()
        current_ids = set(track_ids)

        # Remove expired tracks
        expired = [tid for tid, age in self._track_history.items() if age > self.track_expiry]
        for tid in expired:
            del self._track_history[tid]
            if tid in self._track_class_votes:
                del self._track_class_votes[tid]

        for box, track_id in zip(results.boxes, track_ids):
            cls_id = int(box.cls[0])
            raw_class_name = self.model.names[cls_id]
            confidence = float(box.conf[0])

            # Sensitive threshold for weapons (0.15) so handheld items are tracked reliably
            min_conf = 0.15 if raw_class_name in self.config.unsafe_classes else self.config.detection_confidence_threshold
            if confidence < min_conf:
                continue

            # Only track unsafe classes + person
            if raw_class_name not in self.config.unsafe_classes and raw_class_name != "person":
                continue

            x1, y1, x2, y2 = map(float, box.xyxy[0])
            w = max(1.0, x2 - x1)
            h = max(1.0, y2 - y1)
            aspect_ratio = max(w, h) / min(w, h)

            # Record detection in temporal history for track_id
            self._track_class_votes[int(track_id)].append((raw_class_name, confidence))
            if len(self._track_class_votes[int(track_id)]) > 7:
                self._track_class_votes[int(track_id)].pop(0)

            # Temporal smoothed class: weighted vote across recent predictions
            votes = self._track_class_votes[int(track_id)]
            weight_by_class: dict[str, float] = defaultdict(float)
            for c_name, conf in votes:
                weight_by_class[c_name] += conf

            smoothed_class = max(weight_by_class.items(), key=lambda x: x[1])[0]

            # Aspect ratio sanity check: baseball bats are slender & elongated (aspect ratio >= 1.5)
            if smoothed_class == "baseball bat" and aspect_ratio < 1.3 and confidence < 0.35:
                # If borderline detection without bat elongation, rely on raw prediction or skip
                smoothed_class = raw_class_name

            category = get_hazard_category(smoothed_class)

            objects.append(DetectedObject(
                id=int(track_id),
                class_name=smoothed_class,
                confidence=confidence,
                bbox=BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2),
                category=category,
            ))

            # Reset age for seen tracks
            self._track_history[int(track_id)] = 0

        # Mark holding associations between people and unsafe objects
        people = [o for o in objects if o.class_name == "person"]
        weapons = [o for o in objects if o.class_name in self.config.unsafe_classes]
        for p in people:
            for w in weapons:
                x_left = max(p.bbox.x1, w.bbox.x1)
                y_top = max(p.bbox.y1, w.bbox.y1)
                x_right = min(p.bbox.x2, w.bbox.x2)
                y_bottom = min(p.bbox.y2, w.bbox.y2)
                overlap_w = max(0.0, x_right - x_left)
                overlap_h = max(0.0, y_bottom - y_top)
                w_area = max(1.0, (w.bbox.x2 - w.bbox.x1) * (w.bbox.y2 - w.bbox.y1))
                dx = max(0.0, max(p.bbox.x1 - w.bbox.x2, w.bbox.x1 - p.bbox.x2))
                dy = max(0.0, max(p.bbox.y1 - w.bbox.y2, w.bbox.y1 - p.bbox.y2))
                if (overlap_w * overlap_h) / w_area >= 0.25 or (dx * dx + dy * dy) < 30.0 * 30.0:
                    p.is_holding_weapon = True
                    w.is_held = True
                    w.held_by_id = p.id

        # Anatomical Pose Estimation: Keypoint tracking for arm pointing & weapon brandishing
        if self.pose_model is not None and people:
            try:
                pose_results = self.pose_model(frame, verbose=False)[0]
                if pose_results.keypoints is not None and len(pose_results.keypoints.xy) > 0:
                    kpts_all = pose_results.keypoints.xy.cpu().numpy()
                    pose_boxes = pose_results.boxes.xyxy.cpu().numpy() if pose_results.boxes is not None else []

                    for p in people:
                        p_cx = (p.bbox.x1 + p.bbox.x2) / 2
                        p_cy = (p.bbox.y1 + p.bbox.y2) / 2
                        best_match_idx = -1
                        min_dist = float("inf")
                        for idx, pbox in enumerate(pose_boxes):
                            box_cx = (pbox[0] + pbox[2]) / 2
                            box_cy = (pbox[1] + pbox[3]) / 2
                            d = math.hypot(p_cx - box_cx, p_cy - box_cy)
                            if d < min_dist:
                                min_dist = d
                                best_match_idx = idx

                        if best_match_idx >= 0 and min_dist < max(80.0, (p.bbox.x2 - p.bbox.x1)):
                            kpts = kpts_all[best_match_idx]  # (17, 2)
                            # Keypoints: 5=L-Shoulder, 6=R-Shoulder, 7=L-Elbow, 8=R-Elbow, 9=L-Wrist, 10=R-Wrist
                            l_shoulder, r_shoulder = kpts[5], kpts[6]
                            l_elbow, r_elbow = kpts[7], kpts[8]
                            l_wrist, r_wrist = kpts[9], kpts[10]

                            for w in weapons:
                                w_cx = (w.bbox.x1 + w.bbox.x2) / 2
                                w_cy = (w.bbox.y1 + w.bbox.y2) / 2
                                d_left_wrist = math.hypot(w_cx - l_wrist[0], w_cy - l_wrist[1]) if l_wrist[0] > 0 else 999.0
                                d_right_wrist = math.hypot(w_cx - r_wrist[0], w_cy - r_wrist[1]) if r_wrist[0] > 0 else 999.0

                                holding_hand = None
                                if d_right_wrist < 45.0 or (w.bbox.x1 <= r_wrist[0] <= w.bbox.x2 and w.bbox.y1 <= r_wrist[1] <= w.bbox.y2):
                                    holding_hand = "right"
                                elif d_left_wrist < 45.0 or (w.bbox.x1 <= l_wrist[0] <= w.bbox.x2 and w.bbox.y1 <= l_wrist[1] <= w.bbox.y2):
                                    holding_hand = "left"

                                if holding_hand is not None:
                                    p.is_holding_weapon = True
                                    w.is_held = True
                                    w.held_by_id = p.id

                                    # Check weapon raised overhead (strike / brandishing posture)
                                    shoulder_y = min(l_shoulder[1], r_shoulder[1]) if (l_shoulder[1] > 0 and r_shoulder[1] > 0) else (p.bbox.y1 + 40)
                                    holding_wrist_y = r_wrist[1] if holding_hand == "right" else l_wrist[1]
                                    if holding_wrist_y > 0 and holding_wrist_y < shoulder_y - 12:
                                        p.pose_weapon_raised = True

                                    # Check arm pointing vector towards other people
                                    wrist_pt = r_wrist if holding_hand == "right" else l_wrist
                                    elbow_pt = r_elbow if holding_hand == "right" else l_elbow
                                    if wrist_pt[0] > 0 and elbow_pt[0] > 0:
                                        arm_vec_x = wrist_pt[0] - elbow_pt[0]
                                        arm_vec_y = wrist_pt[1] - elbow_pt[1]
                                        arm_len = math.hypot(arm_vec_x, arm_vec_y)
                                        if arm_len > 10:
                                            for other_p in people:
                                                if other_p.id == p.id:
                                                    continue
                                                o_cx = (other_p.bbox.x1 + other_p.bbox.x2) / 2
                                                o_cy = (other_p.bbox.y1 + other_p.bbox.y2) / 2
                                                dir_to_o_x = o_cx - wrist_pt[0]
                                                dir_to_o_y = o_cy - wrist_pt[1]
                                                dist_to_o = math.hypot(dir_to_o_x, dir_to_o_y)
                                                if 20 < dist_to_o < 450:
                                                    cos_sim = (arm_vec_x * dir_to_o_x + arm_vec_y * dir_to_o_y) / (arm_len * dist_to_o)
                                                    if cos_sim > 0.60:
                                                        p.pose_arm_pointing = True
            except Exception:
                pass

        # Increment age for unseen tracks
        for tid in self._track_history:
            if tid not in current_ids:
                self._track_history[tid] += 1

        return objects

    def _increment_track_age(self):
        for tid in self._track_history:
            self._track_history[tid] += 1


def create_tracker() -> Tracker:
    return Tracker()