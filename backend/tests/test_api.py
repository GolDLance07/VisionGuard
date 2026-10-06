import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_config():
    res = client.get("/api/config")
    assert res.status_code == 200
    data = res.json()
    assert "unsafe_classes" in data
    assert "score_weights" in data
    assert "knife" in data["unsafe_classes"]


def test_session_lifecycle():
    # Session start without params should fail 400
    res = client.post("/api/session/start", json={"source": "webcam"})
    assert res.status_code == 400

    # Start webcam session with device_index 0
    res = client.post("/api/session/start", json={"source": "webcam", "device_index": 0})
    assert res.status_code == 200
    session_id = res.json()["session_id"]
    assert session_id

    # Stop session via body
    res = client.post("/api/session/stop", json={"session_id": session_id})
    assert res.status_code == 200
    assert res.json()["status"] == "stopped"


def test_file_upload_validation():
    # Uploading a non-video text file should fail
    files = {"file": ("test.txt", b"not a video", "text/plain")}
    res = client.post("/api/session/upload", files=files)
    assert res.status_code == 400
