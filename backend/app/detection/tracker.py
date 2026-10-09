import os
import math
import numpy as np
from collections import Counter, defaultdict
from ultralytics import YOLO

from app.risk.config import get_config
from app.schemas.detection import DetectedObject, BoundingBox, get_hazard_category


import torch
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

_GLOBAL_MODEL = None


def get_shared_models(config=None):
    """
    Singleton model cache: loads YOLO weights deterministically from refactor models.
    Per refactor audit, resolves paths deterministically and ensures valid .pt files for Ultralytics.
    """
    global _GLOBAL_MODEL

    if _GLOBAL_MODEL is None:
        backend_dir = Path(__file__).resolve().parent.parent.parent
        repo_root = backend_dir.parent
        refactor_dir = repo_root / "refactor"
        models_dir = backend_dir / "models"
        models_dir.mkdir(parents=True, exist_ok=True)

        is_cloud = bool(os.environ.get("RENDER") or os.environ.get("PORT") or os.environ.get("LOW_MEMORY"))
        if is_cloud:
            try:
                torch.set_num_threads(1)
            except Exception:
                pass

        # Target model from config (default yolov8n.pt)
        config_model_name = Path(config.model_path).name if config and getattr(config, "model_path", None) else "yolov8n.pt"
        target_name = config_model_name

        # Search candidates prioritizing the refactor directory
        candidates = [
            refactor_dir / target_name,
            models_dir / target_name,
            refactor_dir / f"{target_name}.zip",
            refactor_dir / "yolov8n.pt",
            models_dir / "yolov8n.pt",
            refactor_dir / "yolov8n.pt.zip",
            refactor_dir / "yolov8s.pt",
            refactor_dir / "yolov8s.pt.zip",
            models_dir / "yolov8s.pt",
        ]

        resolved_path = None
        for candidate in candidates:
            if candidate.exists():
                if candidate.suffix == ".zip":
                    # Ultralytics rejects .zip suffix; unpack or copy to .pt counterpart
                    pt_target = candidate.with_suffix("")
                    if not pt_target.exists():
                        import shutil
                        shutil.copyfile(candidate, pt_target)
                    resolved_path = str(pt_target)
                else:
                    resolved_path = str(candidate)
                break

        if not resolved_path:
            resolved_path = target_name

        logger.info(f"Loading YOLO tracking model from: {resolved_path}")
        _GLOBAL_MODEL = YOLO(resolved_path)

    return _GLOBAL_MODEL, None, None


class Tracker:
    def __init__(self):
        self.config = get_config()
        self.model, self.pose_model, self.weapon_model = get_shared_models(self.config)

        self.track_expiry = self.config.track_expiry_frames
        self._track_history: dict[int, int] = {}  # track_id -> frames_since_seen
        # Classification history per track ID: track_id -> list of (class_name, confidence)
        self._track_class_votes: dict[int, list[tuple[str, float]]] = defaultdict(list)

    def track(self, frame: np.ndarray) -> list[DetectedObject]:
        """Run tracking on a single frame with ByteTrack, temporal smoothing, and Pose estimation."""
        is_cloud = bool(os.environ.get("RENDER") or os.environ.get("PORT") or os.environ.get("LOW_MEMORY"))
        img_size = 480 if is_cloud else 640

        with torch.inference_mode():
            try:
                results = self.model.track(
                    frame,
                    persist=True,
                    tracker="bytetrack.yaml",
                    conf=0.15,
                    imgsz=img_size,
                    verbose=False,
                )[0]
            except Exception:
                # Fallback if tracker config not found in environment
                results = self.model.track(frame, persist=True, conf=0.15, imgsz=img_size, verbose=False)[0]

        objects = []

        if results.boxes.id is None:
            self._increment_track_age()
            track_ids = [None] * len(results.boxes)
            logger.debug("ByteTrack assigned no IDs for current frame; objects marked untracked")
        else:
            track_ids = results.boxes.id.int().cpu().tolist()
        current_ids = {int(tid) for tid in track_ids if tid is not None}

        # Remove expired tracks
        expired = [tid for tid, age in self._track_history.items() if age > self.track_expiry]
        for tid in expired:
            del self._track_history[tid]
            if tid in self._track_class_votes:
                del self._track_class_votes[tid]

        for box, tid in zip(results.boxes, track_ids):
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

            track_id = int(tid) if tid is not None else None
            track_status = "tracked" if track_id is not None else "untracked"

            if track_id is not None:
                # Record detection in temporal history for track_id
                self._track_class_votes[track_id].append((raw_class_name, confidence))
                if len(self._track_class_votes[track_id]) > 7:
                    self._track_class_votes[track_id].pop(0)

                # Temporal smoothed class: weighted vote across recent predictions
                votes = self._track_class_votes[track_id]
                weight_by_class: dict[str, float] = defaultdict(float)
                for c_name, conf in votes:
                    weight_by_class[c_name] += conf

                smoothed_class = max(weight_by_class.items(), key=lambda x: x[1])[0]
            else:
                smoothed_class = raw_class_name

            # Aspect ratio sanity check: baseball bats are slender & elongated (aspect ratio >= 1.5)
            if smoothed_class == "baseball bat" and aspect_ratio < 1.3 and confidence < 0.35:
                # If borderline detection without bat elongation, rely on raw prediction or skip
                smoothed_class = raw_class_name

            category = get_hazard_category(smoothed_class)

            objects.append(DetectedObject(
                id=track_id,
                track_id=track_id,
                track_status=track_status,
                class_name=smoothed_class,
                confidence=confidence,
                bbox=BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2),
                category=category,
            ))

            # Reset age for seen tracks
            if track_id is not None:
                self._track_history[track_id] = 0

        # Supplementary Custom Weapon Model detections (if trained model available)
        if self.weapon_model is not None:
            try:
                with torch.inference_mode():
                    w_results = self.weapon_model(frame, conf=0.20, imgsz=img_size, verbose=False)[0]
                next_id = max(current_ids, default=100) + 1
                for w_box in w_results.boxes:
                    w_cls = int(w_box.cls[0])
                    w_name = self.weapon_model.names[w_cls].lower()
                    w_conf = float(w_box.conf[0])
                    if "knife" in w_name:
                        c_name = "knife"
                    elif any(k in w_name for k in ("gun", "rifle", "pistol", "handgun", "0", "1", "2")):
                        c_name = "gun"
                    else:
                        c_name = w_name

                    wx1, wy1, wx2, wy2 = map(float, w_box.xyxy[0])
                    matched = False
                    for obj in objects:
                        if obj.class_name in self.config.unsafe_classes:
                            ix1 = max(wx1, obj.bbox.x1)
                            iy1 = max(wy1, obj.bbox.y1)
                            ix2 = min(wx2, obj.bbox.x2)
                            iy2 = min(wy2, obj.bbox.y2)
                            inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
                            union = max(1.0, (wx2 - wx1) * (wy2 - wy1) + (obj.bbox.x2 - obj.bbox.x1) * (obj.bbox.y2 - obj.bbox.y1) - inter)
                            if (inter / union) > 0.35:
                                matched = True
                                obj.confidence = max(obj.confidence, w_conf)
                                break
                    if not matched:
                        objects.append(DetectedObject(
                            id=next_id,
                            class_name=c_name,
                            confidence=w_conf,
                            bbox=BoundingBox(x1=wx1, y1=wy1, x2=wx2, y2=wy2),
                            category=get_hazard_category(c_name),
                        ))
                        next_id += 1
            except Exception:
                pass

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
                with torch.inference_mode():
                    pose_results = self.pose_model(frame, verbose=False, imgsz=img_size)[0]
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