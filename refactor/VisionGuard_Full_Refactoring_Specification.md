# Vision Guard — Full Refactoring Specification
## Architecture, file-by-file disposition, implementation plan, model strategy, and deployment contract

**Document type:** Engineering handoff / source-of-truth refactor plan  
**Project:** Vision Guard — Context-Aware Visual Safety Monitoring  
**Repository reviewed:** Latest supplied Vision Guard source snapshot  
**Current model candidates:** `yolov8n.pt`, `yolov8s.pt`  
**Additional data received:** short MP4 clips and a Roboflow YOLOv8 weapon-detection dataset  
**Primary goal:** make the existing software reliable, testable, understandable, and deployable without discarding useful work.

---

## 0. Executive decision

We are refactoring the whole codebase, but **not rebuilding from an empty repository**. The current project already contains a real React dashboard, a FastAPI backend, WebSocket streaming, a tracking/movement/risk pipeline, incident history, storage integrations, tests, and training utilities. Those are assets. The problem is that responsibilities overlap and the contracts between them are not strict enough.

The refactor will establish:

1. **One configuration source of truth** for API URLs, model selection, thresholds, source types, and feature flags.
2. **One inference pipeline** used by webcam frames and uploaded video.
3. **Per-session tracking and movement state**, even if model weights are shared.
4. **One versioned request/response contract** between backend and frontend.
5. **One explicit deployment topology** with a documented local path and a documented production path.
6. **Visible failures** instead of silent `None` returns, fake IDs, hidden storage fallbacks, or misleading “connected” states.
7. **Separate measurements** for detection accuracy, tracking quality, risk-event quality, and runtime performance.
8. **A clean distinction between development/training artifacts and production inference.**

### First release scope

The first stable release is not an accident-prediction research system. It is a usable real-time application that can:

- Open a browser webcam or accept a supported uploaded video.
- Send frames to the backend safely.
- Detect supported classes using a known model checkpoint.
- Track detections over time with real IDs when available.
- Calculate movement features.
- Calculate a transparent **heuristic risk score** with reasons.
- Show the live feed, bounding boxes, objects, score, reasons, connection state, and performance.
- Record/review incidents if durable storage is configured.
- Stop and clean up sessions predictably.

**Do not add more model branches, external emergency notifications, or accident anticipation until this baseline works and is measured.**

### Product safety boundary

Vision Guard describes observable visual objects and potential physical safety conditions. It must not infer a person's identity, personality, intent, criminality, or guilt. An object detection or a high heuristic score is not proof that an incident or crime is occurring. The UI should use language such as **“potential safety risk”**, show evidence/reasons, and keep an operator in control.

---

## 1. Audit scope and confidence

This specification is based on static inspection of the supplied source snapshot, its configuration, existing tests, and project documentation. Static review can establish code-level issues and architecture risks. It cannot prove the exact cause of a runtime failure without the actual local environment, browser network trace, backend logs, and deployment resource measurements.

- **Confirmed** means directly visible in the source.
- **Likely risk** means the current design can cause the stated failure, but a runtime reproduction is needed.
- **Verify** means the source alone cannot establish behavior in the user's environment.

Do not turn any item marked “verify” into a claim of a reproduced production bug.

---

## 2. Current repository inventory

### Backend

- `backend/app/main.py`: FastAPI app construction, lifespan, CORS, health, router mounting.
- `backend/app/api/routes.py`: session start/stop, upload, cloud status, incident endpoints, configuration endpoints.
- `backend/app/api/websocket.py`: real-time detection WebSocket and aliases.
- `backend/app/detection/detector.py`: separate YOLO detector wrapper.
- `backend/app/detection/tracker.py`: model loading, Ultralytics tracking, class filtering/smoothing, optional weapon/pose logic.
- `backend/app/video/stream.py`: sessions, server-side video capture, browser-frame decoding, inference orchestration, frame encoding, telemetry.
- `backend/app/movement/movement_engine.py`: position history, movement estimates, direction and speed.
- `backend/app/risk/config.py`: defaults and mutable risk configuration.
- `backend/app/risk/rules.py`: interpretable risk rules.
- `backend/app/risk/risk_engine.py`: weighted risk aggregation, persistence, level.
- `backend/app/risk/alert_manager.py`: alert-provider abstraction.
- `backend/app/schemas/detection.py`: detection, bounding box, movement/risk response schemas.
- `backend/app/db/database.py`: SQLAlchemy engine/session initialization and database URL handling.
- `backend/app/db/models.py`: incident persistence model.
- `backend/app/db/cloudinary_service.py`: snapshot upload integration.
- `backend/train_weapons.py`, `experiments/train_weapon_yolo.ipynb`: training workflow.
- `backend/tests/`: API, movement, and risk tests.
- `backend/Dockerfile`, `backend/Procfile`, `docker-compose.yml`: runtime packaging/deployment.

### Frontend

- `frontend/src/App.jsx`: top-level state, tabs, session calls, WebSocket data, incident grouping, snapshots, settings, and theme.
- `frontend/src/config.js`: API/WebSocket URL selection.
- `frontend/src/hooks/useDetectionWebSocket.jsx`: socket lifecycle, frame sending, reconnect.
- `frontend/src/components/VideoPanel.jsx`: camera lifecycle, video upload/session controls, frame sending, SVG overlays, snapshot/export UI.
- `Header.jsx`: navigation, connection state, sound/voice/theme/settings controls.
- `SubHeaderTelemetry.jsx`: session/status strip and preview/demo controls.
- `WarningPanel.jsx`: warning/acknowledge/silence UI.
- `RiskPanel.jsx`: score and risk level.
- `ExplainabilityFeed.jsx`: rule reasons.
- `ObjectsList.jsx`: detected object list.
- `ThresholdTuningCard.jsx`: in-dashboard parameter tuning.
- `IncidentHistory.jsx`: incident list, filters/details/review/status/export.
- `SafetyTelemetryView.jsx`: telemetry/diagnostic view.
- `SettingsModal.jsx` and `SettingsView.jsx`: overlapping configuration experiences.
- `main.jsx`, `index.css`, Tailwind/Vite configuration: app bootstrap/build/style.
- `frontend/Dockerfile`, `frontend/nginx.conf`, `vercel.json`: deployment options.

### Documentation

The repository has README, PRD, TRD, App Flow, Implementation Plan, `Context1.md`, `AGENTS.md`, architecture/model docs, and a previous audit document. These are useful input, but some overlap. This document becomes the active refactor specification. Once implementation stabilizes, consolidate older docs and mark superseded material rather than maintaining conflicting instructions.

---

## 3. Confirmed problems and decisions

### 3.1 Render is hardcoded into local UI copy

**File:** `frontend/src/components/VideoPanel.jsx`, around lines 718–721.

The UI says `CONNECTING TO AI PIPELINE (RENDER CLOUD)...` when a session exists but no frame has arrived. That text is unconditional with respect to the actual URL. It is misleading when running locally.

**Decision:** remove provider-specific text. Render connection state from real state:
- `Starting session`
- `Waiting for WebSocket`
- `Connected — waiting for first inference result`
- `Receiving detections`
- `Inference error`
- `Session expired`
- `Disconnected / reconnecting`

Only show a host/provider label if it is computed from the resolved URL and is genuinely useful.

### 3.2 Render is also a fallback URL in frontend config

**File:** `frontend/src/config.js`.

The code has hardcoded `DEFAULT_CLOUD_API` and `DEFAULT_CLOUD_WS` values. Environment variables are checked before local-host detection, so a local `.env` value can override the expected local proxy behavior.

**Decision:** explicit modes, no accidental remote fallback:
- `VITE_API_BASE_URL` empty in local Vite mode means same-origin `/api/v1`.
- `VITE_WS_BASE_URL` empty in local Vite mode means same-origin `ws://localhost:5173/ws`.
- Production must provide the API and WebSocket base URLs explicitly if cross-origin.
- Never silently fall back to a personal/cloud hostname.
- Add a development startup log showing the resolved REST and WebSocket target (do not print secrets).

### 3.3 REST routes are mounted twice

**File:** `backend/app/main.py`.

The same REST router is included with `/api` and without a prefix, producing duplicate public endpoints. The WebSocket also has multiple aliases (`/ws/detection`, `/detection`, `/api/ws/detection`, `/api/detection`).

**Decision:** canonical routes only:
- REST prefix: `/api/v1`
- WebSocket: `/ws/v1/detection`
- Health: `/health/live`, `/health/ready`
- Any legacy aliases must be temporary, tested compatibility shims with a removal date.

### 3.4 Inference and tracking responsibilities overlap

**Files:** `backend/app/detection/detector.py`, `backend/app/detection/tracker.py`, `backend/app/video/stream.py`.

The detector wrapper exists, but the live pipeline calls `Tracker.track()` which performs model inference itself. The tracker also owns model loading, filtering, class smoothing, optional model branches, and track association.

**Decision:** introduce a single `VisionPipeline.process(frame, session_state)` boundary. The detector, tracker, movement engine, and risk engine become distinct components called by that pipeline. Remove the old detector wrapper only if it is truly unused after migration and tests prove that no behavior is lost.

### 3.5 Missing tracking IDs are replaced by frame-order IDs

**File:** `backend/app/detection/tracker.py`.

When Ultralytics returns no tracker IDs, the code assigns IDs based on the order of boxes in the current frame. These are not persistent identities and can jump between objects.

**Decision:** never label frame-order indexes as real track IDs. Return `track_id: null` and `track_status: "untracked"` if association failed; log the failure. Validate ByteTrack integration on consecutive frames.

### 3.6 Model path/config are not authoritative

**Files:** `backend/app/detection/tracker.py`, `backend/app/risk/config.py`, frontend settings.

The runtime model choice is based partly on environment heuristics (including presence of `PORT`), while the settings API/UI can expose `model_path`. These can disagree. The global loader also returns `None` for the custom weapon and pose model in the reviewed path, so the associated supplementary branches are not actually active.

**Decision:** a typed settings object resolves one explicit detector checkpoint and its task/class mapping. The API reports the actual loaded model, not just the requested path. Optional specialists are not loaded until explicitly enabled and integrated.

### 3.7 Inference exceptions are hidden from the client

**File:** `backend/app/video/stream.py`.

A frame inference error is logged and the method returns `None`; the WebSocket then sends no result for that frame. The browser camera can remain active while the UI appears to hang.

**Decision:** use structured error/status messages with session ID, sequence number, error code, and safe user-facing message. Include traceback in server logs, not in public responses.

### 3.8 Frontend backpressure has a send-state bug

**File:** `frontend/src/components/VideoPanel.jsx`.

The webcam loop sets its in-flight flag before checking the boolean result of `sendFrame()`. If the socket is not open, the flag remains set until the watchdog expires.

**Decision:** set the in-flight state only after a successful send. Prefer a server acknowledgment containing the input frame sequence number. Use a single-flight policy initially: at most one frame in flight per session.

### 3.9 Camera capture and server-side camera capture are mixed

**Files:** `frontend/src/components/VideoPanel.jsx`, `backend/app/video/stream.py`, `backend/app/api/websocket.py`.

The browser camera uses `getUserMedia()` and sends frames to the backend. A separate server-side `cv2.VideoCapture(0)` webcam path also exists. The latter cannot access a remote user's laptop camera from a cloud container.

**Decision:** first-release sources are:
- `browser_camera`: browser owns the physical webcam; frames go to backend over WebSocket.
- `uploaded_video`: validated upload ID; backend decodes video.
- `server_camera`: optional local/edge-only feature, disabled in cloud deployments and not exposed as the default web-camera mode.

### 3.10 Risk settings have overlapping controls and mismatched defaults

**Files:** `frontend/src/components/SettingsModal.jsx`, `SettingsView.jsx`, `ThresholdTuningCard.jsx`, `backend/app/risk/config.py`.

There are two full settings experiences plus a tuning card. Their defaults/field names differ. For example, a control may expose a parameter that is not consumed by the active rule or may use a different key scheme from the backend.

**Decision:** one typed backend `RiskConfig`, one primary settings view, and a compact live-tuning card only for parameters that are safe and genuinely implemented. The backend validates values and returns the effective config.

### 3.11 Risk scores are heuristics, not learned probabilities

**Files:** `backend/app/risk/risk_engine.py`, `rules.py`, `movement_engine.py`.

The risk engine combines weighted rules, movement, proximity, and persistence. Coordinates and speeds are derived from image space, so values depend on camera framing/resolution/perspective.

**Decision:** name the output `heuristic_risk_score` or clearly document it as a heuristic. Do not call it accident probability or prediction confidence. Normalize coordinates, document units, version rules, expose contributing reasons, and validate on labeled normal/risk scenarios.

### 3.12 Incident persistence can report success after failure

**Files:** `backend/app/api/routes.py`, `backend/app/db/database.py`.

The API falls back to in-memory storage when database operations fail, and can still return a success-shaped response. Memory fallback is fine for local demo mode but can silently lose records on restart in production.

**Decision:** explicit storage modes:
- `development`: optional in-memory fallback with a clear `storage_mode: "memory"` indicator.
- `production`: durable DB required if incident persistence is enabled; failures return explicit errors/degraded health.
- Snapshot object storage is independent from incident metadata persistence.

### 3.13 Upload/session lifecycle is underspecified

The backend writes uploads to local storage and stores sessions in a process-local dictionary. Temporary uploads and sessions need TTL/cleanup, size limits, decode validation, and clear behavior on process restart.

**Decision:** generated upload IDs only; validate actual media decoding; cap upload size; session TTL; cleanup on stop/expiry; document process-local session limits. Do not accept arbitrary client filesystem paths.

### 3.14 Dataset classes need review before training

The supplied Roboflow Weapon Detection v1 dataset declares eight classes:
`0`, `1`, `2`, `Gun`, `Guns`, `Handgun`, `Knife`, `Rifle`.

Classes 0–2 are semantically unnamed in the exported `data.yaml`; some firearm labels may overlap. The archive has train/validation but no independent test split. Therefore, **do not start training until class meanings are recovered/reviewed and an independent test split is created**.

The short-video archive previously supplied contains ten MP4 entries but only four unique files by byte hash. Deduplicate and use these as a separate deployment-domain/evaluation sample after the scenarios are labeled. Do not automatically use them for training.

---

## 4. Target architecture

### 4.1 System overview

```text
React/Vite Dashboard
  ├─ Browser Camera Adapter (getUserMedia)
  ├─ Upload UI
  ├─ WebSocket client + bounded frame sender
  ├─ Video overlay / object list / risk reasons
  ├─ Session state / diagnostics
  └─ Incident review
          |
          | REST: sessions, uploads, config, incidents
          | WebSocket: frames and telemetry
          v
FastAPI Application
  ├─ Settings / configuration validation
  ├─ Session API
  ├─ Upload API
  ├─ WebSocket protocol handler
  ├─ Session manager (per-session state)
  └─ VisionPipeline
       ├─ Model registry / detector
       ├─ Tracker (isolated session state)
       ├─ Movement feature engine
       ├─ Risk rules + temporal persistence
       └─ Alert/event manager
          |
          ├─ PostgreSQL (incident metadata, optional but durable)
          └─ Object storage (selected incident snapshots only)
```

### 4.2 Boundaries

- **Frontend:** camera permission, frame capture, rendering, controls, operator review. It does not calculate the authoritative risk score.
- **API layer:** validation, authentication/authorization if added, lifecycle, error mapping. It does not implement model math.
- **Session manager:** owns per-session source, tracker state, movement history, risk persistence, counters, cancellation.
- **Vision pipeline:** calls detector/tracker/movement/risk in a fixed order and returns a typed result.
- **Model registry:** loads a model once per configured runtime/worker, reports model identity/class names, manages device and warm-up.
- **Risk engine:** deterministic and testable; consumes validated features, returns score/level/reasons/rule version.
- **Persistence:** stores incident metadata and selected evidence references; does not control live inference.
- **Training code:** offline development workflow; never executes as part of API startup.

### 4.3 Suggested target structure

This is a direction, not a demand to move every file immediately. Stabilize behavior first, then migrate incrementally.

```text
vision-guard/
  backend/
    app/
      main.py
      core/
        settings.py
        logging.py
        errors.py
      api/
        health.py
        sessions.py
        uploads.py
        websocket.py
        config.py
        incidents.py
      schemas/
        common.py
        session.py
        detection.py
        risk.py
        incident.py
      video/
        session_manager.py
        pipeline.py
        sources/
          browser_frames.py
          uploaded_video.py
          server_camera.py       # optional local/edge only
      vision/
        model_registry.py
        detector.py
        tracker.py
        specialists/              # empty until a validated need exists
      movement/
        movement_engine.py
      risk/
        config.py
        rules.py
        risk_engine.py
        alert_manager.py
      persistence/
        database.py
        incident_repository.py
        snapshot_storage.py
    tests/
      unit/
      integration/
      contracts/
      fixtures/
    requirements.txt
    Dockerfile
  frontend/
    src/
      app/
        App.jsx
      components/
      hooks/
        useVisionSession.js
        useBrowserCamera.js
        useDetectionWebSocket.js
        useIncidents.js
      services/
        apiClient.js
        detectionSocket.js
        incidentService.js
      config/
        runtimeConfig.js
  data/
    README.md
    manifests/
  models/
    README.md
  experiments/
    README.md
  docs/
    architecture.md
    api-contract.md
    deployment.md
    model-evaluation.md
    refactor-checklist.md
  docker-compose.yml
  .env.example
  README.md
```

Keep the current paths during the first stabilization phases. Moving files and fixing runtime behavior in the same giant change makes regressions much harder to locate.

---

## 5. Frontend refactor — every current functional area

### 5.1 `App.jsx`

**Current responsibility:** top-level tabs and shared UI state, session start/stop, configuration fetching, WebSocket telemetry, automatic high-risk incident grouping, incident synchronization, snapshot creation, cooldown timer, theme, sound/voice toggles, settings modal, and error handling.

**Decision: keep the component and visual composition, reduce its responsibilities.**

Move behavior gradually:
- Session lifecycle → `useVisionSession`.
- Camera lifecycle → `useBrowserCamera`.
- API calls → `apiClient`.
- Incident creation/loading/status → `useIncidents`/`incidentService`.
- WebSocket state → `useDetectionWebSocket`.
- Theme/audio preferences may remain in app-level state initially.

Remove duplicated incident side effects from the component only after the replacement has tests. Incident grouping should have a deterministic event identity/cooldown policy and must not create a new database row on every high-risk frame.

### 5.2 `VideoPanel.jsx`

**Current responsibility:** source selection, camera permission, browser video element, frame capture/canvas, upload, session controls, frame sending, connection UI, SVG overlay, snapshot/export, and several tracking visualizations. It is very large and is the highest-priority frontend decomposition target.

**Keep the user-visible functionality; separate the implementation into:**
- `VideoViewport`: video element and SVG/canvas overlay.
- `BoundingBoxOverlay`: actual detection rectangles, labels, track status.
- `MovementOverlay`: optional velocity arrows/relationships.
- `CameraSourceControls`: source selection and permission state.
- `VideoUploadControl`: upload and validation/progress.
- `SessionControls`: start/stop and lifecycle states.
- `useBrowserCamera`: owns media stream, frame capture, track cleanup.
- `useFrameSender`: bounded sending/backpressure and sequence IDs.
- `incidentExportService`: ZIP export only if this capability remains useful.

Do not redesign the visuals first. First make the data and state contracts correct.

**Required behavior:**
- Show the local camera preview even if the backend is disconnected, but label the two states separately.
- Draw actual bounding rectangles from normalized/known frame coordinates.
- Keep overlay coordinate mapping aligned with the rendered video aspect ratio; avoid hardcoded `viewBox` assumptions that distort boxes when the camera frame ratio changes.
- Use real track IDs; visibly label an object `untracked` when no stable ID exists.
- Do not show fake fallback risk scores such as `0.84` when no inference result exists.
- Only show “surveillance active” after real frame responses arrive.
- Stop media tracks and timers on stop, source change, session loss, and unmount.
- Only set an in-flight flag after a frame is successfully sent.
- Bound the queue: one in-flight frame initially; drop stale frames rather than building latency.

### 5.3 `useDetectionWebSocket.jsx`

**Decision: keep the hook, refactor its protocol and lifecycle.**

It should:
- Connect only when an explicit valid session ID exists.
- Use one canonical URL builder.
- Parse typed message variants: `frame`, `status`, `error`, `session_ended`, `pong`.
- Track `connecting`, `connected`, `receiving`, `reconnecting`, `error`, `disconnected`.
- Record `lastMessageAt`, `lastFrameSequence`, and `lastError`.
- Use bounded exponential backoff for transient network failures.
- Never silently create a new session when the server says the old session is missing.
- Clear reconnect timers and close the socket during cleanup.
- Distinguish deliberate close from server/session failure.
- Avoid sending frames when `readyState !== OPEN` and report that the send did not occur.
- Add a heartbeat/timeout if the selected host requires it.

### 5.4 `config.js`

**Decision: keep the concept but make it the only URL/config resolver.**

Use `VITE_API_BASE_URL` and `VITE_WS_BASE_URL`:
- Empty in local Vite mode means same-origin `/api/v1` and `/ws/v1`.
- Explicit production URLs are required for cross-origin hosting.
- No hardcoded Render URL.
- No environment detection that unexpectedly overrides the developer's chosen values.
- Validate `http/https` and `ws/wss` scheme compatibility.
- Export one `getRuntimeConfig()` result for diagnostics.

### 5.5 `Header.jsx`

**Keep.** Preserve navigation, connection status, theme, sound/voice, settings access. Every toggle must be functional and accessible. Show actual connection status, not decorative status.

### 5.6 `SubHeaderTelemetry.jsx`

**Keep selectively.** Preserve useful source/session/status summaries. Demo/preview states must be explicitly marked `DEMO`; they must never be presented as model-generated events.

### 5.7 `WarningPanel.jsx`

**Keep.** Tie it to the backend's current risk state and alert events. Acknowledge/silence should affect the operator UI/audio only, not erase risk state or alter model calculations. Include timestamps and clear the warning when the state machine transitions back to a lower risk.

### 5.8 `RiskPanel.jsx`

**Keep.** Label score as a heuristic score until calibrated against a labeled event dataset. Never label it “probability of an accident.” Show risk level and concise reasons separately from detector confidence.

### 5.9 `ExplainabilityFeed.jsx`

**Keep.** Render only reasons supplied by the backend's versioned risk contract. Avoid invented natural-language causality. Display rule ID, short explanation, and relevant evidence values when available.

### 5.10 `ObjectsList.jsx`

**Keep.** Show class, detector confidence, bounding box/track status, and stable track ID where available. Separate object confidence from risk score. Handle empty, untracked, stale, and low-confidence states.

### 5.11 `ThresholdTuningCard.jsx`

**Keep only after the config schema is fixed.** Restrict it to supported live-safe parameters. Each field must include units and range. If the backend does not consume a field, remove the control. Saving must show the effective values returned by the backend.

### 5.12 `SettingsModal.jsx` and `SettingsView.jsx`

**Consolidate into one settings implementation.** Retain unique useful controls, remove duplicate fields, fake model choices, nonfunctional backend-engine controls, and defaults that disagree with the backend. A model change should not be a free-form path string unless safe model registry validation exists. Prefer a server-reported list of available models.

### 5.13 `IncidentHistory.jsx`

**Keep the feature.** It provides useful incident review/history capability, but should use `incidentService` instead of inline fetch calls. Break into meaningful subcomponents only after behavior is covered:
- incident list/table
- filters/search
- detail drawer
- evidence viewer
- status/review actions
- export/download

Persist status changes through the backend and handle `404`, `409`, and storage errors. Do not imply a snapshot is stored when only an in-memory base64 string exists.

### 5.14 `SafetyTelemetryView.jsx`

**Keep if values are real.** Show processed FPS, inference latency, dropped frames, current model, source type, WebSocket state, frame count, and storage state from backend telemetry. Remove/relabel simulated metrics. Do not call a local rolling browser history “backend telemetry” if it is only collected in the browser.

### 5.15 `Controls.jsx` / duplicated controls

If the current snapshot has a separate `Controls.jsx` or duplicate upload/session UI in another branch, inspect imports and routes. Remove it only after proving the active `VideoPanel` path replaces its behavior and tests cover the flow. No dead-code deletion based only on file names.

### 5.16 Frontend services/hooks to add

- `services/apiClient.js`: one `fetch` wrapper with base URL, JSON handling, timeouts where appropriate, and typed errors.
- `services/incidentService.js`: incident CRUD/status/evidence references.
- `hooks/useVisionSession.js`: session start/stop/status and source selection.
- `hooks/useBrowserCamera.js`: permission, media stream, cleanup.
- `hooks/useDetectionWebSocket.js`: socket lifecycle/protocol.
- `hooks/useIncidents.js`: UI-facing incident state.
- `services/exportService.js`: optional incident-package export.

These are responsibility boundaries, not an excuse to create a large abstraction layer. Add them only as each responsibility is migrated.

---

## 6. Backend refactor — file-by-file disposition

### 6.1 `backend/app/main.py`

**Keep.** It remains the application entry point.

Change:
- One canonical router registration.
- Narrow CORS to configured frontend origins; no wildcard credentials.
- Add `/health/live` (process is alive) and `/health/ready` (configuration/model/storage readiness).
- Initialize models in a controlled lifespan/startup service or lazy registry with explicit health state.
- Stop all sessions and release resources during shutdown.
- Emit structured startup diagnostics: runtime mode, resolved model, device, DB mode, API version.
- Avoid marking the app ready if the required model cannot load.

### 6.2 `backend/app/api/routes.py`

**Keep the API functionality, split by domain after stabilization.**

Move toward:
- `sessions.py`: start/stop/status.
- `uploads.py`: upload/validation/cleanup.
- `config.py`: read/update effective configuration.
- `incidents.py`: list/create/status/delete.
- `health.py`: liveness/readiness.
- `websocket.py`: only the real-time protocol.

Use Pydantic request models instead of untyped `dict` payloads. Use a shared DB dependency or repository for every DB operation. Never return `"recorded"` if the configured durable persistence failed. Validate incident status values and distinguish “not found” from “updated.”

### 6.3 `backend/app/api/websocket.py`

**Keep the WebSocket transport, simplify routes and protocol.**

- Canonical route: `/ws/v1/detection?session_id=...`.
- Validate the session before accepting frame traffic.
- Do not auto-create missing sessions after process restart; send a session-expired error/close code.
- Validate incoming message type, sequence number, encoded frame size, and payload.
- Send one typed response per accepted frame or an explicit error.
- Apply frame backpressure and message size limits.
- On disconnect, stop browser-frame ingestion and clean up the session according to session lifecycle policy.
- Do not expose raw exception text to the browser.
- Avoid a separate behavior branch whose contract differs from the main browser path without explicit source-type typing.

### 6.4 `backend/app/video/stream.py`

**Keep the session/pipeline orchestration concept, but this file must be decomposed.**

It currently handles source capture, process-local sessions, OpenCV decode, resize, inference invocation, movement, risk, FPS, JPEG encoding, base64, alerts, and stream iteration. That is too much in one module.

Refactor into:
- `SessionManager`: create/get/stop/expire sessions.
- `BrowserFrameSource`: validate/decode client JPEG frames.
- `UploadedVideoSource`: server-side OpenCV decoding from a server-generated upload ID.
- `VisionPipeline`: detector/tracker/movement/risk sequence.
- `TelemetryCollector`: latency/FPS/dropped-frame counters.
- `EvidenceService`: capture/store a selected frame only when required.
- `DetectionFrame` schema: standardized output.

Avoid sending a base64 JPEG with every response if it is unnecessary. The browser already has the camera video; telemetry can contain detections and sequence IDs. For uploaded video, either return a separately encoded preview frame or use a deliberate frame-stream mechanism. Measure before choosing.

### 6.5 `backend/app/detection/tracker.py`

**High-priority refactor.** It currently combines model loading, detection, tracking, class filtering/smoothing, weapon matching, pose matching, and person-object association.

Target separation:
- `ModelRegistry`: resolve/load checkpoint, expose names/device/version, fail clearly.
- `ObjectDetector`: one forward/inference interface.
- `ObjectTracker`: persistent tracker per session; returns genuine track IDs.
- `SpecialistModel` interfaces: optional later; no placeholder models loaded in the MVP.
- `VisionPipeline`: orchestrates all of them.

Requirements:
- Resolve the model path once, absolutely, from typed configuration.
- Do not choose a model based on the incidental presence of `PORT`.
- Keep shared immutable model weights separate from mutable per-session tracking state.
- Never synthesize persistent IDs from list position.
- Do not silently `except: pass` around model inference or matching logic.
- Keep the raw detection result available to diagnostic logging before unsafe-class filtering.
- Use class IDs/names from the loaded model's actual metadata.
- Add model load/inference failure health state and latency logging.
- Use `torch.inference_mode()` only where supported/appropriate.
- Test CPU execution as the default free-hosting baseline.
- Do not load pose/weapon specialists until configured and actually used.

### 6.6 `backend/app/detection/detector.py`

**Use it or remove it after migration.** It currently duplicates detector responsibilities with the tracker. Prefer retaining it as the single detector adapter used by `VisionPipeline`. Remove only if all relevant behavior is migrated and tests show no import/use remains.

### 6.7 `backend/app/movement/movement_engine.py`

**Keep.** Add:
- explicit normalized coordinate conventions;
- documented pixel/normalized units;
- timestamp-based velocity;
- track-loss grace period for short occlusion;
- bounded history per session;
- state reset on session end;
- robust behavior for missing IDs, empty detections, timestamp gaps, and resolution changes;
- tests for stationary/moving objects, direction changes, occlusion, and track ID reuse.

Do not infer real-world physical distance/speed from image-space pixels without camera calibration.

### 6.8 `backend/app/risk/rules.py`

**Keep as a transparent baseline.** Each rule must define inputs, units, threshold, score contribution, and explanation. Avoid hard-coded magic numbers spread across functions. No rule should claim intent, aggression, or criminality. Normal handling of knives/tools must be included in validation data to expose false alarms.

### 6.9 `backend/app/risk/risk_engine.py`

**Keep but split scoring from temporal state if needed.**
- Pure function for per-frame score/reasons.
- Per-session temporal state machine for persistence/cooldown.
- One authoritative risk-level enum.
- Rule/config version in every result.
- Configurable, validated cutoffs.
- No probability claims until calibrated.
- Tests for score monotonicity, empty frame, low confidence, persistence, cooldown, and repeated events.

### 6.10 `backend/app/risk/config.py`

**Keep schema; remove accidental mutable-singleton semantics where practical.** Use Pydantic settings/config models. Validate confidence `[0,1]`, nonnegative thresholds, allowed classes, weights, level cutoffs, persistence, frame skip, and processing resolution. Return effective config from the API. Updates should be atomic and should not mutate a running session unexpectedly unless that behavior is explicitly supported.

### 6.11 `backend/app/risk/alert_manager.py`

**Keep the provider abstraction.** The current log provider should be clearly named as a log/dashboard event provider. Do not claim SMS/emergency notification exists unless an actual provider is configured, verified, rate-limited, and tested. Add deduplication/cooldown and incident event IDs before external notifications.

### 6.12 `backend/app/schemas/detection.py`

**Keep as the contract starting point.** Split schemas only if doing so improves clarity. Define:
- bounding box coordinate space;
- nullable/real track IDs and tracking status;
- class name and confidence;
- risk score/level/reasons/rule version;
- source/session/frame sequence/timestamp;
- performance and model metadata;
- structured error/status events.

Do not let webcam and uploaded-video paths emit materially different payload meanings.

### 6.13 `backend/app/db/database.py` and `models.py`

**Keep.**
- Choose one supported SQLAlchemy driver for production configuration; avoid redundant drivers unless a specific URL format requires them.
- Use one dependency/session lifecycle.
- Do not silently swap to ephemeral SQLite in production.
- Make schema initialization/migrations explicit; use migrations if schema evolves beyond a simple demo.
- Add persistence tests for create/list/status update/delete and database failure.
- Avoid JSON-string columns if structured DB types are supported by the chosen database, but do not migrate columns until tests/data migration are planned.

### 6.14 `backend/app/db/cloudinary_service.py`

**Keep optional.** Treat it as image/object storage, not the incident database. Upload selected incident evidence only. Make upload failure independent from incident metadata persistence, and define retention/access policies. Do not upload every video frame.

### 6.15 Training files

- `backend/train_weapons.py`: keep as an offline training script; make paths/parameters reproducible and write a run manifest.
- `experiments/train_weapon_yolo.ipynb`: keep for exploration, not production startup.
- `backend/models/README.md`: update with exact expected checkpoint locations, provenance, classes, hashes/versions, and safe download instructions.
- Model files should not be committed to Git unless intentionally using a suitable artifact strategy; do not put private data/secrets in the repository.

### 6.16 Existing tests

Keep `test_api.py`, `test_movement.py`, and `test_risk_engine.py`. Expand them. Do not rewrite tests just to match a new implementation; tests must preserve meaningful behavior and expose bugs.

---

## 7. Canonical API and message contracts

The frontend and backend must be migrated together. Avoid unversioned ad hoc JSON.

### 7.1 REST routes

| Method | Canonical route | Purpose |
|---|---|---|
| GET | `/health/live` | Process is alive |
| GET | `/health/ready` | Required runtime dependencies are ready |
| GET | `/api/v1/config` | Return effective config and active model metadata |
| PATCH | `/api/v1/config` | Validate and update supported config fields |
| POST | `/api/v1/sessions` | Create session with `source_type` |
| GET | `/api/v1/sessions/{session_id}` | Current session state |
| POST | `/api/v1/sessions/{session_id}/stop` | Stop session and clean up resources |
| POST | `/api/v1/uploads` | Upload/validate video; return generated `upload_id` |
| GET | `/api/v1/incidents` | List persisted incidents |
| POST | `/api/v1/incidents` | Create an incident record |
| PATCH | `/api/v1/incidents/{incident_id}` | Update review status/metadata |
| DELETE | `/api/v1/incidents` | Clear incidents only when authorized/confirmed |

Do not keep duplicate `/config`, `/api/config`, `/api/v1/config` variants indefinitely. Choose canonical routes, update all clients, and remove old aliases after tests.

### 7.2 Session request example

```json
{
  "source_type": "browser_camera",
  "settings_profile": "default"
}
```

For uploaded video:

```json
{
  "source_type": "uploaded_video",
  "upload_id": "server-generated-opaque-id"
}
```

The browser must not send arbitrary server file paths or device indices for its own webcam.

### 7.3 WebSocket protocol

Canonical endpoint: `/ws/v1/detection?session_id=<id>`

Browser sends:

```json
{
  "type": "frame",
  "sequence": 123,
  "captured_at": 1790000000.123,
  "encoding": "jpeg-base64",
  "data": "<encoded-frame>"
}
```

Server responds with one of:

```json
{
  "type": "frame_result",
  "schema_version": "1.0",
  "session_id": "opaque-session-id",
  "sequence": 123,
  "timestamp": 1790000000.2,
  "source_type": "browser_camera",
  "objects": [
    {
      "track_id": 7,
      "track_status": "tracked",
      "class_name": "person",
      "confidence": 0.94,
      "bbox": {"x1": 10, "y1": 20, "x2": 100, "y2": 220}
    }
  ],
  "risk": {
    "score": 0.42,
    "level": "MEDIUM",
    "is_heuristic": true,
    "rule_version": "v1",
    "reasons": []
  },
  "performance": {
    "inference_latency_ms": 42.5,
    "processed_fps": 12.0,
    "dropped_frames": 0
  },
  "model": {
    "name": "yolov8n",
    "version": "configured-checkpoint-version"
  }
}
```

Error/status example:

```json
{
  "type": "error",
  "schema_version": "1.0",
  "session_id": "opaque-session-id",
  "sequence": 123,
  "code": "INFERENCE_FAILED",
  "message": "The frame could not be processed. Check server logs for details."
}
```

These are target schemas, not claims about the current response. The implementation must update Pydantic models and frontend parsing together. Do not put traceback/secrets in WebSocket error messages.

### 7.4 Frame transport and backpressure

Initial policy:
- Browser captures at a target rate (start around 5–10 FPS; tune by measured latency).
- Resize before encoding (e.g. 480×360 or another tested size).
- One in-flight frame per session.
- Include a monotonically increasing sequence.
- Acknowledge the processed sequence.
- Drop new/stale frames rather than queueing unbounded work.
- Record captured, received, processed, and dropped counts separately.
- Do not send base64 evidence images with every response unless measured and necessary.

---

## 8. Model and dataset strategy

### 8.1 Existing model candidates

`yolov8n.pt` and `yolov8s.pt` are candidate base checkpoints. First confirm the actual file hashes, source, Ultralytics version compatibility, class names, and load path. If they are standard COCO-pretrained checkpoints, they are general object detectors and do not automatically contain custom classes such as `weapon`, `rifle`, or all knife subtypes.

**Baseline order:**
1. `yolov8n.pt` for the first deployment baseline.
2. `yolov8s.pt` on the same validation set/hardware as a comparison.
3. Fine-tuned checkpoint only after the dataset labels are understood and an independent test set exists.

Do not pick the larger model based on intuition alone. Measure per-class precision/recall, mAP, latency, RAM, and dropped frames.

### 8.2 Weapon Detection v1 dataset

The supplied Roboflow export has 3,595 images and 4,734 bounding boxes, train/validation folders, and no independent test split. Its `data.yaml` names eight classes as `0`, `1`, `2`, `Gun`, `Guns`, `Handgun`, `Knife`, and `Rifle`.

Before training:
1. Recover the intended definitions for IDs 0, 1, and 2.
2. Resolve whether `Gun`, `Guns`, and `Handgun` are meant to be separate labels.
3. Visualize labels over sample images for every class.
4. Verify empty label files are intentional negative examples.
5. Confirm license/attribution obligations before redistribution.
6. Create a source-aware independent test split; avoid near-duplicate/scene leakage.
7. Write a dataset manifest and label mapping.
8. Establish a baseline and save per-class metrics.

Do not silently rename or merge classes. If original definitions cannot be recovered, record the uncertainty and manually review samples before defining a new mapping.

### 8.3 Short MP4 clips

The previously supplied archive had ten MP4 entries but four unique files by byte hash. Deduplicate them. First inspect/annotate what each unique clip contains. Keep these clips out of training if they are intended to be a deployment-domain evaluation set. Short clips without event labels do not prove accident anticipation.

### 8.4 Specialist datasets/models

Potential future sources such as action-recognition, anomaly-detection, and workplace-hazard datasets are different tasks. Do not concatenate them into one detector dataset. Each specialist must have:
- a clear task and output schema;
- its own train/validation/test split;
- a license/provenance record;
- a domain and annotation description;
- its own metrics;
- a deployment resource budget.

Only add action/pose/temporal specialists after the object detector and core product are reliable. A risk fusion layer can combine validated specialist outputs later.

### 8.5 Metrics and evaluation gates

**Object detector**
- per-class precision/recall;
- mAP50 and mAP50–95;
- confusion/error examples;
- confidence threshold;
- latency and RAM.

**Tracker**
- stable IDs over consecutive frames;
- ID switches, fragmentation, track continuity;
- behavior under occlusion and multiple subjects;
- state isolation across two sessions.

**Risk engine**
- event-level precision/recall/F1;
- false alarms per hour/session;
- missed-event rate;
- performance on benign handling of sharp objects/tools;
- score/level/reasons consistency.

**Real-time app**
- median and p95 inference/end-to-end latency;
- processed FPS and dropped frames;
- cold-start time;
- peak RAM and CPU;
- WebSocket recovery and session cleanup.

**Accident anticipation is not an MVP claim.** It requires event-timing labels and a warning-lead-time metric.

---

## 9. Deployment strategy

### 9.1 Local development is the first supported environment

Make local development predictable before deploying:
- Backend at `http://localhost:8000`.
- Frontend Vite dev server at `http://localhost:5173`.
- Local frontend calls relative `/api/v1/...` and `/ws/v1/...`.
- Vite proxy forwards to backend.
- `VITE_API_BASE_URL` and `VITE_WS_BASE_URL` are empty unless intentionally testing a remote backend.
- One backend process/worker initially.
- Explicit model path and CPU inference as the baseline.

The hardcoded Render fallback must be removed from source. Render/Vercel deployment config can exist only as explicit deployment settings, not hidden local behavior.

### 9.2 Zero-cost hackathon hosting

Free hosting is constrained. Do not promise stable production-grade real-time CV from free compute.

Candidate topology to test:
- Frontend: static React build on Vercel Hobby or another free static host.
- Backend: a Docker-capable free CPU container/Space that supports WebSockets and enough memory for the selected PyTorch/YOLO model, subject to current plan eligibility and quotas.
- Database: local/demo mode for a disposable demo, or a free-tier managed PostgreSQL provider if durable history is essential.
- Evidence storage: optional free-tier object storage only for selected snapshots.

Before choosing the backend provider, test the actual model image for memory, cold start, and sustained WebSocket inference. Provider plans and free quotas change; verify current limits at deployment time. If free cloud inference is too slow/unreliable, use the laptop as the inference backend for the live judging demo with a secure tunnel, while keeping the frontend public. The laptop must stay powered and online.

### 9.3 Docker

Use Docker Compose as the reproducible local path if it can be built and tested:
- backend container binds `0.0.0.0:8000`;
- frontend/Nginx proxies `/api/v1` and `/ws/v1` to backend service;
- no `CORS_ORIGINS=*` in production;
- model checkpoint path is explicit and available inside the image or via a documented mounted/artifact location;
- local data volume is development-only unless persistent volumes are explicitly configured.

Do not run multiple backend workers until shared model memory and session state are designed for that topology.

### 9.4 Health/readiness and logs

Readiness should check:
- configuration parsed;
- required model loaded and class names available;
- database status according to configured mode;
- optional snapshot storage status;
- supported device.

Logs should include session ID, sequence, model version, latency, FPS, dropped frames, object count, risk level/rule IDs, WebSocket close reason, and persistence outcome. Do not log raw frames or secrets.

### 9.5 Upload safety and resource limits

- maximum upload size configurable and documented;
- validate extension, MIME, and actual decodability;
- use generated upload IDs, not client filesystem paths;
- clean temporary files on stop/expiry;
- set maximum concurrent sessions;
- cap JPEG frame size and incoming WebSocket message size;
- reject malformed base64/frame payloads with structured errors;
- set session TTL and disconnect policy;
- report unsupported formats explicitly.

---

## 10. Services and dependency policy

### Keep for MVP

| Tool/service | Role | Policy |
|---|---|---|
| Python | Backend/runtime | Pin supported version |
| FastAPI + Uvicorn | API and WebSockets | Keep |
| OpenCV | Decode/resize frames | Keep |
| Ultralytics YOLO + PyTorch | Detection/tracking inference | Keep, pin compatible versions |
| NumPy | Numerical/frame operations | Keep |
| React + Vite | Web dashboard | Keep |
| SQLAlchemy | Incident persistence | Keep if DB persistence enabled |
| PostgreSQL | Durable incident metadata | Optional but required for durable cloud history |
| Cloudinary | Selected evidence snapshots | Optional |
| Docker / Docker Compose | Reproducible build/run | Keep if tested |
| Pytest + HTTPX | Backend tests | Keep and run in CI |
| Git/GitHub | Versioning/team workflow | Keep; never commit secrets/data/weights unintentionally |

### Remove or defer unless justified

- Multiple public route aliases.
- Hardcoded Render hostnames in application source.
- Duplicate REST fetch implementations.
- Duplicate full settings UIs.
- Model switches that do not actually change the active model.
- Pose/weapon models that are loaded but not used or validated.
- SMS/emergency alert provider until consent, deduplication, rate limiting, and false-alarm behavior are designed.
- Multi-camera/edge orchestration.
- GPU-specific deployment before CPU baseline measurement.
- Extra infrastructure that doesn't solve a demonstrated requirement.

---

## 11. Refactor phases and acceptance criteria

### Phase 0 — Freeze and baseline

Tasks:
1. Create branch `refactor/baseline` and tag the current revision.
2. Record Python/Node versions and exact dependency versions.
3. Run current backend tests and frontend build; save all failures.
4. Record local startup commands, current environment variable names, model files, and backend logs.
5. Confirm mounted frontend routes/components and dead-code references.
6. Create a sanitized `.env.example`; do not upload actual secrets.
7. Keep a small set of reproducible video clips/frames as test fixtures, subject to dataset license.

Acceptance:
- Known baseline failures recorded.
- Clean branch exists.
- No secrets or private datasets are added to Git.

### Phase 1 — Remove deployment ambiguity

Tasks:
1. Remove hardcoded Render URL fallback from frontend runtime config.
2. Remove “RENDER CLOUD” UI copy.
3. Define local/prod API and WebSocket URL rules.
4. Make Vite/Nginx proxy routes match canonical `/api/v1` and `/ws/v1`.
5. Remove duplicate router mounting and unneeded aliases.
6. Add `/health/live` and `/health/ready`.
7. Add a small diagnostic area showing resolved target, socket state, last response, and last error.

Acceptance:
- Localhost uses local backend unless a remote URL is explicitly configured.
- Network tab confirms REST and WS requests target the intended server.
- No source edit is needed to switch environments.

### Phase 2 — Make inference observable

Tasks:
1. Fix model path resolution and startup error reporting.
2. Log actual loaded model path/name/class map/device.
3. Add raw detection count before filtering.
4. Return structured error messages for frame decode/inference failures.
5. Add per-frame sequence and last-result telemetry.
6. Remove fake fallback risk scores and misleading “active” status.
7. Verify that the selected model detects a person on a known test image.

Acceptance:
- Each sent frame is either acknowledged with a result or an explicit error.
- Model loading failures are visible and actionable.
- Frontend can distinguish no objects from no response.

### Phase 3 — Repair detection/tracking contract

Tasks:
1. Create `VisionPipeline` interface.
2. Consolidate detector/tracker path.
3. Make actual track IDs explicit; remove index fallback IDs.
4. Isolate tracker state by session.
5. Keep movement history across short occlusion with a grace period.
6. Add real SVG rectangles with correct coordinate mapping.
7. Add tests for moving person, no detections, multiple objects, ID continuity, and two-session isolation.

Acceptance:
- The same person receives a stable ID across a representative sequence.
- Boxes align with the detected object in different aspect ratios.
- If IDs are missing, UI clearly says untracked rather than pretending otherwise.

### Phase 4 — Standardize source/session lifecycle

Tasks:
1. Define `browser_camera`, `uploaded_video`, and optional local-only `server_camera`.
2. Use generated upload IDs.
3. Add upload size/type/decode validation and cleanup.
4. Reject unknown/expired session IDs rather than auto-creating sessions.
5. Implement explicit stop/expiry and disconnect cleanup.
6. Bound active sessions and in-flight frames.
7. Add session status endpoint and structured lifecycle errors.

Acceptance:
- Start/stop can be repeated without leaking camera tracks, captures, or session state.
- Uploaded video works through the same pipeline and output schema.
- Unknown sessions fail visibly and cleanly.

### Phase 5 — Refactor frontend ownership

Tasks:
1. Add central `apiClient`.
2. Migrate every direct `fetch()` to the service layer.
3. Extract browser-camera lifecycle and frame sender.
4. Refactor WebSocket lifecycle and status handling.
5. Move incident side effects into incident service/hook.
6. Consolidate settings views and remove unsupported controls.
7. Slim `App.jsx` and split `VideoPanel.jsx` at clear responsibilities.
8. Add loading/empty/error/reconnect/session-expired states.

Acceptance:
- No component hardcodes deployment URLs.
- UI config equals backend effective config.
- Every control either works or is removed/disabled with an explanation.
- Frontend build passes.

### Phase 6 — Make risk output trustworthy

Tasks:
1. Document rule inputs/units/thresholds.
2. Normalize coordinate calculations.
3. Separate per-frame scoring from temporal persistence.
4. Version the rule set and include reason IDs.
5. Remove accidental risk claims based only on object presence.
6. Label normal and risk clips with an annotation policy.
7. Measure false alarms and missed events.

Acceptance:
- Score is explicitly a heuristic and does not claim calibrated probability.
- Repeated frames do not create unlimited duplicate incidents.
- Normal handling scenarios are included in tests.

### Phase 7 — Repair persistence

Tasks:
1. Select database mode and make it explicit.
2. Use one DB session/repository pattern.
3. Fix create/list/status/delete error handling.
4. Do not return success if required persistence failed.
5. Keep snapshot upload status independent.
6. Add migration/retention plan.

Acceptance:
- Persisted incidents survive backend restart when durable DB is configured.
- DB outage is visible and testable.
- Snapshot upload failure does not corrupt incident metadata.

### Phase 8 — Deployment verification

Tasks:
1. Build Docker images cleanly.
2. Test the selected hosting provider's actual memory/cold start/WebSocket behavior.
3. Verify HTTPS/WSS, CORS, upload limits, health/readiness, and model loading.
4. Measure sustained FPS/latency/RAM on target host.
5. Test a browser-camera session from the public frontend.
6. Test upload, stop, reconnect, and incident persistence.
7. Add CI: backend tests, frontend build, optional Docker build.

Acceptance:
- Clean deploy from documented instructions.
- No Render fallback leaks into local development.
- Live stream works end to end on the selected target.
- Performance and limits are documented honestly.

### Phase 9 — Model/dataset integration

Tasks:
1. Inspect the dataset label taxonomy and licensing.
2. Create label visualizations and an independent test split.
3. Benchmark Nano and Small baselines.
4. Train a weapon-specialist checkpoint only after taxonomy review.
5. Compare fine-tuned model against base checkpoints on the same held-out test set.
6. Add the chosen model to the registry with metadata.
7. Add model regression tests and latency/resource benchmark.

Acceptance:
- Every model has a provenance record, class map, version/hash, and measured metrics.
- No accuracy claim is based only on a training or validation result.
- The active production checkpoint is visible in the UI/health diagnostics.

---

## 12. Test strategy

### Backend unit tests
- config validation and update;
- model path resolution and missing weights;
- detection class filtering and class map;
- tracker ID behavior;
- movement speed/direction/occlusion;
- risk rules and score aggregation;
- temporal persistence/cooldown;
- schema serialization;
- upload validation;
- incident repository mapping.

### Backend integration tests
- app startup/readiness;
- session create/status/stop;
- unknown/expired session behavior;
- WebSocket frame request/response contract;
- decode and inference errors;
- concurrent session isolation;
- DB create/list/update/delete;
- DB unavailable behavior;
- uploaded video lifecycle and cleanup.

### Frontend tests / manual checks
- `npm run build`;
- URL resolver under local and production config;
- camera permission granted/denied;
- stop/unmount releases camera tracks;
- socket reconnect/session expiry;
- `sendFrame` false does not lock sender;
- bounding boxes align with video;
- empty/no detection differs from no response;
- settings show backend effective values;
- incident status persists after refresh;
- error, loading, and disconnected states are clear.

### Deployment test scenarios
- normal indoor scene;
- low light;
- motion blur;
- partial occlusion;
- object far from camera;
- multiple people/objects;
- benign handling of knives/scissors/tools;
- no-person object scene;
- camera permission denial;
- backend restart while stream is active;
- slow inference and dropped frames;
- database/snapshot provider unavailable.

---

## 13. Development rules for the coding agent

These rules apply to any agent editing this repository.

1. **Do not rewrite the entire repository in one pass.** Implement the phases in order and keep each commit runnable.
2. Before modifying a file, read the current implementation and its imports/callers.
3. Preserve existing UI behavior unless it is explicitly identified as broken or misleading.
4. Do not delete a component merely because it appears unused; verify imports/routes/tests first.
5. Do not create fake data or mock values in production paths.
6. Do not claim a model is loaded/used unless runtime metadata proves it.
7. Do not replace real tracking IDs with synthetic stable-looking IDs.
8. Do not suppress exceptions with empty `except` blocks or return `None` without a structured error/status.
9. Do not train models during app startup.
10. Do not commit weights, datasets, `.env` secrets, or generated large artifacts.
11. Every API contract change must update Pydantic schemas, frontend types/parsing, tests, and docs in the same phase.
12. Every config control must map to a validated backend setting consumed by the runtime.
13. Every new dependency must have a clear reason and be pinned/compatible.
14. Keep risk score, detector confidence, and system status as separate values.
15. Add regression tests for each bug fixed.
16. Record unresolved items rather than inventing behavior.
17. Do not claim accident anticipation until it is measured on event-timed data.
18. For deployment, verify the actual host plan limits rather than assuming free compute is sufficient.
19. If tests cannot be run, state that explicitly in the handoff/commit notes.
20. Prefer a small, understandable working pipeline over premature microservices or distributed queues.

---

## 14. First implementation tasks (start here)

The coding agent should start with this exact sequence, not a giant rewrite:

1. Create a refactor branch and run existing tests/build; record baseline.
2. Fix `frontend/src/config.js` to remove the hardcoded Render fallback and make local proxy use deterministic.
3. Replace the hardcoded “RENDER CLOUD” message with actual connection/session state.
4. Fix model path resolution and expose the active checkpoint/class names.
5. Add a diagnostic panel/logging for API target, WS target, last frame sequence, object count, latency, and last error.
6. Make `process_client_frame` return an explicit result/error status rather than silently dropping failures.
7. Remove fabricated track IDs and test ByteTrack ID output.
8. Draw actual bounding rectangles using the returned box coordinates.
9. Consolidate detector/tracker invocation behind `VisionPipeline`.
10. Add session isolation tests.
11. Standardize routes and the WebSocket contract.
12. Then move into frontend extraction, persistence, deployment, and model evaluation.

At the end of each task, run the relevant tests and provide:
- files changed;
- why each changed;
- tests run and results;
- known limitations;
- next task.

---

## 15. Definition of done

The first stable refactor is done when all of the following are true:

- [ ] Localhost uses the local backend unless remote mode is explicitly configured.
- [ ] No hardcoded Render hostname or provider-specific status copy remains in app runtime code.
- [ ] Model path and actual loaded model are visible and consistent.
- [ ] A browser camera frame reaches the intended backend and receives either a frame result or explicit error.
- [ ] Actual detection boxes render at correct coordinates.
- [ ] Stable track IDs are used only when provided by a real tracker.
- [ ] Two concurrent sessions do not share tracking/movement/risk state.
- [ ] Movement and risk outputs have documented units/meaning.
- [ ] The risk score is clearly described as heuristic unless calibrated.
- [ ] WebSocket reconnection does not create ghost sessions.
- [ ] Camera tracks, sessions, uploads, and captures clean up correctly.
- [ ] All settings shown in UI are supported and affect the backend.
- [ ] Incidents do not silently pretend to be durably stored when persistence failed.
- [ ] Frontend build and backend tests pass.
- [ ] Deployment instructions work from a clean environment.
- [ ] Target-host memory, FPS, latency, cold start, and failure behavior are measured.
- [ ] Dataset labels and licenses are reviewed before fine-tuning.
- [ ] Detector, tracker, risk, and system metrics are reported separately.

---

## 16. Final product principle

**Vision Guard is a real-time safety-monitoring software system powered by computer-vision models. It is not a YOLO notebook and it is not merely a bounding-box demo.**

The success condition is not “the camera opened” or “the model printed detections.” The success condition is that the browser sends valid frames to the intended backend, the active model is known, tracking is real and session-isolated, risk outputs are transparent, the UI reflects actual backend state, incidents persist honestly, and the same documented process can reproduce the deployment.

Refactor toward that outcome in small verified phases. Preserve useful existing work, delete only confirmed redundancy, and never confuse an attractive interface with a working inference pipeline.
