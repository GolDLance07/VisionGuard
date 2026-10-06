# Vision Guard V1: Technical Requirements Document (TRD)

Team: Peak Vision · IEEE Hackathon 2026 · PS 03.1

Version 1.0 · Status: Draft for build · Source: Vision Guard V1 Software Project Handoff

Companion documents: PRD (what and why), Implementation Plan (how and when), App Flow and UI/UX Flow (screens and interactions).

## 1. Purpose

This document specifies the technical design of Vision Guard V1: architecture, components, interfaces, data schemas, algorithms, configuration, testing and engineering rules. Where a value is not fixed by the handoff (for example exact thresholds), it is marked as configurable or as an open item rather than invented.

## 2. Architectural principles

1. Independent ML components. Detector, tracker, movement engine and risk engine are separate modules with clear interfaces. Each can be replaced or improved on its own.
2. One end-to-end path always works: camera → backend → frontend.
3. Do not train one giant accident-prediction model. Do not merge datasets.
4. Start with a pretrained YOLO model. Do not train a custom model until the application works end to end.
5. Experiments are separate from production. Notebook logic never lives in the production backend; a model proven in `experiments/` becomes a reusable inference component.
6. Configuration is separate from business logic. Thresholds are never hardcoded in multiple files.
7. Clean schemas between backend and frontend. Raw model internals are never sent to the browser.
8. No unnecessary infrastructure in V1. Docker may come later.

## 3. System overview

Data flows in one direction through the processing pipeline, then out to the browser.

```
CAMERA / VIDEO FILE
        |
        v
Video Processing (OpenCV frame capture)
        |
        v
Object Detector (YOLO)  -> objects + bounding boxes
        |
        v
Object Tracking         -> persistent IDs
        |
        v
Movement Engine         -> velocity, direction, displacement
        |
        v
Relationship step       -> person-object and person-person distances
        |
        v
Risk Engine             -> risk score, level, reasons (rolling window)
        |
        v
FastAPI Backend (REST + WebSocket)
        |
        v
React Web Dashboard     -> live video, risk panel, warning
```

## 4. Technology stack

### 4.1 ML and computer vision

- Python
- OpenCV: camera access, video decoding, frame handling, drawing overlays
- Ultralytics YOLO (pretrained to start): object detection and its built-in established tracker
- NumPy: numeric computation
- PyTorch: YOLO runtime

### 4.2 Backend

- FastAPI
- Uvicorn
- WebSocket support for real-time updates

### 4.3 Frontend

- React
- Vite
- Tailwind CSS

### 4.4 Communication

- WebSocket for real-time detection updates.
- REST for health checks, configuration, starting and stopping sessions, and retrieving system state.

### 4.5 Development

- Git and GitHub, monorepo
- VS Code or Antigravity
- Docker may be added later

## 5. Repository layout

```
vision-guard/
  backend/
    app/
      main.py
      api/        routes.py, websocket.py
      detection/  detector.py, tracker.py
      movement/   movement_engine.py
      risk/       risk_engine.py, rules.py, config.py
      video/      stream.py
      schemas/    detection.py
    models/       README.md   (weights stay outside Git)
    tests/
    requirements.txt
  frontend/
    src/ components/, pages/, hooks/, services/, App.jsx
    package.json, vite.config.js
  data/           README.md   (datasets never committed)
  experiments/    README.md   (notebooks live here only)
  docs/           architecture.md, model.md
  .gitignore, README.md, docker-compose.yml
```

The handoff places thresholds in `risk/config.py` or an equivalent; this TRD uses `risk/config.py`.

## 6. Component specifications

### 6.1 Video input (`video/stream.py`)

- Opens a webcam by device index or a video file by path.
- Yields frames with a monotonic timestamp. For file input, the timestamp is derived from frame index and file FPS.
- Handles camera unavailable, read failure and end-of-file by raising typed errors that the session manager converts into a status message.
- Supports a configurable frame-skip so inference can keep up with the stream on slow hardware.

### 6.2 Object detector (`detection/detector.py`)

Interface (conceptual): `detector.detect(frame)` returns a list of detections. The model is behind this interface so it can be replaced later.

Each detection contains:

```json
{
  "class": "person",
  "confidence": 0.96,
  "bbox": [120, 80, 420, 620]
}
```

Bounding box format is \[x1, y1, x2, y2\] in pixel coordinates of the processed frame.

Requirements:

- Start with a pretrained YOLO model; load weights from `backend/models/` (not in Git).
- Class filter: person plus an allow-list of unsafe classes (initially knife, scissors, and firearm only if the model supports it). The allow-list is configuration, not code.
- Confidence threshold is configurable.
- Log inference latency per frame.

### 6.3 Tracker (`detection/tracker.py`)

Purpose: persistent object IDs so movement can be understood across frames (Person #1, Person #2, Knife #1).

- Use an established tracker supported by the chosen stack (for example the tracker built into Ultralytics). Do not build a tracking system from scratch.
- Per tracked object, maintain: `object_id`, `class`, `bbox`, `center`, `timestamp`, `velocity`.
- Expire tracks after a configurable number of missed frames.
- Expose ID consistency statistics for evaluation.

### 6.4 Movement engine (`movement/movement_engine.py`)

Input: tracked objects per frame. For each object or person, keep a short history of centre\_x and centre\_y over time and estimate:

- displacement: Euclidean distance between positions. Example: from (300, 400) to (350, 450), displacement = sqrt((350-300)^2 + (450-400)^2).
- velocity: displacement divided by elapsed time, using timestamps or frame rate.
- direction: angle or unit vector of motion.

Movement values are smoothed (for example a moving average or exponential smoothing over a short window) to avoid noisy alerts. Speed should be normalised relative to frame size or object size so that results do not depend only on camera resolution; the exact normalisation is an open tuning item.

### 6.5 Person-object relationships

Computed each frame from tracked boxes and centres:

- distance(person, unsafe object)
- distance(person\_A, person\_B)
- optionally distance(object, person) trend, meaning whether it is decreasing or increasing over the rolling window

This is more informative than knowing only that an unsafe object exists somewhere in the frame.

### 6.6 Risk engine (`risk/risk_engine.py`, `risk/rules.py`, `risk/config.py`)

V1 uses an explainable rule-based engine. It is not trained.

Input signals:

- unsafe\_object\_detected
- object\_confidence
- person\_present
- object\_motion
- person\_motion
- object\_person\_distance (and its trend)
- multiple\_people
- persistence

Conceptual calculation:

```
risk_score = object_score + movement_score + proximity_score + persistence_score
```

The sum is normalised to the range 0.0 to 1.0, then classified as LOW, MEDIUM or HIGH using configurable thresholds. Individual weights and thresholds live only in `risk/config.py`. The handoff does not fix numeric values; they are tuned during Milestone 3 and 4 and recorded in `docs/model.md`.

Each rule in `rules.py` is a small function that returns a score contribution and, when it fires, a human-readable reason string. The engine collects the contributions and reasons.

Example output:

```
Risk Score: 0.82
Reasons:
- Sharp object detected
- Rapid movement detected
- Object/person distance decreasing
- Risk condition persisted for 1.3 seconds
```

### 6.7 Temporal persistence

A single frame must not trigger HIGH risk. The engine keeps a rolling time window of per-frame risk signals. HIGH is reported only when the condition holds for at least a configurable duration within that window. Illustrative sequence: frames 1 and 2 knife detected, frames 3 and 4 rapid movement, frame 5 proximity decreasing, frame 6 condition persists, result HIGH. The persistence duration is included in the reasons (for example "persisted for 1.3 seconds").

### 6.8 Low-confidence handling

If detection confidence is below the configured level, the engine returns the state LOW CONFIDENCE instead of a risk level, and never escalates to HIGH from low-confidence detections alone.

### 6.9 Alert manager (V1 minimal)

V1 implements only the path Risk Engine → UI alert, with optional browser audio. Internally the alert step is behind an `AlertManager` interface so providers (SMS, email, push, emergency contact) can be added later without touching the risk engine. No SMS or emergency-contact code is written in V1.

## 7. Backend API

FastAPI is responsible for starting camera processing, processing frames, running inference, tracking objects, calculating risk, streaming results and exposing system status.

### 7.1 Endpoints

- `GET /health`: liveness and basic status (for example model loaded, session running).
- `POST /session/start`: start a session. Body selects the source: webcam (device index) or uploaded video file reference.
- `POST /session/stop`: stop the current session and release the camera.
- `GET /config`: return the current configuration values the UI may display.
- `WebSocket /ws/detection`: stream detection and risk updates.

Upload of a video file needs a way to deliver the file to the backend. The handoff lists upload as an input but does not define the endpoint; a simple `POST /session/upload` (multipart) is proposed here and flagged as an open item.

### 7.2 WebSocket message

```json
{
  "timestamp": "2026-10-05T14:32:07.120Z",
  "objects": [
    { "id": 1, "class": "person", "confidence": 0.98, "bbox": [120, 80, 420, 620] },
    { "id": 1, "class": "knife",  "confidence": 0.93, "bbox": [300, 300, 360, 380] }
  ],
  "risk_score": 0.82,
  "risk_level": "HIGH",
  "reasons": [
    "Sharp object detected",
    "Rapid movement detected",
    "Object/person distance decreasing",
    "Risk condition persisted for 1.3 seconds"
  ]
}
```

Rules: do not send raw model internals; schemas are defined once in `schemas/detection.py` (Pydantic) and mirrored in the frontend; add fields in a backward-compatible way.

The handoff does not specify how video pixels reach the browser. Two workable options: (A) the backend streams annotated JPEG frames over the WebSocket or an MJPEG endpoint, and the dashboard draws them; (B) the browser plays the camera locally and draws boxes from the JSON stream. Option A is recommended for V1 because it also works for uploaded files and guarantees overlays match the analysed frame. This choice is recorded as a decision to confirm.

## 8. Frontend

- React with Vite, styled with Tailwind CSS.
- `services/`: REST client and a WebSocket client with reconnect.
- `hooks/`: a hook that subscribes to `/ws/detection` and exposes latest state.
- `components/`: video panel, risk panel, objects list, warning panel, controls.
- `pages/`: the main dashboard.
- The UI depends only on the API schema, never on ML internals.
- Audio alert uses the browser Audio API and a mute toggle.

## 9. Configuration

All tunable values are centralised (`risk/config.py` plus a backend settings module surfaced through `GET /config`):

- detection confidence threshold, unsafe-class allow-list, model path
- frame-skip and processing resolution
- track expiry
- smoothing window
- movement speed thresholds (rapid movement)
- proximity distance thresholds
- score weights and LOW/MEDIUM/HIGH thresholds
- persistence window and minimum persistence duration
- low-confidence threshold
- audio alert on/off

## 10. Logging and observability

- Log model latency per frame.
- Log every risk decision with score, level, reasons and timestamp.
- Record FPS and end-to-end latency counters for evaluation.
- Do not log video content or identities.

## 11. Datasets and model strategy

V1 uses a pretrained YOLO model and no custom training. Later specialists are trained independently and never merged:

- EPIC-KITCHENS: object-action understanding, hand-object interaction, action anticipation.
- Firearm Action Dataset: object-action interaction, firearm-related object recognition, temporal action understanding.
- UCF-Crime: temporal anomaly representation. It is not an object-detection dataset.
- Workplace Hazards Dataset: pre-incident hazard recognition.
- iSafetyBench: hazardous versus normal action understanding.

These eventually feed a shared Vision Guard risk-fusion layer. Datasets and model weights stay out of Git; every model and dataset is documented in `docs/model.md`, and each model has a reproducible inference script.

## 12. Performance, evaluation and testing

### 12.1 Metrics

- Detection: precision, recall, mAP.
- Tracking: ID consistency, tracking stability.
- Risk: precision, recall, F1, false positive rate, false negative rate.
- System: FPS, inference latency, end-to-end latency, CPU/GPU utilisation.
- Future: warning lead time, time-to-risk error, early detection rate.

### 12.2 Test conditions

Normal lighting, low lighting, motion blur, partial occlusion, different camera angles, different object distances, different backgrounds, multiple people, and partially hidden objects. The system must fail gracefully and show LOW CONFIDENCE rather than HIGH RISK.

### 12.3 Automated tests

- Unit tests for the risk engine are mandatory: each rule, normalisation, level thresholds, persistence behaviour, and the guarantee that one frame never yields HIGH.
- Unit tests for movement maths (displacement, velocity, smoothing).
- Schema tests for the WebSocket payload.
- Integration test: replay a short recorded clip through the pipeline and assert expected risk transitions.

## 13. Security and privacy

- No facial recognition, identification, emotion detection or intent prediction.
- Process video locally by default; do not persist frames unless explicitly enabled later.
- Restrict CORS to the frontend origin; validate uploaded file type and size.
- Keep secrets and model weights out of Git.
- Use neutral warning language: the system reports a potential safety risk based on observable conditions only.

## 14. Engineering rules (from the handoff)

1. Keep ML modules independent.
2. Keep the frontend independent from ML implementation.
3. Backend communicates through clear schemas.
4. Never hardcode risk thresholds in multiple files.
5. Log model latency.
6. Log risk decisions.
7. Keep configuration separate from business logic.
8. Write tests for the risk engine.
9. Keep model weights outside Git.
10. Never commit datasets to the repository.
11. Document every model and dataset.
12. Keep a reproducible inference script for each model.
13. Do not optimise prematurely.
14. Always maintain a working end-to-end application.

## 15. Future architecture

```
Object Specialist + Action Specialist + Pose Specialist
  + Temporal Anomaly Specialist + Safety Specialist
                    |
                    v
              Risk Fusion
                    |
                    v
          Pre-Incident Risk
                    |
                    v
             Time-to-Risk
                    |
                    v
             Alert System
```

Because V1 isolates each component behind an interface, these specialists can be added as new modules that feed a fusion layer replacing or extending the rule-based risk engine.

## 16. Open technical items

- Exact YOLO variant, supported unsafe classes, and availability of a firearm class.
- Video delivery method to the browser (annotated frames from the backend is recommended).
- Video upload endpoint design.
- Numeric values for speed, proximity, persistence and score weights.
- Speed normalisation approach (pixels per second versus relative to object or frame size).
- Target FPS and latency on demo hardware, and whether GPU is available.
- Single-threaded versus background-thread inference loop inside FastAPI, to keep the API responsive.
