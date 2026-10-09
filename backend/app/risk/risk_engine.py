"""
Risk engine: rule aggregation, normalization, level classification, persistence.
Tracks distance history to compute person-object approach trends.
"""
import time
import math
import logging
from collections import deque
from typing import Optional

from app.risk.config import get_config
from app.risk.rules import RULES
from app.schemas.detection import DetectionFrame, RiskLevel, RiskReason, DetectedObject

logger = logging.getLogger(__name__)


class RiskEngine:
    def __init__(self):
        cfg = get_config()
        # Persistence tracking
        self.high_history: deque[tuple[float, bool]] = deque(maxlen=cfg.persistence_window)
        self.first_high_time: Optional[float] = None

        # Distance trend tracking (person-object min distance history)
        self._dist_history: deque[float] = deque(maxlen=10)

    def _compute_relationships(self, objects: list[DetectedObject]) -> dict:
        """Compute person-object distances and trend for this frame."""
        config = get_config()
        people = [o for o in objects if o.class_name == "person"]
        unsafe = [o for o in objects if o.class_name in config.unsafe_classes]

        relationships: dict = {}

        if not people or not unsafe:
            self._dist_history.clear()
            return relationships

        # Minimum person-object distance this frame
        min_dist = float("inf")
        for person in people:
            px = (person.bbox.x1 + person.bbox.x2) / 2
            py = (person.bbox.y1 + person.bbox.y2) / 2
            for obj in unsafe:
                ox = (obj.bbox.x1 + obj.bbox.x2) / 2
                oy = (obj.bbox.y1 + obj.bbox.y2) / 2
                dist = math.hypot(px - ox, py - oy)
                min_dist = min(min_dist, dist)

        self._dist_history.append(min_dist)
        relationships["person_object_min_dist"] = min_dist

        # Trend: compare recent average to older average
        if len(self._dist_history) >= 4:
            half = len(self._dist_history) // 2
            older = sum(list(self._dist_history)[:half]) / half
            recent = sum(list(self._dist_history)[half:]) / (len(self._dist_history) - half)
            if recent < older * 0.88:
                relationships["person_object_distance_trend"] = "decreasing"
            elif recent > older * 1.12:
                relationships["person_object_distance_trend"] = "increasing"
            else:
                relationships["person_object_distance_trend"] = "stable"
        else:
            relationships["person_object_distance_trend"] = "stable"

        return relationships

    def evaluate(
        self,
        objects: list[DetectedObject],
        movement: dict,
        timestamp: float,
    ) -> DetectionFrame:
        # Check for low-confidence-only frame
        config = get_config()
        above_thresh = [
            o for o in objects
            if o.confidence >= config.detection_confidence_threshold
        ]
        if objects and not above_thresh:
            return DetectionFrame(
                timestamp=timestamp,
                objects=objects,
                risk_score=0.0,
                risk_level=RiskLevel.LOW_CONFIDENCE,
                reasons=[RiskReason(
                    rule="low_confidence",
                    score=0.0,
                    details="All detections below confidence threshold",
                )],
            )

        # Compute relationships for this frame
        relationships = self._compute_relationships(objects)

        # Run all rules
        rule_results = []
        for rule in RULES:
            score, reason = rule(objects, movement, relationships)
            if reason:
                rule_results.append((score, reason))

        # Weighted aggregation with live configuration snapshot (Context1.md #5)
        config = get_config()
        weights = config.score_weights
        cutoffs = config.risk_cutoffs

        total_score = 0.0
        reasons = []
        for score, reason in rule_results:
            weight = weights.get(reason.rule, 0.0)
            total_score += score * weight
            reasons.append(reason)

        total_score = min(max(total_score, 0.0), 1.0)

        # Classify level
        if total_score <= cutoffs["low_max"]:
            level = RiskLevel.LOW
        elif total_score <= cutoffs["medium_max"]:
            level = RiskLevel.MEDIUM
        else:
            level = RiskLevel.HIGH

        # Persistence gating
        is_high = level == RiskLevel.HIGH
        self.high_history.append((timestamp, is_high))

        if is_high and self.first_high_time is None:
            self.first_high_time = timestamp
        elif not is_high:
            self.first_high_time = None

        persistent_high = self._check_persistence(timestamp)
        if level == RiskLevel.HIGH and not persistent_high:
            level = RiskLevel.MEDIUM

        # Add persistence duration to reasons when HIGH
        if level == RiskLevel.HIGH and self.first_high_time is not None:
            duration = timestamp - self.first_high_time
            reasons.append(RiskReason(
                rule="persistence",
                score=1.0,
                details=f"Risk condition persisted for {duration:.1f}s",
            ))

        logger.debug(
            f"Risk eval: score={total_score:.3f} level={level} "
            f"rules={[r.rule for r in reasons]}"
        )

        return DetectionFrame(
            timestamp=timestamp,
            objects=objects,
            risk_score=total_score,
            risk_level=level,
            reasons=reasons,
        )

    def _check_persistence(self, current_time: float) -> bool:
        """HIGH risk must hold for ≥50% of persistence_window AND min_persistence seconds."""
        if not self.high_history:
            return False

        high_count = sum(1 for _, is_high in self.high_history if is_high)
        if high_count < self.persistence_window * 0.5:
            return False

        if self.first_high_time is None:
            return False

        return (current_time - self.first_high_time) >= self.min_persistence


def create_risk_engine() -> RiskEngine:
    return RiskEngine()