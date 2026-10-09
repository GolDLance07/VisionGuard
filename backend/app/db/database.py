import os
import logging
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

logger = logging.getLogger(__name__)

# Load .env file
env_path = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

# Neon connection string compatibility:
# SQLAlchemy requires 'postgresql://' instead of legacy 'postgres://'
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = None
SessionLocal = None
Base = declarative_base()


def normalize_database_url(raw_url: str) -> str:
    if not raw_url:
        return ""
    url = raw_url.strip()
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)

    # Automatically adapt to whichever driver is installed (psycopg v3 or psycopg2)
    if url.startswith("postgresql://") and not (
        url.startswith("postgresql+psycopg://") or url.startswith("postgresql+psycopg2://")
    ):
        has_psycopg3 = False
        has_psycopg2 = False
        try:
            import psycopg  # noqa: F401
            has_psycopg3 = True
        except ImportError:
            pass

        try:
            import psycopg2  # noqa: F401
            has_psycopg2 = True
        except ImportError:
            pass

        if has_psycopg3:
            url = url.replace("postgresql://", "postgresql+psycopg://", 1)
        elif has_psycopg2:
            url = url.replace("postgresql://", "postgresql+psycopg2://", 1)

    return url


def get_engine():
    global engine, SessionLocal, DATABASE_URL
    if engine is not None:
        return engine

    raw_url = os.getenv("DATABASE_URL", "").strip()
    db_url = normalize_database_url(raw_url)

    # Check if a valid Neon / PostgreSQL connection string is provided
    if db_url and db_url.startswith("postgresql"):
        try:
            logger.info("Connecting to Neon PostgreSQL database...")
            engine = create_engine(
                db_url,
                pool_pre_ping=True,      # Automatically reconnect if Neon serverless pauses
                pool_recycle=300,        # Recycle connections every 5 mins
                pool_size=5,
                max_overflow=10,
            )
            SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
            return engine
        except Exception as e:
            logger.error(f"Failed to connect to Neon PostgreSQL: {e}")

    # Fallback to local SQLite if Neon URL is not configured or fails
    fallback_path = Path(__file__).resolve().parent.parent.parent / "data" / "incidents.db"
    os.makedirs(fallback_path.parent, exist_ok=True)
    fallback_url = f"sqlite:///{fallback_path}"
    logger.warning(f"Using local database fallback: {fallback_url}")
    engine = create_engine(fallback_url, connect_args={"check_same_thread": False})
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return engine


def get_db():
    if SessionLocal is None:
        get_engine()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    global engine, SessionLocal
    eng = get_engine()
    try:
        with eng.connect():
            pass
        Base.metadata.create_all(bind=eng)
        logger.info("Neon PostgreSQL database tables initialized successfully.")
    except Exception as e:
        logger.warning(f"Neon connection test failed: {e}. Switching to local database fallback.")
        fallback_path = Path(__file__).resolve().parent.parent.parent / "data" / "incidents.db"
        os.makedirs(fallback_path.parent, exist_ok=True)
        fallback_url = f"sqlite:///{fallback_path}"
        engine = create_engine(fallback_url, connect_args={"check_same_thread": False})
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        Base.metadata.create_all(bind=engine)
        logger.info("Local database initialized successfully.")
