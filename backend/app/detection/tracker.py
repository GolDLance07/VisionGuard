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
        results = self.model.track(frame, persist=True, verbose=False)[0]
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

            if confidence < self.config.detection_confidence_threshold:
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