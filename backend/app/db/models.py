import json
import datetime
from sqlalchemy import Column, String, Float, Integer, Text, DateTime
from app.db.database import Base


class IncidentRecordModel(Base):
    __tablename__ = "incidents"

    id = Column(String(64), primary_key=True, index=True)
    timestamp = Column(Float, nullable=True)
    time_str = Column(String(32), nullable=True)
    risk_score = Column(Float, default=0.0)
    risk_level = Column(String(32), default="LOW")
    title = Column(String(255), default="Incident Detected")
    primary_reason = Column(Text, default="")
    hazard_class = Column(String(64), default="")
    duration_ms = Column(Integer, default=0)
    status = Column(String(32), default="unreviewed")
    image_url = Column(Text, nullable=True)  # Hosted Cloudinary URL or local URL
    reasons_json = Column(Text, default="[]")
    detected_classes_json = Column(Text, default="[]")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    def to_dict(self) -> dict:
        try:
            reasons = json.loads(self.reasons_json) if self.reasons_json else []
        except Exception:
            reasons = []

        try:
            detected_classes = json.loads(self.detected_classes_json) if self.detected_classes_json else []
        except Exception:
            detected_classes = []

        return {
            "id": self.id,
            "eventId": f"#{self.id.replace('inc-', '')}",
            "timestamp": self.timestamp,
            "timeStr": self.time_str or (datetime.datetime.utcfromtimestamp(self.timestamp / 1000).strftime("%H:%M:%S") if self.timestamp else ""),
            "riskScore": self.risk_score,
            "riskLevel": self.risk_level,
            "title": self.title,
            "primaryReason": self.primary_reason,
            "hazardClass": self.hazard_class,
            "durationMs": self.duration_ms,
            "status": self.status,
            "imageUrl": self.image_url,
            "frame": self.image_url,  # For backward-compatibility with UI image preview
            "reasons": reasons,
            "detectedClasses": detected_classes,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }
