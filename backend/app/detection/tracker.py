"""
Ultralytics tracker wrapper for persistent object IDs.
"""
import numpy as np
from ultralytics import YOLO

from app.risk.config import get_config
from app.schemas.detection import DetectedObject, BoundingBox, get_hazard_category


class Tracker:
    def __init__(self):
        self.config = get_config()
        self.model = YOLO(self.config.model_path)
        self.track_expiry = self.config.track_expiry_frames
        self._track_history: dict[int, int] = {}  # track_id -> frames_since_seen

    def track(self, frame: np.ndarray) -> list[DetectedObject]:
        """Run tracking on a single frame, return objects with persistent IDs."""
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

        for box, track_id in zip(results.boxes, track_ids):
            cls_id = int(box.cls[0])
            class_name = self.model.names[cls_id]
            confidence = float(box.conf[0])

            # Sensitive threshold for weapons (0.15) so handheld items are tracked reliably
            min_conf = 0.15 if class_name in self.config.unsafe_classes else self.config.detection_confidence_threshold
            if confidence < min_conf:
                continue

            # Only track unsafe classes + person
            if class_name not in self.config.unsafe_classes and class_name != "person":
                continue

            x1, y1, x2, y2 = map(float, box.xyxy[0])
            objects.append(DetectedObject(
                id=int(track_id),
                class_name=class_name,
                confidence=confidence,
                bbox=BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2),
                category=get_hazard_category(class_name),
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