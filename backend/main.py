"""
Vercel FastAPI entrypoint shim.
Exports the FastAPI app instance from app.main.
"""
from app.main import app

__all__ = ["app"]
