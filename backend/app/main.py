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


import os
from fastapi.staticfiles import StaticFiles
from app.db.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize Neon/PostgreSQL database tables and shared stream manager
    try:
        init_db()
    except Exception as e:
        logger.warning(f"Database init warning: {e}")

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

# Mount snapshots static directory for local snapshot evidence fallback
snapshots_dir = os.path.join(os.path.dirname(__file__), "..", "data", "snapshots")
os.makedirs(snapshots_dir, exist_ok=True)
app.mount("/api/snapshots", StaticFiles(directory=snapshots_dir), name="snapshots")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "https://vision-guard-2thugeyub-me-abb2.vercel.app",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app.*|https://.*\.onrender\.com.*|http://localhost:.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes.router, prefix="/api")
app.include_router(websocket.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "vision-guard"}