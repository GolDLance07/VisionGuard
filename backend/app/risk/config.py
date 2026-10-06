"""
Centralized configuration for all tunable risk/detection thresholds.
Single source of truth - NO hardcoded values elsewhere.
"""
from pydantic import BaseModel


class RiskConfig(BaseModel):
    # Detection
    detection_confidence_threshold: float = 0.25
    unsafe_classes: list[str] = ["knife", "gun", "weapon", "scissors", "baseball bat"]
    model_path: str = "models/yolov8n.pt"
    frame_skip: int = 1
    processing_resolution: tuple[int, int] = (640, 480)

    # Tracking
    track_expiry_frames: int = 30
    smoothing_window: int = 5

    # Movement
    speed_thresholds: dict[str, float] = {
        "slow": 10.0,
        "medium": 50.0,
        "fast": 100.0,
    }
    proximity_thresholds: dict[str, float] = {
        "close": 100.0,
        "medium": 200.0,
        "far": 400.0,
    }

    # Risk scoring weights (must sum to 1.0)
    score_weights: dict[str, float] = {
        "unsafe_object": 0.40,
        "proximity": 0.20,
        "speed": 0.15,
        "distance_trend": 0.10,
        "direction_change": 0.10,
        "multiple_people": 0.05,
    }

    # Risk level cutoffs
    risk_cutoffs: dict[str, float] = {
        "low_max": 0.3,
        "medium_max": 0.7,
    }

    # Persistence
    persistence_window: int = 10
    min_persistence_duration: float = 0.5

    # Low confidence handling
    low_confidence_threshold: float = 0.3
    audio_alert_enabled: bool = True

    def to_response(self) -> dict:
        return self.model_dump()


# Singleton instance
_config_instance: RiskConfig | None = None


def get_config() -> RiskConfig:
    global _config_instance
    if _config_instance is None:
        _config_instance = RiskConfig()
    return _config_instance