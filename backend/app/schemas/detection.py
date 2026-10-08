"""
Pydantic schemas for detection WebSocket payload.
Shared between backend and frontend — never send raw model internals.
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Literal
from enum import Enum


class RiskLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    LOW_CONFIDENCE = "LOW_CONFIDENCE"


class BoundingBox(BaseModel):
    x1: float = Field(..., ge=0)
    y1: float = Field(..., ge=0)
    x2: float = Field(..., ge=0)
    y2: float = Field(..., ge=0)


HAZARD_CATEGORIES: dict[str, str] = {
    # Sharp Objects
    "knife": "Sharp Objects",
    "scissors": "Sharp Objects",
    "blade": "Sharp Objects",
    "dagger": "Sharp Objects",
    "sword": "Sharp Objects",
    "box cutter": "Sharp Objects",
    "machete": "Sharp Objects",
    "cutter": "Sharp Objects",
    "scalpel": "Sharp Objects",
    "sharp object": "Sharp Objects",
    "sharp objects": "Sharp Objects",

    # Blunt Objects
    "baseball bat": "Blunt Objects",
    "bat": "Blunt Objects",
    "crowbar": "Blunt Objects",
    "club": "Blunt Objects",
    "stick": "Blunt Objects",
    "hammer": "Blunt Objects",
    "pipe": "Blunt Objects",
    "blunt object": "Blunt Objects",
    "blunt objects": "Blunt Objects",
    "blunt weapon": "Blunt Objects",

    # Firearms
    "gun": "Firearm",
    "pistol": "Firearm",
    "rifle": "Firearm",
    "handgun": "Firearm",
    "shotgun": "Firearm",
    "weapon": "Firearm",

    "person": "Person",
}


def get_hazard_category(class_name: str) -> str:
    return HAZARD_CATEGORIES.get(class_name.lower(), "Hazardous Object")


class DetectedObject(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: int
    class_name: str = Field(alias="class")
    confidence: float = Field(..., ge=0, le=1)
    bbox: BoundingBox
    category: str = "Object"
    # Optional movement data (added in M2)
    speed: float = 0.0
    direction: float = 0.0
    is_holding_weapon: bool = False
    is_held: bool = False
    held_by_id: int | None = None
    pose_arm_pointing: bool = False
    pose_weapon_raised: bool = False


class RiskReason(BaseModel):
    rule: str
    score: float
    details: str


class DetectionFrame(BaseModel):
    timestamp: float
    frame: str | None = None          # base64-encoded JPEG of the processed frame
    objects: list[DetectedObject]
    risk_score: float = Field(..., ge=0, le=1)
    risk_level: RiskLevel
    reasons: list[RiskReason]
    fps: float = 0.0
    latency_ms: float = 0.0


class ConfigResponse(BaseModel):
    detection_confidence_threshold: float
    unsafe_classes: list[str]
    model_path: str
    frame_skip: int
    processing_resolution: tuple[int, int]
    track_expiry_frames: int
    smoothing_window: int
    speed_thresholds: dict[str, float]
    proximity_thresholds: dict[str, float]
    score_weights: dict[str, float]
    risk_cutoffs: dict[str, float]
    persistence_window: int
    min_persistence_duration: float
    low_confidence_threshold: float
    audio_alert_enabled: bool