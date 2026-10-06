"""
WebSocket endpoint for real-time detection streaming.
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Request
from fastapi.websockets import WebSocketState


router = APIRouter(prefix="/ws", tags=["websocket"])


@router.websocket("/detection")
async def detection_websocket(websocket: WebSocket, session_id: str):
    await websocket.accept()
    stream_manager = websocket.app.state.stream_manager
    session = stream_manager.get_session(session_id)
    if not session:
        await websocket.close(code=4004, reason="Session not found")
        return

    try:
        async for frame in stream_manager.detection_stream(session_id):
            if websocket.client_state != WebSocketState.CONNECTED:
                break
            await websocket.send_json(frame.model_dump(mode="json"))
    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.close(code=4000, reason=str(e))