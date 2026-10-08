import os
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
        self.track_expiry = self.config.track_expiry_frames
        self._track_history: dict[int, int] = {}  # track_id -> frames_since_seen
        # Classification history per track ID: track_id -> list of (class_name, confidence)
        self._track_class_votes: dict[int, list[tuple[str, float]]] = defaultdict(list)

    def track(self, frame: np.ndarray) -> list[DetectedObject]:
        """Run tracking on a single frame with ByteTrack and temporal classification smoothing."""
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