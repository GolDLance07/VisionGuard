"""
Cloudinary SDK initialisation and helper utilities.

The SDK is configured once at startup via init_cloudinary().
Use upload_frame_snapshot() to persist a base64 JPEG frame and get back a URL.
"""
import base64
import logging
from typing import Optional

logger = logging.getLogger(__name__)

_configured = False


def init_cloudinary() -> bool:
    """
    Configure the Cloudinary SDK from app settings.
    Returns True if credentials were present and SDK was configured, False otherwise.
    Called once during FastAPI lifespan startup.
    """
    global _configured

    from app.core.config import get_settings
    settings = get_settings()

    if not settings.cloudinary_configured:
        logger.warning(
            "Cloudinary credentials not set — frame snapshot upload is disabled. "
            "Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in backend/.env"
        )
        return False

    try:
        import cloudinary
        cloudinary.config(
            cloud_name=settings.cloudinary_cloud_name,
            api_key=settings.cloudinary_api_key,
            api_secret=settings.cloudinary_api_secret,
            secure=True,          # always use https:// URLs
        )
        _configured = True
        logger.info(
            f"Cloudinary configured — cloud_name={settings.cloudinary_cloud_name}"
        )
        return True
    except Exception as e:
        logger.error(f"Failed to configure Cloudinary: {e}")
        return False


def is_configured() -> bool:
    """Returns True when the Cloudinary SDK has been successfully initialised."""
    return _configured


async def upload_frame_snapshot(
    frame_b64: str,
    incident_id: str,
    folder: str = "visionguard/incidents",
) -> Optional[str]:
    """
    Upload a base64-encoded JPEG frame to Cloudinary.

    Args:
        frame_b64: Raw base64 string (no data-URI prefix).
        incident_id: Used as the public_id so uploads are idempotent.
        folder: Cloudinary folder path.

    Returns:
        Secure Cloudinary URL on success, None on failure or if not configured.
    """
    if not _configured:
        return None

    try:
        import asyncio
        import cloudinary.uploader

        data_uri = f"data:image/jpeg;base64,{frame_b64}"

        # Cloudinary's uploader is synchronous — run it off the event loop
        result = await asyncio.to_thread(
            cloudinary.uploader.upload,
            data_uri,
            public_id=f"{folder}/{incident_id}",
            overwrite=True,
            resource_type="image",
            format="jpg",
            quality="auto:good",
            fetch_format="auto",
        )
        url: str = result.get("secure_url", "")
        logger.info(f"Frame snapshot uploaded: {url}")
        return url or None
    except Exception as e:
        logger.error(f"Cloudinary upload failed for incident {incident_id}: {e}")
        return None
