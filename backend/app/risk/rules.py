"""
Individual risk rule functions returning (score, reason).
Each rule is independent and returns a normalized score in [0, 1].
Rules receive objects, movement, and an optional relationships dict.
"""
import math
from collections import deque
from app.schemas.detection import DetectedObject, RiskReason, get_hazard_category
from app.risk.config import get_config


def rule_unsafe_object(
    objects: list[DetectedObject],
    movement: dict,
    relationships: dict | None = None,
) -> tuple[float, RiskReason | None]:
    """Detect unsafe objects (weapons, knives, etc.) classified by hazard category."""
    config = get_config()
    unsafe_detected = [o for o in objects if o.class_name in config.unsafe_classes]

    if not unsafe_detected:
        return 0.0, None

    max_conf = max(o.confidence for o in unsafe_detected)
    categories = list({getattr(o, "category", None) or get_hazard_category(o.class_name) for o in unsafe_detected})
    cat_title = categories[0] if len(categories) == 1 else "Hazardous Object"
    names = ", ".join(f"{o.class_name} ({o.confidence:.2f})" for o in unsafe_detected)

    if max_conf < config.low_confidence_threshold:
        score = max_conf * 0.5
        reason = f"LOW CONFIDENCE: {cat_title} [{names}]"
    else:
        score = max_conf
        reason = f"{cat_title} detected: {names}"

    return min(score, 1.0), RiskReason(
        rule="unsafe_object", score=min(score, 1.0), details=reason
    )


def rule_holding_weapon(
    objects: list[DetectedObject],
    movement: dict,
    relationships: dict | None = None,
) -> tuple[float, RiskReason | None]:
    """Check if an unsafe object is being held or brandished by a person (Context1.md #2, #11, #12)."""
    config = get_config()
    people = [o for o in objects if o.class_name == "person"]
    unsafe = [o for o in objects if o.class_name in config.unsafe_classes]

    if not people or not unsafe:
        return 0.0, None

    max_holding_score = 0.0
    holding_details = None

    for person in people:
        p_box = person.bbox
        for weapon in unsafe:
            w_box = weapon.bbox

            # Intersection / overlap
            x_left = max(p_box.x1, w_box.x1)
            y_top = max(p_box.y1, w_box.y1)
            x_right = min(p_box.x2, w_box.x2)
            y_bottom = min(p_box.y2, w_box.y2)

            overlap_w = max(0.0, x_right - x_left)
            overlap_h = max(0.0, y_bottom - y_top)
            overlap_area = overlap_w * overlap_h

            weapon_area = max(1.0, (w_box.x2 - w_box.x1) * (w_box.y2 - w_box.y1))
            overlap_ratio = overlap_area / weapon_area

            # Bounding box edge distance
            dx = max(0.0, max(p_box.x1 - w_box.x2, w_box.x1 - p_box.x2))
            dy = max(0.0, max(p_box.y1 - w_box.y2, w_box.y1 - p_box.y2))
            edge_dist = math.hypot(dx, dy)

            # Center distance relative to person height
            p_height = max(1.0, p_box.y2 - p_box.y1)
            p_cx, p_cy = (p_box.x1 + p_box.x2) / 2, (p_box.y1 + p_box.y2) / 2
            w_cx, w_cy = (w_box.x1 + w_box.x2) / 2, (w_box.y1 + w_box.y2) / 2
            center_dist = math.hypot(p_cx - w_cx, p_cy - w_cy)

            # Hand/body association score
            score = 0.0
            if getattr(person, "pose_arm_pointing", False):
                score = 1.0
            elif getattr(person, "pose_weapon_raised", False):
                score = 1.0
            elif getattr(person, "is_holding_weapon", False) or getattr(weapon, "is_held", False):
                score = 1.0
            elif overlap_ratio >= 0.35 or edge_dist == 0.0:
                score = 1.0
            elif edge_dist < 25.0:
                score = max(0.5, 1.0 - (edge_dist / 25.0))
            elif center_dist < p_height * 0.45:
                score = 0.75

            if score > max_holding_score:
                max_holding_score = score
                cat = getattr(weapon, "category", None) or get_hazard_category(weapon.class_name)
                if getattr(person, "pose_arm_pointing", False):
                    holding_details = f"Weapon ({cat}) POINTED towards another person by person {person.id} (Pose-verified)"
                elif getattr(person, "pose_weapon_raised", False):
                    holding_details = f"Weapon ({cat}) RAISED in strike posture by person {person.id} (Pose-verified)"
                else:
                    holding_details = f"Weapon ({cat}) held or brandished in hand by person {person.id}"

    if max_holding_score <= 0.0:
        return 0.0, None

    return max_holding_score, RiskReason(
        rule="holding_weapon",
        score=max_holding_score,
        details=holding_details or "Weapon held by person",
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
    """Check for sudden direction changes per tracked person over time (Context1.md #9)."""
    max_variance = 0.0
    erratic_obj = None

    for obj in objects:
        if obj.id in movement:
            m = movement[obj.id]
            # Use temporal heading variance per object if available
            var = m.get("direction_variance")
            if var is not None and var > max_variance:
                max_variance = var
                erratic_obj = obj

    # Fallback to multi-object spread only if temporal variance not populated
    if max_variance == 0.0:
        directions = [movement[o.id]["direction"] for o in objects if o.id in movement and "direction" in movement[o.id]]
        if len(directions) >= 2:
            max_variance = max(directions) - min(directions)

    if max_variance < 30.0:
        return 0.0, None

    score = min(max_variance / 180.0, 1.0)
    return score, RiskReason(
        rule="direction_change",
        score=score,
        details=f"Erratic direction change: {max_variance:.1f}° variance",
    )


# Registry of all rules (order matters for readability in reasons list)
RULES = [
    rule_unsafe_object,
    rule_holding_weapon,
    rule_proximity,
    rule_distance_trend,
    rule_person_person,
    rule_speed,
    rule_direction_change,
]