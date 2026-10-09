"""
Video stream capture with timestamps and session management.
Inference runs in a background thread to keep the FastAPI event loop free.
"""
import cv2
import numpy as np
import asyncio
import time
import uuid
import base64
import logging
from collections import deque
from dataclasses import dataclass, field
from typing import Optional, AsyncGenerator

from app.detection.tracker import create_tracker
from app.movement.movement_engine import create_movement_engine
from app.risk.risk_engine import create_risk_engine
from app.risk.alert_manager import AlertManager
from app.schemas.detection import DetectionFrame, DetectedObject, RiskLevel, RiskReason

logger = logging.getLogger(__name__)


@dataclass
class VideoSource:
    type: str  # "webcam" or "upload"
    device_index: Optional[int] = None
    file_path: Optional[str] = None


@dataclass
class Session:
    id: str
    source: VideoSource
    cap: Optional[cv2.VideoCapture] = None
    tracker: object = field(default_factory=create_tracker)
    movement: object = field(default_factory=create_movement_engine)
    risk_engine: object = field(default_factory=create_risk_engine)
    alert_manager: object = field(default_factory=AlertManager)
    running: bool = False
    frame_count: int = 0


class VideoStreamManager:
    def __init__(self):
        self.sessions: dict[str, Session] = {}

    def start_session(self, source: VideoSource) -> str:
        session_id = str(uuid.uuid4())[:8]
        session = Session(id=session_id, source=source)
        self.sessions[session_id] = session
        logger.info(f"Session started: {session_id} source={source.type}")
        return session_id

    def stop_session(self, session_id: str):
        if session_id in self.sessions:
            session = self.sessions[session_id]
            session.running = False
            if session.cap:
                session.cap.release()
            del self.sessions[session_id]
            logger.info(f"Session stopped: {session_id}")

    def stop_all(self):
        for session_id in list(self.sessions.keys()):
            self.stop_session(session_id)

    def get_session(self, session_id: str) -> Optional[Session]:
        return self.sessions.get(session_id)

    def _open_capture(self, session: Session) -> cv2.VideoCapture:
        """Open and return the video capture device (runs in thread)."""
        if session.source.type == "webcam":
            import sys
            dev_idx = session.source.device_index if session.source.device_index is not None else 0
            if sys.platform == "win32":
                cap = cv2.VideoCapture(dev_idx, cv2.CAP_DSHOW)
                if not cap.isOpened():
                    cap = cv2.VideoCapture(dev_idx)
            else:
                cap = cv2.VideoCapture(dev_idx)
        else:
            cap = cv2.VideoCapture(session.source.file_path)

        if not cap.isOpened():
            target_str = f"index {session.source.device_index}" if session.source.type == "webcam" else session.source.file_path
            error_hint = ""
            if session.source.type == "webcam":
                error_hint = " - No camera found. Cloud servers (like Render) have no attached webcam; use 'Upload Video' mode or run locally."
            raise RuntimeError(
                f"Failed to open video source: {session.source.type} ({target_str}){error_hint}"
            )
        return cap

    def _process_frame(self, session: Session, frame) -> tuple:
        """
        Run tracker + movement + risk inference synchronously.
        Called via asyncio.to_thread() so it won't block the event loop.
        Returns (objects, movement, risk_frame).
        """
        objects = session.tracker.track(frame)
        movement = session.movement.update(objects, time.time())
        return objects, movement

    async def _capture_loop(self, session: Session) -> AsyncGenerator[DetectionFrame, None]:
        """Main processing loop — inference is off-loaded to a thread."""
        config = session.tracker.config

        # Open capture in a thread (can be slow on first open)
        try:
            session.cap = await asyncio.to_thread(self._open_capture, session)
        except RuntimeError as e:
            logger.error(f"Session {session.id}: {e}")
            raise

        session.running = True
        frame_times: deque[float] = deque(maxlen=30)
        is_upload = session.source.type == "upload"
        source_fps = session.cap.get(cv2.CAP_PROP_FPS) or 25.0
        frame_interval = 1.0 / max(min(source_fps, 60.0), 5.0)

        logger.info(f"Session {session.id}: capture loop started (is_upload={is_upload}, fps={source_fps})")

        while session.running:
            ret, frame = session.cap.read()
            if not ret:
                if is_upload:
                    # Smoothly loop uploaded video for continuous safety analysis
                    session.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    ret, frame = session.cap.read()
                if not ret:
                    logger.info(f"Session {session.id}: end of stream or read failure")
                    break

            session.frame_count += 1

            # Frame skip — yield control and continue
            if session.frame_count % config.frame_skip != 0:
                await asyncio.sleep(0)
                continue

            # Resize to processing resolution
            target_w, target_h = config.processing_resolution
            h, w = frame.shape[:2]
            if (w, h) != (target_w, target_h):
                frame = cv2.resize(frame, (target_w, target_h))

            t_start = time.perf_counter()
            timestamp = time.time()

            # --- Inference off the event loop ---
            try:
                objects, movement = await asyncio.to_thread(
                    self._process_frame, session, frame.copy()
                )
            except Exception as e:
                logger.warning(f"Session {session.id}: frame {session.frame_count} inference failed: {e}")
                await asyncio.sleep(0)
                continue

            # Enrich objects with movement data
            for obj in objects:
                if obj.id in movement:
                    obj.speed = movement[obj.id]["speed"]
                    obj.direction = movement[obj.id]["direction"]

            # Risk evaluation (pure Python, fast — stays on event loop)
            risk_frame = session.risk_engine.evaluate(objects, movement, timestamp)

            # Measure latency and FPS
            t_end = time.perf_counter()
            latency_ms = (t_end - t_start) * 1000
            frame_times.append(t_end)
            fps = (
                len(frame_times) / (frame_times[-1] - frame_times[0])
                if len(frame_times) > 1 else 0.0
            )

            # Log per-frame metrics
            logger.info(
                f"[{session.id}] frame={session.frame_count} "
                f"latency={latency_ms:.1f}ms fps={fps:.1f} "
                f"risk={risk_frame.risk_level} score={risk_frame.risk_score:.2f} "
                f"objects={len(objects)} reasons={[r.rule for r in risk_frame.reasons]}"
            )

            # Encode frame to JPEG and base64 for browser
            _, buf = cv2.imencode(
                ".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 75]
            )
            frame_b64 = base64.b64encode(buf).decode("utf-8")

            # Fire alert manager
            session.alert_manager.process(risk_frame)

            # Attach frame + telemetry to the detection result
            risk_frame.frame = frame_b64
            risk_frame.fps = round(fps, 1)
            risk_frame.latency_ms = round(latency_ms, 1)

            yield risk_frame

            if is_upload:
                elapsed = time.perf_counter() - t_start
                delay = max(0.002, frame_interval - elapsed)
                await asyncio.sleep(delay)
            else:
                await asyncio.sleep(0)  # yield control to event loop

        session.running = False
        if session.cap:
            session.cap.release()
            session.cap = None
        logger.info(f"Session {session.id}: capture loop ended")

    async def detection_stream(self, session_id: str) -> AsyncGenerator[DetectionFrame, None]:
        session = self.get_session(session_id)
        if not session:
            return

        async for frame in self._capture_loop(session):
            yield frame

    async def process_client_frame(self, session_id: str, frame_data: str) -> Optional[DetectionFrame]:
        """
        Process a single video frame sent by the client browser (e.g. webcam streaming).
        Decodes base64 JPEG, executes tracker + movement + risk pipeline, and returns DetectionFrame.
        """
        session = self.get_session(session_id)
        if not session:
            return None

        # 1. Decode base64 frame from client
        if frame_data.startswith("data:"):
            frame_data = frame_data.split(",", 1)[-1]

        try:
            raw_bytes = base64.b64decode(frame_data)
            nparr = np.frombuffer(raw_bytes, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if frame is None:
                return None
        except Exception as err:
            logger.warning(f"Session {session_id}: client frame decode error: {err}")
            return None

        session.frame_count += 1
        t_start = time.perf_counter()
        timestamp = time.time()

        # 2. Resize to processing resolution
        config = session.tracker.config
        target_w, target_h = config.processing_resolution
        h, w = frame.shape[:2]
        if (w, h) != (target_w, target_h):
            frame = cv2.resize(frame, (target_w, target_h))

        # 3. Offload inference to worker thread
        try:
            objects, movement = await asyncio.to_thread(
                self._process_frame, session, frame.copy()
            )
        except Exception as e:
            logger.warning(f"Session {session_id}: inference failed on client frame: {e}")
            return None

        # 4. Enrich objects with velocity data
        for obj in objects:
            if obj.id in movement:
                obj.speed = movement[obj.id]["speed"]
                obj.direction = movement[obj.id]["direction"]

        # 5. Evaluate multi-factor safety risk
        risk_frame = session.risk_engine.evaluate(objects, movement, timestamp)

        # 6. Measure latency and rolling client FPS
        t_end = time.perf_counter()
        latency_ms = (t_end - t_start) * 1000

        if not hasattr(session, "_client_frame_times"):
            session._client_frame_times = deque(maxlen=30)
        session._client_frame_times.append(t_end)
        fps = (
            len(session._client_frame_times) / (session._client_frame_times[-1] - session._client_frame_times[0])
            if len(session._client_frame_times) > 1 else 0.0
        )

        session.alert_manager.process(risk_frame)

        # 7. Encode optimized frame for rendering and forensic snapshots
        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
        encoded_b64 = base64.b64encode(buf).decode("utf-8")

        risk_frame.frame = encoded_b64
        risk_frame.fps = round(fps, 1)
        risk_frame.latency_ms = round(latency_ms, 1)

        return risk_frame