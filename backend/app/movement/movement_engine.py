"""
Movement analysis: velocity, direction, displacement with smoothing.
"""
import numpy as np
from collections import deque
from typing import Optional

from app.risk.config import get_config
from app.schemas.detection import DetectedObject


class MovementState:
    def __init__(self, window_size: int):
        self.positions: deque[tuple[float, float]] = deque(maxlen=window_size)
        self.timestamps: deque[float] = deque(maxlen=window_size)
        self.headings: deque[float] = deque(maxlen=window_size)
        self.bbox_heights: deque[float] = deque(maxlen=window_size)

    def update(self, center_x: float, center_y: float, timestamp: float, bbox_height: float = 100.0):
        if len(self.positions) > 0:
            prev_x, prev_y = self.positions[-1]
            dx = center_x - prev_x
            dy = center_y - prev_y
            if np.hypot(dx, dy) > 1.5:  # filter micro-jitter
                heading = float(np.degrees(np.arctan2(dy, dx)))
                self.headings.append(heading)

        self.positions.append((center_x, center_y))
        self.timestamps.append(timestamp)
        self.bbox_heights.append(max(1.0, float(bbox_height)))

    def get_velocity(self) -> tuple[float, float]:
        if len(self.positions) < 2:
            return (0.0, 0.0)
        dt = self.timestamps[-1] - self.timestamps[0]
        if dt <= 0:
            return (0.0, 0.0)
        dx = self.positions[-1][0] - self.positions[0][0]
        dy = self.positions[-1][1] - self.positions[0][1]
        return (dx / dt, dy / dt)

    def get_speed(self) -> float:
        vx, vy = self.get_velocity()
        return float(np.hypot(vx, vy))

    def get_normalized_speed(self) -> float:
        """Normalized by bounding box height (Context1.md #10)."""
        speed = self.get_speed()
        avg_h = float(np.mean(self.bbox_heights)) if self.bbox_heights else 100.0
        return speed / max(1.0, avg_h)

    def get_direction(self) -> float:
        vx, vy = self.get_velocity()
        if vx == 0 and vy == 0:
            return 0.0
        return float(np.degrees(np.arctan2(vy, vx)))

    def get_direction_variance(self) -> float:
        """Temporal heading variance per tracked ID over time (Context1.md #9)."""
        if len(self.headings) < 2:
            return 0.0
        changes = []
        hl = list(self.headings)
        for i in range(len(hl) - 1):
            diff = abs((hl[i + 1] - hl[i] + 180) % 360 - 180)
            changes.append(diff)
        return float(max(changes)) if changes else 0.0

    def get_displacement(self) -> float:
        if len(self.positions) < 2:
            return 0.0
        dx = self.positions[-1][0] - self.positions[0][0]
        dy = self.positions[-1][1] - self.positions[0][1]
        return float(np.hypot(dx, dy))


class MovementEngine:
    def __init__(self):
        self.config = get_config()
        self.track_states: dict[int, MovementState] = {}
        self.window_size = self.config.smoothing_window

    def update(self, objects: list[DetectedObject], timestamp: float) -> dict[int, dict]:
        """Update movement state for each tracked object."""
        results = {}
        current_ids = set()

        for obj in objects:
            if obj.id is None or getattr(obj, "track_status", "tracked") == "untracked":
                continue
            center_x = (obj.bbox.x1 + obj.bbox.x2) / 2
            center_y = (obj.bbox.y1 + obj.bbox.y2) / 2
            bbox_h = obj.bbox.y2 - obj.bbox.y1
            current_ids.add(obj.id)

            if obj.id not in self.track_states:
                self.track_states[obj.id] = MovementState(self.window_size)

            self.track_states[obj.id].update(center_x, center_y, timestamp, bbox_h)
            state = self.track_states[obj.id]

            results[obj.id] = {
                "velocity": state.get_velocity(),
                "speed": state.get_speed(),
                "normalized_speed": state.get_normalized_speed(),
                "direction": state.get_direction(),
                "direction_variance": state.get_direction_variance(),
                "displacement": state.get_displacement(),
            }

        # Clean up expired tracks
        expired = [tid for tid in self.track_states if tid not in current_ids]
        for tid in expired:
            del self.track_states[tid]

        return results


def create_movement_engine() -> MovementEngine:
    return MovementEngine()