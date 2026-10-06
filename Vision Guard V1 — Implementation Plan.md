# Vision Guard V1: Implementation Plan

Team: Peak Vision · IEEE Hackathon 2026 · PS 03.1

Version 1.0 · Status: Draft for build · Source: Vision Guard V1 Software Project Handoff

Companion documents: PRD, TRD, App Flow and UI/UX Flow.

## 1. How to use this plan

This plan turns the PRD and TRD into an ordered build. It follows the handoff's eight milestones and one rule above all others: at every milestone, camera → backend → frontend must keep working. We build the application first and plug models into it, instead of spending weeks training models before there is a product.

The handoff does not give calendar dates or team size, so this plan is ordered by milestone and exit criteria, not by days. Add dates once the team knows its available time.

## 2. Build order at a glance

- Phase 0: Repository and environment setup
- Milestone 1: Pretrained YOLO → webcam → detection → web dashboard (first demo)
- Milestone 2: Tracking → movement
- Milestone 3: Movement + person/object relationships → rule-based risk
- Milestone 4: Risk persistence → warning system (V1 MVP complete)
- Milestone 5: Custom dataset (post-V1)
- Milestone 6: Specialist action model (post-V1)
- Milestone 7: Temporal / anomaly model (post-V1)
- Milestone 8: Learned risk fusion (post-V1)

V1 ships at the end of Milestone 4. Milestones 5 to 8 are the V2/V3 roadmap and are summarised in section 9.

## 3. Phase 0: Setup

### Tasks

- Create the GitHub repository `vision-guard` as a monorepo with the layout in TRD section 5: `backend/`, `frontend/`, `data/`, `experiments/`, `docs/`, plus `.gitignore`, `README.md`, `docker-compose.yml` (can stay empty in V1).
- Add `.gitignore` entries for model weights, datasets, virtual environments, `node_modules`, and build output.
- Backend: create a Python virtual environment; add `requirements.txt` with FastAPI, Uvicorn, OpenCV, Ultralytics, NumPy, PyTorch, and a test runner such as pytest.
- Frontend: scaffold React with Vite and add Tailwind CSS.
- Add `README.md` placeholders in `backend/models/`, `data/` and `experiments/` explaining that weights and datasets are never committed.
- Agree branch and review rules: short-lived feature branches, pull requests, at least one reviewer.
- Create `docs/architecture.md` and `docs/model.md` skeletons.

### Exit criteria

- Fresh clone plus documented commands starts an empty FastAPI server and an empty React page.
- `GET /health` returns OK.

## 4. Milestone 1: first end-to-end demo

Goal: Live camera in the browser with people and objects boxed and labelled with confidence. No tracking, movement or risk yet.

Pipeline to build, exactly as the handoff's first development task:

```
webcam -> OpenCV -> pretrained YOLO -> bounding boxes -> FastAPI -> WebSocket -> React dashboard
```

### Backend tasks

1. Implement `video/stream.py` to open the webcam and yield timestamped frames; handle camera-unavailable errors.
2. Implement `detection/detector.py` with the `detect(frame)` interface wrapping a pretrained YOLO model; return class, confidence, bbox; apply the class allow-list and confidence threshold from configuration.
3. Define Pydantic schemas in `schemas/detection.py` for objects and the WebSocket message.
4. Implement `api/routes.py`: `GET /health`, `POST /session/start`, `POST /session/stop`, `GET /config`.
5. Implement `api/websocket.py`: `/ws/detection` streaming the message defined in TRD section 7.2. Risk fields can be placeholders (null or LOW) at this milestone.
6. Run the capture and inference loop so it does not block the API (background thread or task; settle this in the first spike).
7. Log model latency per frame.
8. Decide and implement the video delivery method (recommended: annotated frames streamed from the backend).

### Frontend tasks

1. Build the dashboard shell from the UI/UX document: header, video panel, status panel, objects list.
2. Add a WebSocket hook with reconnect and a connection indicator.
3. Add Start and Stop controls that call the session endpoints.
4. Render the live video and the objects list with names and confidence.

### Exit criteria

- Open the web app, press Start, see live video with boxes and labels such as Person 98% and Object 91%.
- Press Stop and the camera is released.
- No Python terminal interaction needed beyond launching the servers.
- Baseline FPS and latency recorded in `docs/model.md` on the demo hardware.

## 5. Milestone 2: tracking and movement

Goal: Persistent IDs and movement values per object.

### Tasks

1. Implement `detection/tracker.py` using an established tracker from the chosen stack (do not write one from scratch). Maintain object\_id, class, bbox, center, timestamp, velocity.
2. Implement `movement/movement_engine.py`: keep a short history of centre positions, compute displacement, velocity (using timestamps), and direction; add smoothing.
3. Extend the WebSocket schema with `id` on objects and optional movement fields (speed, direction), keeping the change backward compatible.
4. Frontend: show tracking IDs on boxes and in the objects list (for example PERSON #1, KNIFE #1) and a small movement readout.
5. Unit tests for displacement, velocity and smoothing using synthetic positions (for example from (300, 400) to (350, 450)).
6. Measure ID consistency on a short recorded clip.

### Exit criteria

- IDs stay stable while a person moves across the frame in normal conditions.
- Movement values appear in the UI and respond sensibly to fast versus slow motion.
- Tests pass and camera → backend → frontend still works.

## 6. Milestone 3: relationships and rule-based risk

Goal: A continuously updated, explainable risk score.

### Tasks

1. Implement distance calculations: person to unsafe object, person to person, and the distance trend (decreasing or increasing).
2. Create `risk/config.py` holding all weights and thresholds (object, movement, proximity, persistence, LOW/MEDIUM/HIGH cut-offs, low-confidence level). No thresholds anywhere else.
3. Implement `risk/rules.py` as small rule functions that each return a score contribution and a reason string when they fire.
4. Implement `risk/risk_engine.py`: sum contributions, normalise to 0.0 to 1.0, classify LOW/MEDIUM/HIGH, and collect reasons.
5. Add LOW CONFIDENCE handling so weak detections never produce HIGH.
6. Write risk engine unit tests: each rule, normalisation, level boundaries, low-confidence behaviour.
7. Log every risk decision (score, level, reasons).
8. Extend the WebSocket payload with `risk_score`, `risk_level`, `reasons`.
9. Frontend: risk panel with level badge, percentage score, and the reasons list.
10. Tune initial weights and thresholds on recorded clips with harmless props; write the chosen values and rationale into `docs/model.md`.

### Exit criteria

- Score updates live on the dashboard and moves in the expected direction as an object speeds up or approaches a person.
- Every displayed level has reasons.
- Risk engine tests pass.

## 7. Milestone 4: persistence and warning system (V1 complete)

Goal: Warnings that fire only when conditions persist, with a clear alert UI.

### Tasks

1. Add a rolling time window to the risk engine and a configurable minimum persistence duration.
2. Guarantee and test that a single frame can never produce HIGH.
3. Add persistence text to reasons (for example persisted for 1.3 seconds).
4. Introduce the `AlertManager` interface with one provider: dashboard alert. Add optional browser audio with a mute control.
5. Frontend: warning panel (POTENTIAL SAFETY RISK) and video overlay when HIGH is persistent; auto-clear when the condition ends; keep neutral, professional styling.
6. Add `GET /config` fields for the values the UI shows; optional minimal settings view.
7. Optional (P1): video file upload and playback as a session.
8. Robustness pass: camera disconnect, WebSocket drop and reconnect, model failure on a frame, slow-hardware frame skipping.
9. Run the testing matrix in section 8.
10. Record final FPS, latency and risk precision/recall/false-positive figures on the demo clips; update `docs/`.
11. Rehearse the MVP demo script with harmless props.

### Exit criteria (V1 success criteria)

A user can open the web app, start the camera, see live video, see detected objects, see tracking information, see movement information, see a continuously updated risk score, receive a warning when configured risk conditions persist, and understand why the warning occurred. No notebook is required.

## 8. Testing and quality plan

### 8.1 Test matrix

Run the pipeline under: normal lighting, low lighting, motion blur, partial occlusion, different camera angles, different object distances, different backgrounds, multiple people, and partially hidden objects. For each, note detection quality, tracking stability, and whether the system shows LOW CONFIDENCE instead of HIGH risk when it should.

### 8.2 Test types

- Unit: movement maths, risk rules, normalisation, persistence logic, schema validation.
- Integration: replay a recorded clip through detector, tracker, movement and risk; assert the sequence of risk levels.
- End-to-end: start backend and frontend, run a scripted demo clip, verify the dashboard shows boxes, score, warning and reasons.
- Manual exploratory: unusual angles, crowds, and everyday objects likely to cause false positives.

### 8.3 Metrics to capture

Detection precision, recall, mAP; tracking ID consistency; risk precision, recall, F1, false positive and false negative rates; FPS, inference latency, end-to-end latency, CPU/GPU utilisation.

### 8.4 Test-data safety

Use harmless props (for example a blunt kitchen utensil or a toy) and consenting participants. Never record or demo with real weapons. Do not commit recorded footage of people to the repository.

## 9. After V1: roadmap milestones

- Milestone 5, custom dataset: collect and annotate project-specific unsafe-object data, train or fine-tune a detector, compare against the pretrained baseline using the same metrics, and swap it in behind the detector interface.
- Milestone 6, specialist action model: train an independent action or interaction model (candidate data: EPIC-KITCHENS or Firearm Action Dataset) and expose it as a reusable inference component with its own reproducible script.
- Milestone 7, temporal / anomaly model: add an independent temporal model (candidate data: UCF-Crime, used as temporal anomaly data, not as object detection).
- Milestone 8, learned risk fusion: fuse specialist outputs into a learned risk layer that can eventually provide pre-incident risk and time-to-risk. Datasets are never merged; each specialist stays independently trained.

Every step after V1 must keep the working end-to-end app and use the same evaluation metrics.

## 10. Workstreams and ownership

The handoff does not name team members beyond the team leader. A suggested split, to be confirmed by the team:

- ML / vision: detector, tracker, movement engine, evaluation clips and metrics.
- Backend: FastAPI, session management, WebSocket, schemas, configuration, logging.
- Risk engine: rules, weights, persistence, tests, tuning, explanation text.
- Frontend / UX: dashboard, warning UI, audio, accessibility.
- Integration / QA / docs: end-to-end tests, demo script, `docs/` upkeep.

In a small team one person may hold several roles; the interfaces in the TRD let people work in parallel.

## 11. Definition of done (every task)

- Code follows the engineering rules in TRD section 14.
- No thresholds hardcoded outside `risk/config.py`; no weights or datasets in Git.
- Tests added or updated, and the risk engine tests pass.
- Schema changes are backward compatible and documented.
- Model latency and risk decisions are logged.
- camera → backend → frontend verified working after the change.
- Model or dataset additions documented in `docs/model.md`.

## 12. Risks to delivery and how the plan handles them

- Pretrained model lacks a good unsafe class (for example firearm): scope V1 to supported classes and state this clearly; plan custom data in Milestone 5.
- Inference too slow on demo hardware: use frame skip, lower resolution, a smaller YOLO variant; record the trade-off.
- Noisy movement causes false alerts: smoothing, persistence window, and tuned thresholds.
- Scope creep (SMS, face recognition, multi-camera): the non-goals list is binding for V1.
- Last-minute demo fragility: keep a recorded demo clip as a fallback input and rehearse the script.
- Over-investing in training early: do not start Milestone 5 until Milestone 4 exit criteria are met.

## 13. Demo plan

1. Start backend and frontend.
2. Open the dashboard and press Start; show live video and boxes (Milestone 1 capability).
3. Show IDs and movement as a person moves (Milestone 2).
4. Show the risk score staying LOW or MEDIUM when a harmless prop sits still or is far from people (Milestone 3).
5. Move the prop rapidly toward another person for a sustained moment: the score rises and POTENTIAL SAFETY RISK appears with reasons (Milestone 4).
6. Remove the condition and show the warning clearing.
7. Show a low-light or occluded case producing LOW CONFIDENCE instead of a false alarm.
8. State clearly that the system reports observable conditions only and does not infer intent, identity or criminality.

## 14. Open items to settle early

- Exact YOLO variant and supported unsafe classes.
- Video delivery method to the browser.
- Numeric thresholds and persistence duration.
- FPS and latency targets on the demo machine.
- Whether video upload is in the first V1 demo or follows after the live webcam path.
- Team roles and calendar dates.
