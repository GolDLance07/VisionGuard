"""
SQLAlchemy ORM models for VisionGuard V1.
All models inherit from Base (app.db.database.Base).
"""
import time
import uuid
from typing import Any

from sqlalchemy import JSON, Float, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class IncidentModel(Base):
    """
    Persistent incident record.
    Mirrors the IncidentRecord Pydantic schema in api/routes.py.
    """
    __tablename__ = "incidents"

    # Primary key — matches frontend-generated ids like "inc-abc12345"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: f"inc-{uuid.uuid4().hex[:8]}")

    # Timing
    timestamp: Mapped[float] = mapped_column(Float, default=time.time, index=True)
    time_str: Mapped[str | None] = mapped_column(String(32), nullable=True)

    # Risk summary
    risk_score: Mapped[float] = mapped_column(Float, nullable=False)
    risk_level: Mapped[str] = mapped_column(String(32), nullable=False)

    # Human-readable description
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    primary_reason: Mapped[str] = mapped_column(Text, nullable=False)

    # JSON arrays / blobs
    reasons: Mapped[list[Any]] = mapped_column(JSON, default=list)
    detected_classes: Mapped[list[str]] = mapped_column(JSON, default=list)

    # Optional base64 frame snapshot — stored in Cloudinary URL after upload
    frame_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "timestamp": self.timestamp,
            "timeStr": self.time_str,
            "riskScore": self.risk_score,
            "riskLevel": self.risk_level,
            "title": self.title,
            "primaryReason": self.primary_reason,
            "reasons": self.reasons or [],
            "detectedClasses": self.detected_classes or [],
            "frame": self.frame_url,  # Cloudinary URL or None
        }
