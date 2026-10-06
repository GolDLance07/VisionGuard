"""
YOLO detector wrapper with allow-list and confidence threshold.
"""
import numpy as np
from ultralytics import YOLO

from app.risk.config import get_config
from app.schemas.detection import DetectedObject, BoundingBox


class Detector:
    def __init__(self):
        self.config = get_config()
        self.model = YOLO(self.config.model_path)
        self.unsafe_classes = set(self.config.unsafe_classes)
        self.conf_threshold = self.config.detection_confidence_threshold

    def detect(self, frame: np.ndarray) -> list[DetectedObject]:
        """Run detection on a single frame, return filtered objects."""
        results = self.model(frame, verbose=False)[0]
        objects = []

        for box in results.boxes:
            cls_id = int(box.cls[0])
            class_name = self.model.names[cls_id]
            confidence = float(box.conf[0])

            if confidence < self.conf_threshold:
                continue

            # Only keep unsafe classes + person for tracking context
            if class_name not in self.unsafe_classes and class_name != "person":
                continue

            x1, y1, x2, y2 = map(float, box.xyxy[0])
            objects.append(DetectedObject(
                id=-1,  # Will be assigned by tracker
                class_name=class_name,
                confidence=confidence,
                bbox=BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2)
            ))

        return objects


def create_detector() -> Detector:
    return Detector()