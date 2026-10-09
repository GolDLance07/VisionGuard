"""
REST API endpoints for session management, configuration, and file upload.
All endpoints access the shared VideoStreamManager from app.state.
"""
import os
import shutil
import logging
from fastapi import APIRouter, HTTPException, Request, UploadFile, File
from pydantic import BaseModel, Field

from app.video.stream import VideoSource
from app.risk.config import RiskConfig
from app.schemas.detection import ConfigResponse

router = APIRouter(tags=["api"])
logger = logging.getLogger(__name__)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


ALLOWED_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".webm", ".m4v"}
ALLOWED_MIME_TYPES = {
    "video/mp4",
    "video/avi",
    "video/x-msvideo",
    "video/mov",
    "video/quicktime",
    "video/x-matroska",
    "video/webm",
    "application/octet-stream",  # Windows browser fallback
}

ALLOWED_MODELS = {
    "yolov8n": "models/yolov8n.pt",
    "yolov8s": "models/yolov8s.pt",
    "yolov8n.pt": "models/yolov8n.pt",
    "yolov8s.pt": "models/yolov8s.pt",
    "models/yolov8n.pt": "models/yolov8n.pt",
    "models/yolov8s.pt": "models/yolov8s.pt",
}


class SessionStartRequest(BaseModel):
    source: str = Field(..., pattern="^(webcam|upload)$")
    device_index: int | None = None
    file_ref: str | None = None


class SessionStartResponse(BaseModel):
    session_id: str
    status: str


@router.post("/session/upload")
async def upload_video(file: UploadFile = File(...)):
    """Upload a video file securely and return a file_ref for use with /session/start."""
    ext = os.path.splitext(file.filename or "")[1].lower()
    content_type = (file.content_type or "").lower()

    if ext not in ALLOWED_EXTENSIONS and content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(400, f"Unsupported file type: {content_type} ({ext})")

    import uuid
    clean_base = os.path.basename(file.filename or "upload.mp4").replace(" ", "_")
    safe_name = f"{uuid.uuid4().hex[:12]}_{clean_base}"
    dest = os.path.join(UPLOAD_DIR, safe_name)

    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    file_size = os.path.getsize(dest)
    if file_size < 10:
        if os.path.exists(dest):
            os.remove(dest)
        raise HTTPException(400, "Uploaded file is empty or corrupted")

    logger.info(f"Video uploaded: {dest} ({file_size} bytes)")
    return {"file_ref": dest, "filename": file.filename or clean_base}


@router.post("/session/start", response_model=SessionStartResponse)
async def start_session(request: SessionStartRequest, req: Request):
    stream_manager = req.app.state.stream_manager

    if request.source == "webcam":
        if request.device_index is None:
            raise HTTPException(400, "device_index required for webcam source")
        source = VideoSource(type="webcam", device_index=request.device_index)
    elif request.source == "upload":
        if not request.file_ref:
            raise HTTPException(400, "file_ref required for upload source")
        if not os.path.exists(request.file_ref):
            raise HTTPException(404, f"File not found: {request.file_ref}")
        source = VideoSource(type="upload", file_path=request.file_ref)
    else:
        raise HTTPException(400, "Invalid source type")

    session_id = stream_manager.start_session(source)
    return {"session_id": session_id, "status": "started"}


class SessionStopRequest(BaseModel):
    session_id: str | None = None


@router.post("/session/stop")
async def stop_session(req: Request, body: SessionStopRequest | None = None, session_id: str | None = None):
    sid = (body and body.session_id) or session_id
    if not sid:
        raise HTTPException(400, "session_id required")
    req.app.state.stream_manager.stop_session(sid)
    return {"status": "stopped"}


# Forensic incident records (Neon / Database + Cloudinary Snapshots)
import json
import uuid
from app.db.database import get_session
from app.db.models import IncidentRecordModel
from app.db.cloudinary_service import upload_snapshot, is_cloudinary_configured

_INCIDENTS_STORE: list[dict] = []


class IncidentRecord(BaseModel):
    id: str | None = None
    timestamp: float | None = None
    timeStr: str | None = None
    riskScore: float
    riskLevel: str
    title: str
    primaryReason: str
    hazardClass: str | None = None
    durationMs: int | None = 0
    status: str | None = "unreviewed"
    reasons: list[dict] = []
    frame: str | None = None  # Base64 JPEG or Cloudinary URL
    imageUrl: str | None = None
    detectedClasses: list[str] = []


@router.get("/cloud-status")
async def get_cloud_status():
    """Return status of Neon Database and Cloudinary integrations."""
    from app.db.database import DATABASE_URL
    is_neon = DATABASE_URL.startswith("postgresql") or "neon.tech" in DATABASE_URL
    return {
        "database": "Neon PostgreSQL" if is_neon else "Local Database",
        "database_connected": bool(DATABASE_URL),
        "cloudinary_configured": is_cloudinary_configured(),
    }


@router.get("/incidents")
async def get_incidents():
    """Retrieve logged incidents from database with in-memory fallback."""
    try:
        session = get_session()
        try:
            records = session.query(IncidentRecordModel).order_by(IncidentRecordModel.created_at.desc()).limit(100).all()
            if records:
                return {"incidents": [r.to_dict() for r in records]}
        finally:
            session.close()
    except Exception as e:
        logger.warning(f"Database query failed, returning cached store: {e}")

    return {"incidents": _INCIDENTS_STORE}


@router.post("/incidents")
async def log_incident(incident: IncidentRecord):
    """Store an incident record in Neon PostgreSQL and upload critical snapshot to Cloudinary."""
    data = incident.model_dump()
    if not data.get("id"):
        data["id"] = f"inc-{uuid.uuid4().hex[:8]}"

    # 1. Upload critical movement snapshot to Cloudinary if image frame is provided
    frame_raw = data.get("frame")
    if frame_raw and not str(frame_raw).startswith("http"):
        cloud_url = upload_snapshot(frame_raw, incident_id=data["id"])
        if cloud_url:
            data["imageUrl"] = cloud_url
            data["frame"] = cloud_url  # Point UI frame to hosted Cloudinary image

    # 2. Persist in Database (Neon PostgreSQL)
    try:
        session = get_session()
        try:
            db_record = IncidentRecordModel(
                id=data["id"],
                timestamp=data.get("timestamp"),
                time_str=data.get("timeStr"),
                risk_score=data.get("riskScore", 0.0),
                risk_level=data.get("riskLevel", "LOW"),
                title=data.get("title", "Incident"),
                primary_reason=data.get("primaryReason", ""),
                hazard_class=data.get("hazardClass", ""),
                duration_ms=data.get("durationMs", 0) or 0,
                status=data.get("status", "unreviewed") or "unreviewed",
                image_url=data.get("imageUrl") or data.get("frame"),
                reasons_json=json.dumps(data.get("reasons", [])),
                detected_classes_json=json.dumps(data.get("detectedClasses", [])),
            )
            session.merge(db_record)
            session.commit()
        finally:
            session.close()
    except Exception as err:
        logger.warning(f"Could not persist incident to database: {err}")

    # Maintain in-memory cache
    _INCIDENTS_STORE.insert(0, data)
    if len(_INCIDENTS_STORE) > 100:
        _INCIDENTS_STORE.pop()

    return {"status": "recorded", "incident": data}


@router.patch("/incidents/{incident_id}/status")
async def update_incident_status(incident_id: str, payload: dict):
    new_status = payload.get("status")
    if not new_status:
        raise HTTPException(400, "status required")

    try:
        session = SessionLocal()
        try:
            record = session.query(IncidentRecordModel).filter_by(id=incident_id).first()
            if record:
                record.status = new_status
                session.commit()
        finally:
            session.close()
    except Exception as e:
        logger.warning(f"Could not update status in DB: {e}")

    for inc in _INCIDENTS_STORE:
        if inc.get("id") == incident_id:
            inc["status"] = new_status

    return {"status": "updated", "id": incident_id, "newStatus": new_status}


@router.delete("/incidents")
async def clear_incidents():
    try:
        session = SessionLocal()
        try:
            session.query(IncidentRecordModel).delete()
            session.commit()
        finally:
            session.close()
    except Exception as e:
        logger.warning(f"Could not clear incidents in DB: {e}")

    _INCIDENTS_STORE.clear()
    return {"status": "cleared"}


from app.risk.config import RiskConfig, get_config, update_config


class ConfigUpdateRequest(BaseModel):
    model_path: str | None = None
    detection_confidence_threshold: float | None = Field(default=None, ge=0.0, le=1.0)
    unsafe_classes: list[str] | None = None
    frame_skip: int | None = Field(default=None, ge=1, le=10)
    speed_thresholds: dict[str, float] | None = None
    proximity_thresholds: dict[str, float] | None = None
    score_weights: dict[str, float] | None = None
    persistence_window: int | None = None
    min_persistence_duration: float | None = None
    low_confidence_threshold: float | None = None
    audio_alert_enabled: bool | None = None


@router.get("/config", response_model=ConfigResponse)
async def read_config():
    return get_config().to_response()


@router.post("/config", response_model=ConfigResponse)
async def update_configuration(updates: ConfigUpdateRequest):
    data = updates.model_dump(exclude_unset=True)
    if "model_path" in data:
        raw_m = data["model_path"]
        if raw_m in ALLOWED_MODELS:
            data["model_path"] = ALLOWED_MODELS[raw_m]
        elif not os.path.exists(raw_m):
            raise HTTPException(400, f"Model path not allowed or not found: {raw_m}")

    updated = update_config(data)
    return updated.to_response()