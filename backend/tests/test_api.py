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


def test_update_config():
    # Update detection threshold and verify
    res = client.post("/api/config", json={"detection_confidence_threshold": 0.35})
    assert res.status_code == 200
    data = res.json()
    assert data["detection_confidence_threshold"] == 0.35

    # Revert back to 0.25
    client.post("/api/config", json={"detection_confidence_threshold": 0.25})


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


def test_incidents_api():
    # POST a new incident
    payload = {
        "riskScore": 0.88,
        "riskLevel": "HIGH",
        "title": "Weapon Brandished Incident",
        "primaryReason": "Sharp object held near person",
        "reasons": [{"rule": "holding_weapon", "score": 1.0, "details": "holding knife"}],
        "detectedClasses": ["knife (95%)"],
    }
    res = client.post("/api/incidents", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "recorded"
    assert data["incident"]["title"] == "Weapon Brandished Incident"

    # GET incidents list
    res = client.get("/api/incidents")
    assert res.status_code == 200
    incidents = res.json()["incidents"]
    assert len(incidents) >= 1
    assert any(inc["title"] == "Weapon Brandished Incident" for inc in incidents)


def test_incident_status_and_clear():
    # 1. Post an incident
    payload = {
        "riskScore": 0.90,
        "riskLevel": "HIGH",
        "title": "Status Test Incident",
        "primaryReason": "Proximity alert",
    }
    post_res = client.post("/api/incidents", json=payload)
    assert post_res.status_code == 200
    inc_id = post_res.json()["incident"]["id"]

    # 2. PATCH status (verifies SessionLocal bugfix)
    patch_res = client.patch(f"/api/incidents/{inc_id}/status", json={"status": "resolved"})
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "updated"
    assert patch_res.json()["newStatus"] == "resolved"

    # 3. DELETE /api/incidents (verifies SessionLocal bugfix)
    del_res = client.delete("/api/incidents")
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "cleared"


def test_tracker_model_resolution():
    from app.detection.tracker import Tracker
    # Initialize tracker in local (non-cloud) environment - verifies UnboundLocalError bugfix
    tracker = Tracker()
    assert tracker.model is not None


@pytest.mark.asyncio
async def test_process_client_frame_errors():
    from app.video.stream import VideoStreamManager, VideoSource
    sm = VideoStreamManager()

    # 1. Non-existent session
    frame, err = await sm.process_client_frame("non-existent-session-id", "data:image/jpeg;base64,abc", sequence=42)
    assert frame is None
    assert err is not None
    assert err["type"] == "error"
    assert err["error_code"] == "SESSION_NOT_FOUND"
    assert err["sequence"] == 42

    # 2. Invalid base64 in valid session
    session_id = sm.start_session(VideoSource(type="webcam", device_index=0))
    frame, err = await sm.process_client_frame(session_id, "corrupt_data", sequence=101)
    assert frame is None
    assert err is not None
    assert err["type"] == "error"
    assert err["error_code"] == "DECODE_ERROR"
    assert err["sequence"] == 101


def test_detected_object_untracked_schema():
    from app.schemas.detection import DetectedObject, BoundingBox
    # Verify untracked object instantiation without fabricated ID
    obj = DetectedObject(
        id=None,
        track_id=None,
        track_status="untracked",
        class_name="knife",
        confidence=0.88,
        bbox=BoundingBox(x1=10, y1=20, x2=50, y2=80)
    )
    assert obj.id is None
    assert obj.track_id is None
    assert obj.track_status == "untracked"


