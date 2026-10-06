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


class SessionStartRequest(BaseModel):
    source: str = Field(..., pattern="^(webcam|upload)$")
    device_index: int | None = Field(default=None, ge=0)
    file_ref: str | None = None


class SessionStartResponse(BaseModel):
    session_id: str
    status: str


@router.post("/session/upload")
async def upload_video(file: UploadFile = File(...)):
    """Upload a video file and return a file_ref for use with /session/start."""
    allowed_types = {"video/mp4", "video/avi", "video/mov", "video/x-matroska", "video/webm"}
    if file.content_type and file.content_type not in allowed_types:
        raise HTTPException(400, f"Unsupported file type: {file.content_type}")

    safe_name = os.path.basename(file.filename or "upload.mp4")
    dest = os.path.join(UPLOAD_DIR, safe_name)
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    logger.info(f"Video uploaded: {dest}")
    return {"file_ref": dest, "filename": safe_name}


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


@router.get("/config", response_model=ConfigResponse)
async def get_config():
    return RiskConfig().to_response()