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
from app.core.config import get_settings
from app.db.database import init_db, close_db
from app.integrations.cloudinary import init_cloudinary

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────────────────
    app.state.stream_manager = VideoStreamManager()

    # PostgreSQL (Neon) — non-blocking; degrades gracefully when not configured
    await init_db()

    # Cloudinary — synchronous SDK config, fast
    init_cloudinary()

    logger.info(
        f"Vision Guard started — env={settings.app_env} "
        f"db={'✓' if settings.db_configured else '✗ (in-memory)'} "
        f"cloudinary={'✓' if settings.cloudinary_configured else '✗ (disabled)'}"
    )

    yield

    # ── Shutdown ──────────────────────────────────────────────────────────
    app.state.stream_manager.stop_all()
    await close_db()


app = FastAPI(
    title="Vision Guard API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes registered once — REST under /api, WebSocket at /ws
app.include_router(routes.router, prefix="/api")
app.include_router(websocket.router)


@app.get("/health")
async def health():
    from app.db.database import is_db_available
    from app.integrations.cloudinary import is_configured as cloudinary_ok
    return {
        "status": "ok",
        "service": "vision-guard",
        "db": "connected" if is_db_available() else "in-memory",
        "cloudinary": "configured" if cloudinary_ok() else "disabled",
    }