"""
Async SQLAlchemy engine and session factory for Neon PostgreSQL.
Uses asyncpg under the hood; connection pooling is handled by SQLAlchemy.

Usage:
    from app.db.database import get_db

    async def my_route(db: AsyncSession = Depends(get_db)):
        ...
"""
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# Module-level singletons — initialised in init_db(), torn down in close_db()
_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


class Base(DeclarativeBase):
    """Shared declarative base for all ORM models."""
    pass


async def init_db() -> None:
    """
    Create the async engine, run table creation (CREATE TABLE IF NOT EXISTS).
    Called once during FastAPI lifespan startup.
    """
    global _engine, _session_factory

    settings = get_settings()
    if not settings.db_configured:
        logger.warning(
            "DATABASE_URL not set — PostgreSQL persistence is disabled. "
            "Incidents will be stored in-memory only."
        )
        return

    logger.info("Connecting to Neon PostgreSQL...")
    _engine = create_async_engine(
        settings.async_database_url,
        # Neon serverless Postgres goes to sleep; keep pool small and use
        # pre-ping so stale connections are refreshed transparently.
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,
        pool_recycle=300,          # recycle connections every 5 min
        connect_args={"ssl": "require"},  # Neon always requires TLS
        echo=settings.app_env == "development",
    )
    _session_factory = async_sessionmaker(
        _engine,
        expire_on_commit=False,
        class_=AsyncSession,
    )

    # Auto-create tables — safe to run on every startup (IF NOT EXISTS)
    from app.db import models  # noqa: F401 — registers models with Base.metadata
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    logger.info("Database initialised — tables ready.")


async def close_db() -> None:
    """Dispose the engine. Called during FastAPI lifespan shutdown."""
    global _engine, _session_factory
    if _engine:
        await _engine.dispose()
        _engine = None
        _session_factory = None
        logger.info("Database connection pool closed.")


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that yields a per-request AsyncSession.
    The session is committed on success and rolled back on exception.
    """
    if _session_factory is None:
        raise RuntimeError(
            "Database not initialised. Set DATABASE_URL in backend/.env"
        )
    async with _session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


def is_db_available() -> bool:
    """Returns True when the DB engine has been successfully initialised."""
    return _session_factory is not None
