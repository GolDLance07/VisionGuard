"""
WebSocket endpoint for real-time detection streaming.
Supports:
1. Video file playback: Server-driven frame streaming.
2. Browser Webcam Streaming: Client captures browser camera and streams frames over WS for inference.
"""
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.websockets import WebSocketState

from app.video.stream import Session, VideoSource

logger = logging.getLogger(__name__)
router = APIRouter(tags=["websocket"])


@router.websocket("/ws/detection")
@router.websocket("/detection")
@router.websocket("/api/ws/detection")
@router.websocket("/api/detection")
async def detection_websocket(websocket: WebSocket, session_id: str):
    await websocket.accept()
    stream_manager = websocket.app.state.stream_manager
    session = stream_manager.get_session(session_id)
    if not session:
        # If server restarted or session was cleared, auto-recover webcam session so client can resume immediately
        logger.info(f"Session {session_id} not found in memory (e.g. server restarted). Auto-recovering session.")
        session = Session(id=session_id, source=VideoSource(type="webcam", device_index=0))
        stream_manager.sessions[session_id] = session

    # 1. Video File Upload Session: Server reads file from disk and streams detections
    if session.source.type == "upload":
        try:
            async for frame in stream_manager.detection_stream(session_id):
                if websocket.client_state != WebSocketState.CONNECTED:
                    break
                await websocket.send_json(frame.model_dump(mode="json"))
        except WebSocketDisconnect:
            pass
        except Exception as e:
            logger.warning(f"Session {session_id} stream error: {e}")
            await websocket.close(code=4000, reason=str(e))
    else:
        # 2. Browser Webcam Streaming: Client streams frames over WebSocket for real-time AI processing
        session.running = True
        try:
            while websocket.client_state == WebSocketState.CONNECTED and session.running:
                data = await websocket.receive_json()
                if not data:
                    continue
                frame_data = data.get("frame") or data.get("image") or data.get("data")
                if frame_data:
                    detection_frame = await stream_manager.process_client_frame(session_id, frame_data)
                    if detection_frame and websocket.client_state == WebSocketState.CONNECTED:
                        await websocket.send_json(detection_frame.model_dump(mode="json"))
        except WebSocketDisconnect:
            pass
        except Exception as e:
            logger.warning(f"Session {session_id} browser webcam stream ended: {e}")
            await websocket.close(code=4000, reason=str(e))