import pytest
from app.risk.config import RiskConfig
from app.risk.risk_engine import RiskEngine
from app.risk.rules import rule_unsafe_object, rule_proximity, rule_speed, rule_direction_change
from app.schemas.detection import DetectedObject, BoundingBox, RiskLevel


class TestRiskConfig:
    def test_defaults(self):
        config = RiskConfig()
        assert config.detection_confidence_threshold == 0.25
        assert "knife" in config.unsafe_classes
        assert config.score_weights["unsafe_object"] == 0.4

    def test_weights_sum_to_one(self):
        config = RiskConfig()
        total = sum(config.score_weights.values())
        assert abs(total - 1.0) < 0.001

    def test_cutoffs_ordered(self):
        config = RiskConfig()
        assert config.risk_cutoffs["low_max"] < config.risk_cutoffs["medium_max"]


class TestRiskRules:
    def make_obj(self, id: int, class_name: str, conf: float, x1: float, y1: float, x2: float, y2: float):
        return DetectedObject(id=id, class_name=class_name, confidence=conf, bbox=BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2))

    def test_unsafe_object_detected(self):
        objects = [self.make_obj(1, "knife", 0.9, 100, 100, 150, 150)]
        score, reason = rule_unsafe_object(objects, {})
        assert score > 0
        assert reason is not None
        assert reason.rule == "unsafe_object"

    def test_unsafe_object_low_confidence(self):
        objects = [self.make_obj(1, "knife", 0.2, 100, 100, 150, 150)]
        score, reason = rule_unsafe_object(objects, {})
        assert score < 0.5  # Penalized

    def test_no_unsafe_object(self):
        objects = [self.make_obj(1, "person", 0.9, 100, 100, 150, 150)]
        score, reason = rule_unsafe_object(objects, {})
        assert score == 0.0
        assert reason is None

    def test_proximity_close(self):
        person = self.make_obj(1, "person", 0.9, 100, 100, 150, 150)
        knife = self.make_obj(2, "knife", 0.9, 110, 110, 130, 130)
        objects = [person, knife]
        movement = {1: {"speed": 0}, 2: {"speed": 0}}
        score, reason = rule_proximity(objects, movement)
        assert score > 0.8
        assert reason.rule == "proximity"

    def test_proximity_far(self):
        person = self.make_obj(1, "person", 0.9, 100, 100, 150, 150)
        knife = self.make_obj(2, "knife", 0.9, 500, 500, 550, 550)
        objects = [person, knife]
        movement = {1: {"speed": 0}, 2: {"speed": 0}}
        score, reason = rule_proximity(objects, movement)
        assert score == 0.0

    def test_speed_fast(self):
        objects = [self.make_obj(1, "person", 0.9, 100, 100, 150, 150)]
        movement = {1: {"speed": 200.0}}
        score, reason = rule_speed(objects, movement)
        assert score == 1.0

    def test_speed_slow(self):
        objects = [self.make_obj(1, "person", 0.9, 100, 100, 150, 150)]
        movement = {1: {"speed": 5.0}}
        score, reason = rule_speed(objects, movement)
        assert score == 0.0

    def test_distance_trend_approaching(self):
        from app.risk.rules import rule_distance_trend
        objects = [
            self.make_obj(1, "person", 0.9, 100, 100, 150, 150),
            self.make_obj(2, "knife", 0.9, 110, 110, 130, 130),
        ]
        score, reason = rule_distance_trend(objects, {}, relationships={"distance_trend": "decreasing"})
        assert score > 0
        assert reason is not None
        assert "approaching" in reason.details.lower()

    def test_person_person_multiple(self):
        from app.risk.rules import rule_person_person
        objects = [
            self.make_obj(1, "person", 0.9, 100, 100, 150, 150),
            self.make_obj(2, "person", 0.9, 110, 110, 150, 150),
            self.make_obj(3, "knife", 0.9, 105, 105, 120, 120),
        ]
        score, reason = rule_person_person(objects, {})
        assert score > 0
        assert reason is not None
        assert "multiple people" in reason.details.lower()

    def test_holding_weapon(self):
        from app.risk.rules import rule_holding_weapon
        person = self.make_obj(1, "person", 0.95, 100, 100, 200, 300)
        # Knife overlapping person's hand region
        knife = self.make_obj(2, "knife", 0.90, 160, 200, 190, 240)
        score, reason = rule_holding_weapon([person, knife], {})
        assert score == 1.0
        assert reason is not None
        assert reason.rule == "holding_weapon"

    def test_knife_on_table_low_holding(self):
        from app.risk.rules import rule_holding_weapon
        person = self.make_obj(1, "person", 0.95, 100, 100, 200, 300)
        # Knife far on table
        knife = self.make_obj(2, "knife", 0.90, 400, 400, 450, 450)
        score, reason = rule_holding_weapon([person, knife], {})
        assert score == 0.0
        assert reason is None


class TestRiskEngine:
    def make_obj(self, id: int, class_name: str, conf: float, x1: float, y1: float, x2: float, y2: float):
        return DetectedObject(id=id, class_name=class_name, confidence=conf, bbox=BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2))

    def test_low_risk(self):
        engine = RiskEngine()
        objects = [self.make_obj(1, "person", 0.9, 100, 100, 150, 150)]
        movement = {1: {"speed": 5.0, "velocity": (1, 0), "direction": 0, "displacement": 10}}
        frame = engine.evaluate(objects, movement, 1000.0)
        assert frame.risk_level == RiskLevel.LOW

    def test_high_risk_requires_persistence(self):
        engine = RiskEngine()
        # Single frame HIGH should be downgraded
        objects = [self.make_obj(1, "knife", 0.95, 100, 100, 150, 150)]
        movement = {1: {"speed": 0, "velocity": (0, 0), "direction": 0, "displacement": 0}}
        frame = engine.evaluate(objects, movement, 1000.0)
        # First frame: HIGH but not persistent -> MEDIUM
        assert frame.risk_level == RiskLevel.MEDIUM

    def test_persistence_window(self):
        engine = RiskEngine()
        # Knife + person nearby + fast movement = HIGH risk
        # unsafe_object: 0.95 * 0.4 = 0.38
        # proximity: 1.0 * 0.25 = 0.25 (person very close to knife)
        # speed: 1.0 * 0.2 = 0.2 (fast movement)
        # total = 0.83 > 0.7 = HIGH
        objects = [
            self.make_obj(1, "knife", 0.95, 100, 100, 150, 150),
            self.make_obj(2, "person", 0.9, 105, 105, 140, 140),  # Very close to knife
        ]
        movement = {
            1: {"speed": 200.0, "velocity": (200, 0), "direction": 0, "displacement": 50},
            2: {"speed": 200.0, "velocity": (200, 0), "direction": 0, "displacement": 50},
        }

        # Feed multiple HIGH frames
        for i in range(15):
            frame = engine.evaluate(objects, movement, 1000.0 + i * 0.1)

        # After persistence window, should be HIGH
        assert frame.risk_level == RiskLevel.HIGH

    def test_person_holding_knife_stationary_reaches_high_risk(self):
        """Context1.md P0: Person holding weapon must score >= 0.70 (HIGH) even when stationary."""
        engine = RiskEngine()
        objects = [
            self.make_obj(1, "person", 0.95, 100, 100, 200, 300),
            self.make_obj(2, "knife", 0.95, 160, 200, 190, 240),  # Held in person bbox
        ]
        movement = {
            1: {"speed": 0.0, "velocity": (0, 0), "direction": 0, "displacement": 0},
            2: {"speed": 0.0, "velocity": (0, 0), "direction": 0, "displacement": 0},
        }

        # Frame 1: score should already be >= 0.70
        frame1 = engine.evaluate(objects, movement, 1000.0)
        assert frame1.risk_score >= 0.70

        # After persistence window, risk_level should become HIGH
        for i in range(15):
            frame = engine.evaluate(objects, movement, 1000.0 + i * 0.1)

        assert frame.risk_level == RiskLevel.HIGH
        rule_names = [r.rule for r in frame.reasons]
        assert "holding_weapon" in rule_names
        assert "unsafe_object" in rule_names


class TestSchemas:
    def test_detection_frame_validation(self):
        obj = DetectedObject(id=1, class_name="knife", confidence=0.9, bbox=BoundingBox(x1=0, y1=0, x2=100, y2=100))
        frame = {
            "timestamp": 1000.0,
            "objects": [obj],
            "risk_score": 0.8,
            "risk_level": "HIGH",
            "reasons": [{"rule": "unsafe_object", "score": 0.9, "details": "knife detected"}]
        }
        # Should not raise
        from app.schemas.detection import DetectionFrame
        DetectionFrame(**frame)

    def test_bbox_validation(self):
        with pytest.raises(Exception):
            BoundingBox(x1=-1, y1=0, x2=100, y2=100)