"""
Application settings — loaded from backend/.env via pydantic-settings.
All environment variables are declared here as the single source of truth.
Never read os.environ directly elsewhere in the codebase; import `settings` instead.
"""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Load backend/.env regardless of which directory uvicorn is started from
        env_file=str(Path(__file__).resolve().parents[2] / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ------------------------------------------------------------------ #
    # PostgreSQL / Neon
    # ------------------------------------------------------------------ #
    database_url: str = ""
    """
    Full async DSN, e.g.:
      postgresql+asyncpg://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
    The +asyncpg driver dialect must be included.
    Plain postgresql:// is automatically coerced to postgresql+asyncpg://.
    """

    # ------------------------------------------------------------------ #
    # Cloudinary
    # ------------------------------------------------------------------ #
    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""

    # ------------------------------------------------------------------ #
    # General app
    # ------------------------------------------------------------------ #
    app_env: str = "development"
    log_level: str = "INFO"

    @property
    def async_database_url(self) -> str:
        """Ensure the DSN uses the asyncpg dialect for SQLAlchemy async engine."""
        url = self.database_url
        if url.startswith("postgresql://") or url.startswith("postgres://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        return url

    @property
    def cloudinary_configured(self) -> bool:
        return bool(self.cloudinary_cloud_name and self.cloudinary_api_key and self.cloudinary_api_secret)

    @property
    def db_configured(self) -> bool:
        return bool(self.database_url)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the cached settings singleton. Loaded once at startup."""
    return Settings()
