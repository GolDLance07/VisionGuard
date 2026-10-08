import os
import base64
import logging
from pathlib import Path
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Ensure .env is loaded
env_path = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

cloudinary_url = os.getenv("CLOUDINARY_URL", "").strip().strip('"').strip("'")
cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME", "").strip().strip('"').strip("'")
api_key = os.getenv("CLOUDINARY_API_KEY", "").strip().strip('"').strip("'")
api_secret = os.getenv("CLOUDINARY_API_SECRET", "").strip().strip('"').strip("'")

cloudinary_initialized = False

try:
    import cloudinary
    import cloudinary.uploader

    if cloudinary_url and cloudinary_url.startswith("cloudinary://"):
        # Configure directly via full Cloudinary environment URL
        # format: cloudinary://<api_key>:<api_secret>@<cloud_name>
        cloudinary.config(cloudinary_url=cloudinary_url, secure=True)
        conf = cloudinary.Config()
        # Verify it is not a placeholder with '<' or '>'
        if conf.cloud_name and "<" not in conf.cloud_name and conf.api_key and "<" not in conf.api_key:
            cloudinary_initialized = True
            logger.info(f"Cloudinary initialized via CLOUDINARY_URL for cloud: {conf.cloud_name}")
        else:
            logger.info("Cloudinary CLOUDINARY_URL contains placeholder values; local fallback active.")
    elif cloud_name and api_key and api_secret:
        if "<" not in cloud_name and "<" not in api_key:
            cloudinary.config(
                cloud_name=cloud_name,
                api_key=api_key,
                api_secret=api_secret,
                secure=True,
            )
            cloudinary_initialized = True
            logger.info(f"Cloudinary initialized via credentials for cloud: {cloud_name}")
        else:
            logger.info("Cloudinary credentials contain placeholder values; local fallback active.")
except Exception as e:
    logger.error(f"Failed to configure Cloudinary: {e}")


def is_cloudinary_configured() -> bool:
    return cloudinary_initialized


def upload_snapshot(frame_data: str, incident_id: str | None = None) -> str | None:
    """
    Upload a base64 encoded incident snapshot to Cloudinary.
    Falls back to saving locally in data/snapshots/ if Cloudinary is not configured.
    Returns: secure HTTPS URL of the uploaded image.
    """
    if not frame_data:
        return None

    # Ensure format is a data URI or raw base64
    if not frame_data.startswith("data:image"):
        data_uri = f"data:image/jpeg;base64,{frame_data}"
        raw_b64 = frame_data
    else:
        data_uri = frame_data
        raw_b64 = frame_data.split(",", 1)[-1]

    # 1. Attempt Cloudinary Upload if configured
    if cloudinary_initialized:
        try:
            import cloudinary.uploader

            public_id = f"incident_{incident_id}" if incident_id else None
            response = cloudinary.uploader.upload(
                data_uri,
                folder="visionguard/incidents",
                public_id=public_id,
                resource_type="image",
                transformation=[
                    {"quality": "auto:good"},
                    {"fetch_format": "auto"},
                ],
            )
            secure_url = response.get("secure_url")
            logger.info(f"Incident snapshot uploaded to Cloudinary: {secure_url}")
            return secure_url
        except Exception as e:
            logger.error(f"Cloudinary upload failed: {e}. Falling back to local snapshot storage.")

    # 2. Local Fallback: Save snapshot to disk
    try:
        snapshots_dir = Path(__file__).resolve().parent.parent.parent / "data" / "snapshots"
        os.makedirs(snapshots_dir, exist_ok=True)
        fname = f"{incident_id or 'snapshot'}.jpg"
        file_path = snapshots_dir / fname
        with open(file_path, "wb") as f:
            f.write(base64.b64decode(raw_b64))
        return f"/api/snapshots/{fname}"
    except Exception as err:
        logger.error(f"Failed to save local snapshot: {err}")
        return None
