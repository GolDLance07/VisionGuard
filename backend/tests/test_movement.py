import pytest
import math
from app.movement.movement_engine import MovementEngine, MovementState
from app.schemas.detection import DetectedObject, BoundingBox


def make_obj(id: int, class_name: str, x1: float, y1: float, x2: float, y2: float):
    return DetectedObject(
        id=id,
        class_name=class_name,
        confidence=0.9,
        bbox=BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2),
    )


class TestMovementState:
    def test_single_position(self):
        state = MovementState(window_size=5)
        state.update(100.0, 100.0, 1.0)
        assert state.get_velocity() == (0.0, 0.0)
        assert state.get_speed() == 0.0
        assert state.get_direction() == 0.0
        assert state.get_displacement() == 0.0

    def test_linear_movement(self):
        state = MovementState(window_size=5)
        # Move right by 100 units in 1 second
        state.update(100.0, 100.0, 1.0)
        state.update(200.0, 100.0, 2.0)

        vx, vy = state.get_velocity()
        assert math.isclose(vx, 100.0, rel_tol=1e-3)
        assert math.isclose(vy, 0.0, rel_tol=1e-3)
        assert math.isclose(state.get_speed(), 100.0, rel_tol=1e-3)
        assert math.isclose(state.get_direction(), 0.0, rel_tol=1e-3)
        assert math.isclose(state.get_displacement(), 100.0, rel_tol=1e-3)


class TestMovementEngine:
    def test_engine_tracking(self):
        engine = MovementEngine()
        obj1 = make_obj(1, "person", 100, 100, 150, 150)
        
        # Frame 1
        res1 = engine.update([obj1], timestamp=10.0)
        assert 1 in res1
        assert res1[1]["speed"] == 0.0

        # Frame 2: moved by 50 px in 0.5s => speed = 100 px/s
        obj2 = make_obj(1, "person", 150, 100, 200, 150)
        res2 = engine.update([obj2], timestamp=10.5)
        assert math.isclose(res2[1]["speed"], 100.0, rel_tol=1e-2)

    def test_expired_tracks_cleaned(self):
        engine = MovementEngine()
        obj = make_obj(1, "person", 100, 100, 150, 150)
        engine.update([obj], timestamp=1.0)
        assert 1 in engine.track_states

        # Next frame without obj 1
        engine.update([], timestamp=2.0)
        assert 1 not in engine.track_states
