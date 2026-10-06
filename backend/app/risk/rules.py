"""
Individual risk rule functions returning (score, reason).
Each rule is independent and returns a normalized score in [0, 1].
Rules receive objects, movement, and an optional relationships dict.
"""
import math
from collections import deque
from app.schemas.detection import DetectedObject, RiskReason
from app.risk.config import get_config


def rule_unsafe_object(
    objects: list[DetectedObject],
    movement: dict,
    relationships: dict | None = None,
) -> tuple[float, RiskReason | None]:
    """Detect unsafe objects (weapons, knives, etc.)."""
    config = get_config()
    unsafe_detected = [o for o in objects if o.class_name in config.unsafe_classes]

    if not unsafe_detected:
        return 0.0, None

    max_conf = max(o.confidence for o in unsafe_detected)
    names = ", ".join(o.class_name for o in unsafe_detected)

    if max_conf < config.low_confidence_threshold:
        score = max_conf * 0.5
        reason = f"LOW CONFIDENCE: {names} ({max_conf:.2f})"
    else:
        score = max_conf
        reason = f"Unsafe object detected: {names} ({max_conf:.2f})"

    return min(score, 1.0), RiskReason(
        rule="unsafe_object", score=min(score, 1.0), details=reason
    )


def rule_proximity(
    objects: list[DetectedObject],
    movement: dict,
    relationships: dict | None = None,
) -> tuple[float, RiskReason | None]:
    """Check proximity between people and unsafe objects."""
    config = get_config()
    people = [o for o in objects if o.class_name == "person"]
    unsafe = [o for o in objects if o.class_name in config.unsafe_classes]

    if not people or not unsafe:
        return 0.0, None

    min_dist = float("inf")
    for person in people:
        for obj in unsafe:
            # Shortest distance between bounding boxes (0 if overlapping or in hand)
            dx = max(0.0, max(person.bbox.x1 - obj.bbox.x2, obj.bbox.x1 - person.bbox.x2))
            dy = max(0.0, max(person.bbox.y1 - obj.bbox.y2, obj.bbox.y1 - person.bbox.y2))
            dist = math.hypot(dx, dy)
            min_dist = min(min_dist, dist)

    close_thresh = config.proximity_thresholds["close"]
    far_thresh = config.proximity_thresholds["far"]

    if min_dist <= close_thresh:
        score = 1.0
    elif min_dist >= far_thresh:
        score = 0.0
    else:
        score = 1.0 - (min_dist - close_thresh) / (far_thresh - close_thresh)

    return score, RiskReason(
        rule="proximity",
        score=score,
        details=f"Person-object distance: {min_dist:.1f}px",
    )


def rule_distance_trend(
    objects: list[DetectedObject],
    movement: dict,
    relationships: dict | None = None,
) -> tuple[float, RiskReason | None]:
    """Check whether a person-object distance is decreasing (approaching)."""
    if not relationships:
        return 0.0, None

    trend = relationships.get("person_object_distance_trend") or relationships.get("distance_trend", "stable")
    min_dist = relationships.get("person_object_min_dist") or relationships.get("min_dist", None)

    if trend == "decreasing":
        config = get_config()
        close_thresh = config.proximity_thresholds["close"]
        dist = min_dist if min_dist is not None else close_thresh
        proximity_factor = max(0.0, 1.0 - (dist / (close_thresh * 4)))
        score = min(0.6 + proximity_factor * 0.4, 1.0)
        return score, RiskReason(
            rule="distance_trend",
            score=score,
            details="Person approaching unsafe object (distance decreasing)",
        )

    return 0.0, None


def rule_person_person(
    objects: list[DetectedObject],
    movement: dict,
    relationships: dict | None = None,
) -> tuple[float, RiskReason | None]:
    """Multiple people present increases baseline risk context."""
    people = [o for o in objects if o.class_name == "person"]

    if len(people) < 2:
        return 0.0, None

    # Mild score boost for multiple people near an unsafe object
    config = get_config()
    unsafe = [o for o in objects if o.class_name in config.unsafe_classes]
    if not unsafe:
        return 0.0, None

    score = min(0.2 * (len(people) - 1), 0.4)
    return score, RiskReason(
        rule="multiple_people",
        score=score,
        details=f"Multiple people ({len(people)}) present near unsafe object",
    )


def rule_speed(
    objects: list[DetectedObject],
    movement: dict,
    relationships: dict | None = None,
) -> tuple[float, RiskReason | None]:
    """Check speed of tracked objects."""
    config = get_config()
    max_speed = 0.0
    fast_obj = None

    for obj in objects:
        if obj.id in movement:
            speed = movement[obj.id]["speed"]
            if speed > max_speed:
                max_speed = speed
                fast_obj = obj

    if max_speed == 0:
        return 0.0, None

    fast_thresh = config.speed_thresholds["fast"]
    slow_thresh = config.speed_thresholds["slow"]

    if max_speed >= fast_thresh:
        score = 1.0
    elif max_speed <= slow_thresh:
        score = 0.0
    else:
        score = (max_speed - slow_thresh) / (fast_thresh - slow_thresh)

    return min(score, 1.0), RiskReason(
        rule="speed",
        score=min(score, 1.0),
        details=f"Rapid movement: {max_speed:.1f}px/s",
    )


def rule_direction_change(
    objects: list[DetectedObject],
    movement: dict,
    relationships: dict | None = None,
) -> tuple[float, RiskReason | None]:
    """Check for sudden direction changes (erratic movement)."""
    directions = []
    for obj in objects:
        if obj.id in movement:
            directions.append(movement[obj.id]["direction"])

    if len(directions) < 2:
        return 0.0, None

    dir_range = max(directions) - min(directions)
    score = min(dir_range / 180.0, 1.0)

    if score < 0.1:
        return 0.0, None

    return score, RiskReason(
        rule="direction_change",
        score=score,
        details=f"Erratic movement: {dir_range:.1f}° variance",
    )


# Registry of all rules (order matters for readability in reasons list)
RULES = [
    rule_unsafe_object,
    rule_proximity,
    rule_distance_trend,
    rule_person_person,
    rule_speed,
    rule_direction_change,
]