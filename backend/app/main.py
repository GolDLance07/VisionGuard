"""
Vision Guard V1 - FastAPI Entrypoint
Real-time visual safety monitoring backend.
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import routes, websocket
from app.video.stream import VideoStreamManager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create the shared stream manager on app state
    app.state.stream_manager = VideoStreamManager()
    yield
    # Shutdown: release all active sessions
    app.state.stream_manager.stop_all()


app = FastAPI(
    title="Vision Guard API",
    version="1.0.0",
    lifespan=lifespan,
)
app.state.stream_manager = VideoStreamManager()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes.router, prefix="/api")
app.include_router(routes.router)
app.include_router(websocket.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "vision-guard"}