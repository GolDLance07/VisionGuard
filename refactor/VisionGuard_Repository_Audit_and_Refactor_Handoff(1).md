# Vision Guard — Repository Audit & Refactor Handoff

> **Purpose:** Refactor the existing Vision Guard repository without rebuilding it from scratch. Preserve working product/UI pieces, remove redundant or misleading code, establish one reliable inference path, and make deployment and model evaluation reproducible.
>
> **Audit basis:** Static inspection of the Vision Guard repository provided for review. No live deployment logs, environment variables, model weights, or runtime traces were supplied at the time of the initial audit. Items marked **confirmed** are visible in the source code; items marked **verify** require running the app or inspecting deployment configuration.

---

## 1. Executive summary

Vision Guard is already more than a notebook. It has a React/Vite dashboard, a FastAPI backend, WebSocket streaming, object tracking, movement features, a rule-based risk engine, incident persistence, model-training code, tests, Docker files, and deployment configuration.

The problem is that these pieces do not yet form one sufficiently strict product architecture. The highest-priority work is not a visual redesign or a full rewrite. It is to make the current pipeline predictable:

1. One defined video-input contract.
2. One inference/tracking pipeline per active session.
3. One model-loading and model-version policy.
4. One configuration contract shared by backend and UI.
5. One documented deployment topology.
6. Separate evaluation for object detection, tracking, risk classification, and real-time performance.
7. A reliable persistence strategy that does not silently disguise production failures as success.

**Recommended strategy:** retain the dashboard and much of the backend domain logic; refactor the seams between them. First make a small, dependable end-to-end path work. Then add specialist models and more advanced risk logic only after they can be evaluated independently.

### Non-negotiable product boundary

Vision Guard should describe **observable objects and visual safety conditions**, not infer a person's identity, character, criminality, or intent. A detected object or movement is not proof that an incident or crime is occurring. UI language should say “potential safety risk” and expose the evidence/reasons.

---

## 2. Repository inventory

The repository contains the following major areas:

- `backend/app/api/`: REST endpoints and WebSocket endpoint.
- `backend/app/detection/`: detector wrapper and tracking/model code.
- `backend/app/movement/`: movement/trajectory calculations.
- `backend/app/risk/`: risk configuration, rules, scoring, and alert-provider abstraction.
- `backend/app/video/`: video source/session manager and inference orchestration.
- `backend/app/schemas/`: Pydantic contracts for detections, frames, risk reasons, and configuration.
- `backend/app/db/`: SQLAlchemy persistence and Cloudinary snapshot upload.
- `backend/tests/`: API, movement, and risk-engine tests.
- `backend/train_weapons.py` and `experiments/train_weapon_yolo.ipynb`: model-training workflow.
- `frontend/src/App.jsx`: top-level UI state and orchestration.
- `frontend/src/components/`: dashboard panels, session controls, settings, and incident history.
- `frontend/src/hooks/useDetectionWebSocket.jsx`: browser WebSocket lifecycle.
- Root deployment files: `docker-compose.yml`, `vercel.json`; backend Dockerfile/Procfile; frontend Dockerfile/Nginx config.
- Planning documents: PRD, TRD, implementation plan, app flow, README, `Context1.md`, and `AGENTS.md`.

There are multiple planning documents describing intended behavior. Treat them as design references, **not proof that every described feature is implemented or working**. During refactoring, consolidate them after the architecture is validated.

---

## 3. Confirmed issues and risks

### P0 — Fix before relying on local inference or deployment

#### 3.1 Model loading can fail on a local non-cloud run

**File:** `backend/app/detection/tracker.py`, function `get_shared_models()`

The non-cloud branch contains an `elif` condition that reads `model_path` before assigning it in that branch:

```python
elif model_path in ("models/yolov8n.pt", "yolov8n.pt") ...
```

When the cloud condition is false, this can raise `UnboundLocalError` during tracker initialization. Because `Session` creates its tracker through a dataclass default factory, this may surface when a session is created rather than at application import.

**Change:**
- Resolve a model path deterministically from validated configuration and filesystem state before branching.
- Use absolute paths based on the backend package/project root, not the process's current working directory.
- Fail with a clear startup/session error if required weights are absent; do not silently switch to an untracked model.
- Add tests for local, cloud-like, missing-weight, and custom-weight cases.

#### 3.2 Model instances and tracker state have unclear session ownership

**File:** `backend/app/detection/tracker.py`

The module-level singleton caches the main detector, pose model, and weapon model. `Tracker.track()` invokes `self.model.track(..., persist=True)`. Persistent tracking state is therefore associated with a shared model instance, while each video session has its own `Tracker` object.

**Risk:** simultaneous sessions may interfere with persistent tracking IDs/state. Shared weights can be efficient, but shared mutable tracker state is not automatically safe across sessions.

**Change:**
- Separate **immutable/shared model weights** from **per-session tracker state**.
- Explicitly define concurrency: one inference worker/queue for a shared model, or a model/tracker instance per isolated worker/session where resources permit.
- Never allow two independent sessions to mutate the same persistent tracker state without synchronization and a tested design.
- Add a two-session test that verifies IDs and movement histories do not leak across sessions.

#### 3.3 Pose and weapon models are loaded but their lifecycle/use is unclear

**File:** `backend/app/detection/tracker.py`

The code attempts to load pose and weapon models and contains pose/weapon-related object fields. Loading extra models increases cold-start time and RAM/CPU pressure. A model that is loaded but not demonstrably required for the current inference path should not be in the MVP runtime.

**Change:**
- For the first stable release, load only the model(s) required for the active feature set.
- Put optional specialist models behind explicit feature flags and lazy loading.
- Log each model's resolved path, class names, device, load duration, and version.
- Do not claim that pose or weapon-specialist inference is active until its output is actually integrated and evaluated.

#### 3.4 Database session handling is inconsistent in incident mutation routes

**File:** `backend/app/api/routes.py`

The module imports `get_session`, but incident status-update and clear routes refer to `SessionLocal` directly. It is not imported into this module, so these paths can raise `NameError` when exercised.

**Change:**
- Use one database session dependency/helper consistently for GET/POST/PATCH/DELETE.
- Add tests for status updates and clearing incident records.
- Do not report a successful update when persistence failed.

#### 3.5 Duplicate router registration creates an ambiguous API surface

**File:** `backend/app/main.py`

The same REST router is included with `/api` and again without a prefix:

```python
app.include_router(routes.router, prefix="/api")
app.include_router(routes.router)
```

This creates duplicate public paths (for example, both `/api/config` and `/config`) and makes the API contract less clear. The WebSocket module also registers multiple aliases (`/ws/detection`, `/detection`, `/api/ws/detection`, `/api/detection`).

**Change:**
- Define a single canonical REST prefix, recommended `/api/v1`.
- Define one canonical WebSocket path, recommended `/ws/detection`.
- If a legacy path is required, implement a temporary explicit compatibility alias with a removal date.
- Update frontend, proxy configuration, docs, and tests together.

### P1 — High-priority reliability and architecture issues

#### 3.6 Frontend and backend have multiple competing ways to reach the API

**Files:** `frontend/src/config.js`, frontend components, `frontend/vite.config.js`, `vercel.json`, `frontend/nginx.conf`

The repo contains:
- `VITE_API_URL` and `VITE_WS_URL` support.
- A hard-coded Render API/WebSocket fallback.
- A local-hostname shortcut.
- Vite proxying.
- Vercel rewrite configuration for `/api/*`.
- Nginx API and WebSocket proxy configuration for Docker.
- Several components that call `fetch('/api/config')` directly, while `App.jsx` and some other components use `getApiBase()`.

This is a major source of “works locally, fails in deployment” behavior: some calls honor the configured backend URL, while others assume same-origin proxying. The Vercel rewrite shown in the repository handles `/api/*`; it does not itself establish a WebSocket proxy for the WebSocket connection that the hook opens directly to the configured Render host.

**Change:**
- Create one frontend API client module for REST and one function for WebSocket URL construction.
- All components must use the same client. No hard-coded deployment URLs inside components.
- Document and test the URL rules for local Vite, Docker/Nginx, and the chosen cloud deployment.
- Use deployment environment variables rather than treating one Render hostname as a permanent source of truth.
- Validate production CORS against the actual frontend origin. Do not use broad wildcard origins with credentials.

#### 3.7 Browser webcam streaming and server-side webcam capture are mixed together

**Files:** `backend/app/api/routes.py`, `backend/app/api/websocket.py`, `backend/app/video/stream.py`, `frontend/src/components/VideoPanel.jsx`

The REST start-session endpoint creates a `VideoSource(type="webcam")`, while the WebSocket branch for webcam sessions expects the **browser to send frames** over the socket. The video manager also contains a server-side `cv2.VideoCapture()` webcam path. A deployed cloud container normally cannot access the user's physical webcam; only the browser can access it and send frames.

**Change:**
- Make the source types explicit: `browser_camera` and `uploaded_video` for the first deployed web app.
- For `browser_camera`, use `getUserMedia()` in the browser and send frames to the backend through a documented WebSocket protocol.
- For `uploaded_video`, upload the file, receive a server-generated opaque upload/session reference, and let the backend decode the file.
- Keep server-attached camera capture only as a separate optional local/edge mode, not as the default cloud webcam mode.
- Do not send arbitrary filesystem paths from the client as file references. Use server-generated IDs and validate ownership/existence.

#### 3.8 Uploaded files and long-running sessions need lifecycle controls

**Files:** `backend/app/api/routes.py`, `backend/app/video/stream.py`

Uploads are written to an `uploads` directory and session objects are held in a process-local dictionary. The visible code does not establish a robust retention/cleanup policy for uploaded files or a cross-process session store.

**Change:**
- Set maximum upload size, allowed extension/MIME checks, and a real decode validation step.
- Store uploads under generated IDs; never trust a client-supplied path.
- Clean up temporary files after session completion/expiry.
- Add a session TTL, disconnect cleanup, maximum active sessions, and an explicit session status endpoint.
- Document that process-local sessions are lost on server restart and must not be assumed to work across multiple backend replicas.

#### 3.9 Incident persistence can silently degrade

**Files:** `backend/app/api/routes.py`, `backend/app/db/database.py`, `backend/app/db/cloudinary_service.py`

The backend attempts database persistence and falls back to in-memory incident storage when database access fails. The database module can also fall back to SQLite. This is useful for local development, but on an ephemeral cloud filesystem it may look like incidents were stored even though they will disappear on restart. The API response can still indicate that an incident was recorded after persistence errors.

**Change:**
- Explicitly distinguish `development` and `production` storage modes.
- In production, require the configured durable database or expose a clear degraded state; do not silently claim durable persistence.
- Use one structured storage service and return storage status/errors clearly.
- Keep Cloudinary optional for snapshots, but report snapshot-upload failure separately from incident-record persistence.
- Define image retention, access control, and privacy expectations. Do not upload every frame; upload only the evidence frame associated with a deliberately created incident.

#### 3.10 Risk configuration has competing controls and inconsistent defaults

**Files:** `backend/app/risk/config.py`, `backend/app/api/routes.py`, `frontend/src/components/SettingsModal.jsx`, `frontend/src/components/ThresholdTuningCard.jsx`

The UI exposes both a full settings modal and an in-dashboard threshold card. Their defaults differ from backend defaults. The threshold card writes speed keys such as `stationary`, `normal`, and `rapid`, while the backend defaults use `slow`, `medium`, and `fast`. It also uses direct `fetch('/api/config')`, unlike the centralized API URL helper. This can produce settings that save but do not affect the rule keys that the engine actually reads.

**Change:**
- Keep one authoritative typed `RiskConfig` schema.
- Expose only fields that the active risk engine consumes.
- Validate ranges, key names, weights, and cutoff ordering on the backend.
- Choose one primary settings experience. Keep the in-dashboard threshold card for the small set of live-safe parameters; consolidate advanced settings into a single settings view/modal.
- Remove any slider or model switcher that does not demonstrably change the running inference behavior.
- Return the effective configuration and display save errors in the UI.

#### 3.11 Uploaded-video and browser-camera processing have different frame paths

**File:** `backend/app/video/stream.py`

Uploaded-video processing uses the server capture loop and yields a JPEG-encoded frame with every `DetectionFrame`. Browser webcam processing decodes client frames and sets `risk_frame.frame` only for HIGH risk, reusing the incoming data URL/base64 string. These differences are not represented clearly in the shared frame contract and may cause UI/evidence behavior to vary by source.

**Change:**
- Standardize the `DetectionFrame` contract.
- Separate live video rendering from inference telemetry if sending a full base64 frame on every message is too expensive.
- Include a monotonically increasing frame sequence number, timestamp, source/session ID, objects, movement, risk, reasons, inference latency, and model version.
- Make evidence capture a separate event or endpoint instead of an incidental optional field on every detection frame.

#### 3.12 WebSocket reconnect/session recovery is too permissive

**File:** `backend/app/api/websocket.py`, `frontend/src/hooks/useDetectionWebSocket.jsx`

The backend auto-creates a missing webcam session when a WebSocket connects with an unknown session ID. This can mask stale session IDs or server restarts and create sessions that were never explicitly started. The frontend reconnects after unexpected closes but does not have a robust session re-creation protocol.

**Change:**
- Unknown session IDs should return a clear close/error code; do not silently create sessions.
- The frontend should distinguish transient socket reconnect from a lost backend session.
- On session loss, show an actionable state and either request explicit session recreation or stop the stream.
- Add heartbeat/timeout handling and ensure unmount/stop always clears reconnect timers and camera tracks.

#### 3.13 Risk engine logic and spatial units need calibration

**Files:** `backend/app/risk/risk_engine.py`, `backend/app/risk/rules.py`, `backend/app/movement/movement_engine.py`

The risk engine combines weighted rule outputs, proximity, motion, direction changes, and persistence. The movement engine computes image-space speed (pixels per second) and normalizes it by bounding-box height. Image-space center-to-center distance is not a physical distance and varies with camera perspective. Some risk signals may therefore change drastically with resolution, camera angle, and distance from the camera.

**Change:**
- Normalize coordinates to frame dimensions and document every unit.
- Prefer bounding-box edge distance over center distance when evaluating proximity; use person/object or hand/object geometry only when reliable annotations/model outputs exist.
- Use temporal smoothing and persistence to reduce flicker, but do not let persistence create the impression that a risk score is statistically calibrated.
- Version the rule set and log which rules contributed to each score.
- Test normal scenarios that include harmless handling of knives/scissors/tools, objects on tables, empty scenes, occlusion, low light, and multiple people.
- Phrase output as “risk heuristic” until validated against a labeled risk dataset.

#### 3.14 Track IDs and histories need explicit correctness guarantees

**File:** `backend/app/detection/tracker.py`, `backend/app/movement/movement_engine.py`

The tracker uses Ultralytics persistent tracking and temporal class voting. If tracking IDs are absent, it falls back to sequential IDs based on box order. Box order is not a reliable identity mechanism across frames. The movement engine deletes state for every ID missing from the current frame, which makes temporary occlusion reset motion history.

**Change:**
- Do not synthesize sequential IDs and call them stable track IDs.
- Represent “untracked detection” explicitly if the tracker cannot assign an ID.
- Add configurable short track-loss grace periods for movement history.
- Keep temporal class smoothing bounded and test class-switching behavior.
- Evaluate ID switches, fragmentation, and track continuity using labeled clips—not only whether bounding boxes look plausible.

### P2 — Simplify and maintainability work

#### 3.15 The detector module is not clearly the active path

**File:** `backend/app/detection/detector.py`

A `Detector` wrapper exists and loads a YOLO model from config, but the main video path shown in the repository invokes the `Tracker` directly, which runs its own model tracking call. This duplicates responsibilities and makes it unclear which class controls filtering, model selection, and confidence thresholds.

**Change:** define one interface, such as `VisionPipeline.process(frame, session_state)`, that orchestrates detection/tracking consistently. Keep `Detector` only if it becomes the actual detector component used by the pipeline. Otherwise remove it after tests prove nothing imports it.

#### 3.16 There is a large frontend surface relative to the MVP

`VideoPanel.jsx`, `IncidentHistory.jsx`, and `SettingsView.jsx` are particularly large. Large files are not automatically wrong, but they make regressions harder to isolate and hide multiple responsibilities.

**Change:** do not rewrite their visual design immediately. First preserve behavior, then extract small hooks/services and presentational components. Avoid splitting files just to create more files; split by independently testable responsibility.

#### 3.17 Dependencies and deployment definitions need one supported path

The repository has Vercel, Render assumptions, Docker Compose, an Nginx proxy, a backend Dockerfile, a Procfile, and local Vite proxy behavior. Multiple deployment options are acceptable only when each is maintained and tested.

**Change:** choose one primary production topology and one local developer topology. Treat other files as supported only if there is a documented test path. Remove stale configuration after the selected path is verified.

---

## 4. Frontend: current functional components and disposition

The existing UI should be preserved initially. Refactor API/state ownership before redesigning the visual layer.

| Component / module | Current responsibility | Recommendation |
|---|---|---|
| `App.jsx` | Top-level tabs, session start/stop, config loading, WebSocket telemetry, local incident grouping, snapshot creation, dark mode, settings modal state, error banner, tab composition | **Keep, then slim down.** Move API calls to services, incident lifecycle to a hook/service, and session logic to a session hook. It currently owns too many unrelated responsibilities. |
| `Header.jsx` | Primary navigation, connection/status indicators, sound/voice/dark-mode toggles, settings entry | **Keep.** Verify every control has a real effect and accessible labels. |
| `SubHeaderTelemetry.jsx` | Session/source/status summary and preview/demo risk-state controls | **Keep selectively.** Make demo/preview mode clearly non-production and ensure it cannot be mistaken for model output. |
| `VideoPanel.jsx` | Main video canvas, detection overlays, source selection, browser camera/video upload controls, session start/stop, snapshot action, export package, frame sending | **Keep the feature, refactor internally.** Separate video/canvas rendering, browser camera lifecycle, upload handling, session controls, and export logic. It is the highest-priority frontend refactor because it owns many responsibilities. |
| `Controls.jsx` | Alternative session controls and file upload | **Check whether it is used.** If `VideoPanel` duplicates the same controls and no active route imports this component, remove it only after verifying references. Avoid maintaining two upload/session implementations. |
| `WarningPanel.jsx` | High-level alert banner, acknowledge/silence UI | **Keep.** Connect it to a consistent alert/event state and ensure silence/acknowledge semantics are explicit. |
| `RiskPanel.jsx` | Current risk level/score summary | **Keep.** Label the score as a heuristic risk score, not detector confidence or probability of an accident. |
| `ExplainabilityFeed.jsx` | Displays contributing risk rules/reasons | **Keep.** Render reason IDs/details from the backend schema; avoid generating new causal claims in the UI. |
| `ObjectsList.jsx` | Current detected objects, classes, confidence, and unsafe-class styling | **Keep.** Use stable IDs where available and clearly distinguish confidence from risk. |
| `ThresholdTuningCard.jsx` | In-dashboard tuning of confidence, speed, distance, persistence | **Keep only after config contract repair.** Remove settings that are unused or whose units/keys do not match the backend. |
| `IncidentHistory.jsx` | Incident list/history, review/status interactions, detail/evidence/export workflow | **Keep the product capability.** Refactor into smaller units after API/persistence semantics are fixed. Preserve user-facing review workflows. |
| `SafetyTelemetryView.jsx` | Telemetry/diagnostic view | **Keep if it shows real backend telemetry.** Remove or relabel mocked/demo values; show FPS, latency, source, model version, and connection state from actual telemetry. |
| `SettingsModal.jsx` | Advanced configuration, model path, unsafe classes, thresholds, persistence, save | **Consolidate with `SettingsView.jsx`.** Keep one canonical settings experience and one backend save service. |
| `SettingsView.jsx` | Full settings screen | **Audit and consolidate.** It is large and overlaps the modal. Keep unique useful functionality, remove duplicate controls and nonfunctional settings. |
| `useDetectionWebSocket.jsx` | WebSocket creation, message parsing, reconnect timer, connection status, error state, optional client frame send | **Keep, refactor and test.** Handle stale sessions, explicit stop, cleanup, heartbeat/timeouts, backpressure, and a versioned message contract. |
| `config.js` | API/WebSocket URL selection | **Keep as the single source of endpoint configuration.** Move all API calls through an API client that uses this module. |
| `main.jsx`, `index.css`, Tailwind/Vite config | App bootstrap, styles, build/dev configuration | **Keep.** Change only when required by the selected deployment path. |

### Frontend state ownership target

`App.jsx` should compose views, not be the implementation of every feature. Move behavior into a small number of modules:

- `services/apiClient.js`: REST calls, base URL, JSON/error handling.
- `services/detectionSocket.js` or a well-contained WebSocket hook: connect/send/parse/reconnect protocol.
- `hooks/useVisionSession.js`: start/stop/session lifecycle and source selection.
- `hooks/useBrowserCamera.js`: `getUserMedia()`, camera track cleanup, frame capture/backpressure.
- `hooks/useIncidents.js`: incident creation, fetch, review/status changes, persistence error state.
- `components/`: rendering only where practical.

Do not create all of these blindly. Introduce them in small refactor commits and migrate one responsibility at a time.

### Functional behavior that must remain available

1. Navigate between Live, Incidents, Telemetry, and Settings.
2. Show connection and session status.
3. Start/stop a browser-camera session.
4. Upload and process a supported video file.
5. Render live video with boxes/labels for returned detections.
6. Show objects, confidence, risk level/score, and reasons.
7. Surface a warning when the backend returns a high-risk state.
8. Capture a deliberate evidence snapshot.
9. View/review incident history and change incident status.
10. Tune only supported configuration parameters.
11. Show loading, empty, error, disconnected, and reconnecting states.
12. Allow the operator to silence/acknowledge UI alerts without changing the underlying risk calculation.

---

## 5. Backend responsibilities and target boundaries

| Current area | Responsibility | Recommendation |
|---|---|---|
| `app/main.py` | FastAPI construction, CORS, lifespan, DB init, router mounting, health | **Keep.** Fix duplicate router registration, narrow CORS, add startup diagnostics/readiness, and keep lifespan cleanup. |
| `app/api/routes.py` | Session endpoints, upload, incidents, config, cloud status | **Keep functionality, split by domain.** Separate sessions/uploads, configuration, and incidents into routers after fixing behavior. |
| `app/api/websocket.py` | Real-time stream protocol and upload-stream sending | **Keep but simplify.** One canonical route, explicit session validation, one documented protocol, backpressure, graceful closure. |
| `app/video/stream.py` | Session manager, source capture, frame decode, inference orchestration, JPEG/base64 handling, FPS/latency | **Keep core idea; refactor into orchestrator + source adapters.** It currently owns too many responsibilities. |
| `app/detection/detector.py` | YOLO detector wrapper/filtering | **Use or remove.** It should be part of the actual pipeline, not a parallel unused path. |
| `app/detection/tracker.py` | Model loading, ByteTrack, temporal class voting, optional pose/weapon model setup | **High-priority refactor.** Separate model registry, detector, tracker state, and optional specialist inference. |
| `app/movement/movement_engine.py` | Position history, velocity, direction, displacement, speed normalization | **Keep.** Clarify units, track-loss grace period, per-session ownership, and tests. |
| `app/risk/rules.py` | Individual interpretable rule functions | **Keep as a baseline.** Add unit tests and ensure every rule has documented inputs/units. |
| `app/risk/risk_engine.py` | Weighted score, reasons, persistence gate, risk level | **Keep but calibrate.** Separate raw rule score from persistence/state machine; version rule configuration. |
| `app/risk/config.py` | Default risk configuration and singleton/update helper | **Keep the schema; reconsider mutable singleton behavior.** Validate updates and make effective configuration explicit. |
| `app/risk/alert_manager.py` | Alert-provider interface and dashboard log provider | **Keep.** The provider abstraction is useful. The current provider logs only; it does not send SMS/email. |
| `app/schemas/detection.py` | Shared backend response models | **Keep.** Version and test the public contract; avoid optional fields with inconsistent meaning across source types. |
| `app/db/database.py`, `models.py` | SQLAlchemy setup and incident records | **Keep with changes.** Fix session usage, make storage mode explicit, and add persistence tests. |
| `app/db/cloudinary_service.py` | Snapshot storage integration | **Keep optional.** Treat it as media storage, not the database; report failures clearly. |
| `backend/train_weapons.py` | YOLO fine-tuning script | **Keep in the ML workflow**, but make dataset/model paths configurable and document training/evaluation outputs. Do not run training during production startup. |
| `backend/tests/` | API, movement, risk tests | **Keep and expand.** Add tracking/session isolation, config, upload, persistence, and contract tests. |

### Suggested target backend layout

```text
backend/
  app/
    main.py
    api/
      sessions.py
      uploads.py
      incidents.py
      config.py
      websocket.py
    core/
      settings.py
      logging.py
      errors.py
    video/
      sources/
        browser_frames.py
        uploaded_video.py
      session_manager.py
      pipeline.py
    vision/
      model_registry.py
      detector.py
      tracker.py
      specialists/              # optional later
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
    schemas/
      detection.py
      session.py
      incident.py
  tests/
  requirements.txt
  Dockerfile
```

This is a **target direction**, not a request to rename every file in one massive change. Keep existing paths while fixing the runtime first; move modules only when there is a clear benefit and tests protect the behavior.

---

## 6. Services and infrastructure: what to use and why

The project should use as few external services as practical. Each service must have a clear responsibility.

### Required for the MVP

| Service/tool | Responsibility | Decision |
|---|---|---|
| Python + FastAPI | Backend API, session management, inference orchestration | **Keep.** |
| Uvicorn | ASGI server | **Keep.** Use a deployment command that respects the platform's port and does not spawn multiple independent model processes accidentally. |
| OpenCV | Decode/resize video frames and draw/process images where needed | **Keep.** |
| Ultralytics YOLO + PyTorch | Initial object detection/tracking model runtime | **Keep for V1.** Pin/test a compatible version and explicitly document the weight file/classes. |
| NumPy | Frame and numerical operations | **Keep.** |
| React + Vite | Web dashboard and production frontend build | **Keep.** |
| WebSocket | Low-latency telemetry and browser-frame transport | **Keep for live video.** Add a documented protocol and frame backpressure. |
| Git/GitHub | Version control and collaboration | **Keep.** Never commit secrets, private datasets, or large model weights. |
| Pytest + HTTPX | Backend regression and API tests | **Keep.** Make tests run in CI. |

### Optional, only when the feature needs it

| Service/tool | Use it for | Keep/remove guidance |
|---|---|---|
| PostgreSQL (Neon or another managed provider) | Durable incident metadata and review status | Keep if persistent history is part of the product. Configure a real production DB; do not rely on ephemeral SQLite for cloud persistence. |
| Cloudinary | Store selected incident snapshots and return durable image URLs | Optional. Use only for evidence snapshots. Ensure credentials, access rules, retention, and failure behavior are configured. |
| Docker | Reproducible local environment and backend/frontend packaging | Keep as the recommended local parity path. Verify the images actually build. |
| Vercel | Static React frontend hosting | Optional frontend host. It must not be treated as the inference backend. Configure `VITE_API_URL` and `VITE_WS_URL` explicitly if using direct backend access. |
| Render or another container host | Run FastAPI backend | Optional. Verify actual RAM/CPU, WebSocket support, cold-start behavior, disk persistence, request size, and runtime limits for the chosen plan. Do not assume a free web service is sufficient for continuous CV inference. |
| GPU-capable compute | Higher-throughput/latency-sensitive model inference | Add only if measured latency/throughput requires it. Keep model interface portable. |
| SMS/email/push provider | Notify a real external emergency contact | **Not MVP.** Add only after consent, recipient verification, false-alarm handling, auditability, rate limits, and explicit user controls are designed. The current `AlertManager` is a provider hook plus log provider, not an external notification integration. |

### Deployment decision recommended for the refactor

Choose and document **one primary production topology** before debugging deployment further.

**Recommended initial topology:**
- Frontend: Vercel static hosting *or* the included Nginx frontend container.
- Backend: one FastAPI container/service with WebSocket support and sufficient memory for the selected model.
- Database: managed PostgreSQL if incident history must survive restarts.
- Object storage: optional Cloudinary for selected snapshots.
- Model weights: baked into the backend image or downloaded from a versioned private artifact store at startup; never rely on an undocumented working-directory-relative file.

For the simplest reproducible development setup, use the included Docker Compose as the reference topology and ensure the frontend talks to the service name `backend` through Nginx. If Vercel + Render remains the production setup, test it independently and document the environment variables and WebSocket path.

**Important deployment constraints:**
- A cloud backend cannot open a user's laptop webcam with `cv2.VideoCapture(0)`. Browser camera access must happen in the browser, with frames sent to the backend.
- A long-lived WebSocket and sustained inference load need platform support and sufficient resources.
- Free/low-memory plans may be unsuitable for PyTorch + Ultralytics + OpenCV, particularly if multiple models are loaded. Measure real resident memory and latency; do not use environment-variable heuristics as a substitute for resource testing.
- Multiple backend workers can duplicate model memory and have separate in-memory sessions. Start with one worker unless the architecture explicitly shares inference/session state.
- A container filesystem is not durable incident storage unless the platform explicitly provides a persistent volume.

---

## 7. Model accuracy: what must change

The current system uses a pretrained YOLO model and a weighted rule engine. The presence of a risk score does **not** mean the system has been trained to predict accidents. These outputs must not be conflated.

### Keep these concepts separate

1. **Object detection confidence:** the detector's score for a particular class/box.
2. **Detection quality:** precision, recall, mAP, and per-class results against labeled images/frames.
3. **Tracking quality:** ID switches, track fragmentation, continuity, and tracking metrics on labeled sequences.
4. **Risk score:** the output of the current heuristic rule engine. Unless calibrated on labeled risk events, it is not a probability.
5. **Risk-event quality:** precision, recall, F1, false alarms per hour/session, missed-event rate, and time-to-warning on labeled clips.
6. **System performance:** end-to-end latency, inference latency, processed FPS, dropped frames, memory, CPU/GPU utilization, and recovery behavior.

### Current model concerns to validate

- A general COCO-pretrained model may not detect the required weapon/sharp-object classes at all, or may have poor performance on small/occluded objects. A class in `unsafe_classes` does not create a detector class that the weights do not contain.
- The custom weapon model is searched for in several relative locations, but the path and class mapping are not made authoritative. The tracker should not assume that the custom model is being used merely because the file exists.
- Lowering confidence thresholds can improve recall but usually increases false positives. The current separate thresholds in detector/tracker and rule engine need to be documented and reconciled.
- A model trained on one camera domain may fail on webcam angles, lighting, resolution, and object sizes that differ from the training data.
- Object presence alone should not automatically be interpreted as an unsafe event. A knife or pair of scissors can be present in a normal context. The risk engine must be evaluated against normal examples too.
- The rule weights and cutoffs are hand-set defaults, not proof of predictive accuracy.

### Model and dataset integration plan

The user plans to supply additional model weights and datasets. **Do not integrate or merge them until their licenses, labels, classes, annotations, splits, and intended tasks are inspected.**

For each supplied model/dataset, record:

- Source, license, version, and intended use.
- Label/class list and exact class-ID mapping.
- Task type: image detection, tracking, action classification, anomaly detection, or anticipation.
- Camera/viewpoint/domain and clip/frame characteristics.
- Train/validation/test split and leakage safeguards.
- Annotation granularity (image/frame/video/event/time-to-event).
- Preprocessing and inference requirements.
- Model metrics from a held-out test set.
- Known limitations and failure cases.

Do not merge unrelated datasets into a single detection dataset simply because they all concern safety. They may use incompatible labels or task definitions. Specialist models can be trained and evaluated independently, then their outputs can feed a fusion layer after a shared calibration/evaluation set exists.

### Evaluation gates before claiming improved accuracy

**Gate A — detector baseline**
- Build a labeled test set representative of the actual webcam deployment.
- Report per-class precision/recall/mAP, confidence threshold, and false positives.
- Include small, occluded, distant, partially visible, and harmless lookalike objects.

**Gate B — tracking**
- Evaluate stable identity through motion and short occlusions.
- Report ID switches/fragmentation or an appropriate tracking metric.
- Test multiple simultaneous people/objects and two concurrent sessions.

**Gate C — risk rules**
- Label clips/scenarios as normal, potential risk, and high-priority risk according to a written annotation policy.
- Evaluate event-level precision/recall/F1 and false alarms per hour.
- Include benign handling of hazardous-category objects and scenes with no person present.

**Gate D — real-time system**
- Report median and p95 latency, processed FPS, dropped frames, CPU/RAM, startup time, and reconnect recovery.
- Repeat on the actual target deployment tier, not only a developer laptop.

**Gate E — anticipation (future scope)**
- Only claim pre-incident anticipation if the dataset has event timing and evaluation measures warning lead time. Frame-level object detection and rule scoring alone do not establish that an accident was predicted before it happened.

---

## 8. Target runtime architecture

### Browser camera flow

```text
Browser getUserMedia()
        |
Frame capture + resize + rate limit
        |
WebSocket: frame message + session ID
        |
FastAPI session manager
        |
Decode / validate frame
        |
Vision pipeline
  ├─ Detector
  ├─ Tracker (per-session state)
  ├─ Movement features
  └─ Risk rules + persistence
        |
DetectionFrame response
        |
WebSocket telemetry
        |
React dashboard
  ├─ Video overlay
  ├─ Object list
  ├─ Risk score + reasons
  ├─ Connection/latency telemetry
  └─ Incident event / snapshot workflow
```

### Uploaded video flow

```text
Browser upload
   |
Validate size/type/decode; store under generated upload ID
   |
POST start session with upload ID
   |
Server-side video decoder
   |
Same vision pipeline and DetectionFrame contract
   |
WebSocket telemetry
   |
Dashboard + explicit incident/snapshot events
   |
Cleanup temporary file after session expiry/retention period
```

### Recommended `DetectionFrame` contract

Keep the existing Pydantic schema as the starting point, but version and standardize it. Suggested shape:

```json
{
  "schema_version": "1.0",
  "session_id": "opaque-session-id",
  "sequence": 123,
  "timestamp": 1790000000.123,
  "source": "browser_camera",
  "objects": [
    {
      "id": 7,
      "class": "person",
      "confidence": 0.94,
      "bbox": {"x1": 10, "y1": 20, "x2": 100, "y2": 220},
      "track_status": "tracked"
    }
  ],
  "risk": {
    "score": 0.42,
    "level": "MEDIUM",
    "reasons": [
      {"rule": "proximity", "score": 0.5, "details": "Person and object are close in image space"}
    ],
    "rule_version": "v1"
  },
  "performance": {
    "inference_latency_ms": 42.5,
    "processed_fps": 12.0
  },
  "model": {
    "detector_name": "configured-model",
    "detector_version": "version-or-checksum"
  }
}
```

This is a target example, not a claim that the current backend emits this exact payload. The final schema must be agreed and implemented on both sides together.

Do not send a full base64 image on every telemetry message unless measurement proves it is acceptable. Send the video stream/display separately where practical; use an explicit snapshot/evidence endpoint or event for images that need to be retained.

---

## 9. Remove, consolidate, or defer

Do not delete anything just because it looks unused. Confirm imports/routes/feature behavior first.

### Likely consolidation/removal candidates

- Duplicate REST router registration and unneeded route aliases.
- Duplicate session/upload controls if `Controls.jsx` is not used and `VideoPanel.jsx` already owns the same UI.
- One of `SettingsModal.jsx` and `SettingsView.jsx` as a separate independent settings implementation; merge unique useful controls into one.
- Unused or inactive pose/weapon model loading until the corresponding specialist pipeline is integrated and tested.
- Hard-coded cloud URLs once environment configuration is the sole source of endpoint configuration.
- Duplicate direct `fetch()` implementations replaced by a single API client.
- Model switching controls if runtime model reload is not safely implemented.
- Any fake/demo telemetry or preview risk state that can be confused with actual model output.
- Any config field/rule that is never consumed by inference.
- Training notebooks/artifacts from the runtime image; training should remain an ML development workflow, not production startup behavior.
- Unneeded duplicate database drivers after the selected driver is tested. Do not remove a driver until deployment confirms which SQLAlchemy URL/driver is used.
- Old planning docs only after their unique requirements are consolidated into one current architecture/implementation document.

### Preserve for now

- React dashboard layout and most panel designs.
- FastAPI app and endpoint capabilities.
- Pydantic detection/risk schemas.
- Movement engine and its unit tests.
- Risk rules and risk-engine tests, while correcting semantics/calibration.
- Incident history and database model, while fixing storage behavior.
- Alert provider abstraction.
- Docker Compose and Dockerfiles, after making them the tested local path.
- Training script and experiment notebook, but keep training separate from production inference.
- Current test suite; expand it rather than replacing it.

---

## 10. Ordered refactor plan

Do this in small pull requests/commits. Keep the app runnable at every milestone.

### Phase 0 — Baseline and safety net

1. Create a refactor branch and tag the current state.
2. Record exact Python/Node versions and lock/pin runtime dependencies.
3. Run backend tests and frontend build; save failures before making changes.
4. Record current local startup, cloud startup, model files, environment variables, and logs.
5. Capture sample webcam/upload flows and a few representative detection payloads.
6. Confirm which frontend components are actually mounted/imported.
7. Never put secrets, model weights, or private datasets in Git.

**Deliverable:** baseline report with reproducible commands and known failures.

### Phase 1 — Fix startup and deterministic configuration

1. Fix `model_path` resolution in `tracker.py`.
2. Define a single project-root-based model path resolver.
3. Make required/optional models explicit.
4. Remove eager loading of unused pose/weapon models.
5. Validate `RiskConfig` updates, weight keys/sums, cutoff order, ranges, and supported classes.
6. Fix `SessionLocal` references in incident mutation routes.
7. Add tests for the bugs above.

**Acceptance:** backend starts locally, a session can initialize, configuration can be read/updated, and incident status/clear routes are tested.

### Phase 2 — Define the API and session protocol

1. Choose canonical routes and remove duplicate router mounting.
2. Define `browser_camera` and `uploaded_video` source modes.
3. Document start/stop/upload/session-state request/response schemas.
4. Make missing/expired session behavior explicit.
5. Standardize WebSocket message types, error codes, frame sequence, and telemetry.
6. Add size limits, upload cleanup, session expiry, and graceful stop behavior.
7. Add contract tests for normal and error cases.

**Acceptance:** frontend and backend agree on one API; invalid session/file/socket states show a useful error rather than creating ghost sessions.

### Phase 3 — Stabilize inference and tracking

1. Define a single `VisionPipeline` interface.
2. Decide whether `Detector` is the detector used by the pipeline; remove parallel inference paths.
3. Separate shared model weights from per-session tracker state.
4. Ensure track IDs are stable only when produced by a real tracker.
5. Add short occlusion grace periods and movement-state cleanup.
6. Ensure per-session movement/risk history cannot leak between sessions.
7. Establish one inference concurrency policy and measure memory under load.
8. Add logging for model path/version, inference latency, processed FPS, and failures.

**Acceptance:** webcam and uploaded-video paths use the same inference/risk pipeline and output schema; two sessions do not share track history accidentally.

### Phase 4 — Fix the frontend integration layer

1. Create the API client and central WebSocket URL helper.
2. Migrate every direct `fetch('/api/...')` to the client.
3. Move camera lifecycle into a hook; stop all media tracks on stop/unmount.
4. Add frame-rate/backpressure controls so the browser does not queue frames faster than inference can process them.
5. Standardize loading/error/disconnected/reconnecting/session-expired states.
6. Refactor `App.jsx` to compose views and feature hooks.
7. Consolidate settings; ensure all displayed controls correspond to effective backend config.
8. Split large components only at meaningful responsibility boundaries.

**Acceptance:** the same UI works against the local API and the configured deployed API without editing source code.

### Phase 5 — Choose and verify deployment

1. Choose one primary deployment topology.
2. Make Docker Compose the reproducible local environment, or document why another local setup is canonical.
3. Ensure Docker backend model paths are correct and model weights are present.
4. Configure frontend API and WebSocket URLs explicitly in the production environment.
5. Test HTTPS/WSS, CORS, WebSocket upgrades, file upload size, database connectivity, and health/readiness.
6. Measure cold start, memory, sustained FPS, latency, and session behavior on the actual hosting plan.
7. Ensure model startup failure produces a clear unhealthy state rather than a misleading healthy response.
8. Add CI steps: backend tests, frontend build, Docker build (if Docker is the supported path).

**Acceptance:** a clean deployment from the documented steps can start a session, process frames, show live telemetry, stop cleanly, and persist an incident.

### Phase 6 — Establish the model evaluation baseline

1. Inspect all supplied models and datasets before integration.
2. Record class mappings, license, task type, splits, and annotation quality.
3. Build a representative held-out test set for the intended deployment environment.
4. Evaluate the current detector per class.
5. Evaluate tracking separately from detection.
6. Evaluate risk-event behavior separately from both.
7. Record failure cases and choose improvements based on measured errors.
8. Add specialist action/pose/temporal models only when there is a clear task, dataset, evaluation plan, and deployment budget.

**Acceptance:** every accuracy claim is tied to a dataset split, metric, and model version.

### Phase 7 — Persistence and product hardening

1. Make production database mode explicit and durable.
2. Test incident creation, listing, review-status update, clearing, and storage failure.
3. Make Cloudinary snapshot failure visible and independent from DB failure.
4. Define incident deduplication, cooldown, retention, and operator review semantics.
5. Add request validation, rate limits where appropriate, and secret management.
6. Document privacy and data retention for video frames and incident snapshots.

**Acceptance:** incident records survive service restarts when production storage is configured; failures are visible and actionable.

---

## 11. Testing checklist

### Backend
- [ ] Import/start app without optional model files.
- [ ] Start a session with valid and invalid source data.
- [ ] Missing model weights fail with an actionable message.
- [ ] Detection schema and risk enum serialize consistently.
- [ ] Confidence threshold filters expected classes.
- [ ] Unknown classes are handled safely.
- [ ] Tracker handles no detections and short occlusions.
- [ ] Two sessions do not leak tracker or movement state.
- [ ] Movement speed/direction uses timestamps and documented units.
- [ ] Risk engine handles empty frames, low confidence, normal handling, and persistent risk.
- [ ] Config rejects invalid weights/cutoffs/classes.
- [ ] Upload validates size/type and rejects corrupted files.
- [ ] Unknown WebSocket session is rejected clearly.
- [ ] Client disconnect stops/cleans the session appropriately.
- [ ] Incident CRUD/status paths work with database and simulate DB failure.
- [ ] Snapshot upload failure does not silently imply successful image persistence.

### Frontend
- [ ] `npm run build` passes.
- [ ] Start/stop works repeatedly.
- [ ] Browser camera permission denial is handled.
- [ ] Camera tracks stop on stop/tab change/unmount.
- [ ] WebSocket reconnect does not create ghost sessions.
- [ ] Upload progress/errors are visible.
- [ ] Live overlay uses the correct frame dimensions and coordinates.
- [ ] Risk score, detector confidence, and connection state are clearly distinct.
- [ ] Config save errors are visible; UI reflects returned effective config.
- [ ] Incident status updates survive refresh.
- [ ] No production call depends on a hard-coded hostname or same-origin assumption.
- [ ] Demo/preview states cannot be mistaken for real inference.

### Deployment/performance
- [ ] Clean Docker build.
- [ ] Backend health/readiness checks are meaningful.
- [ ] HTTPS frontend to WSS backend works.
- [ ] CORS allows the intended frontend origin only.
- [ ] Sustained streaming test at expected session count.
- [ ] Memory measured after all intended models load.
- [ ] Cold-start and restart behavior recorded.
- [ ] Database persistence survives backend restart.
- [ ] Temporary uploads and session state are cleaned up.
- [ ] CI runs tests and build on every change.

---

## 12. Observability: log the information needed to debug reality

Every session should have a session ID and structured logs for:

- Session start/stop and source type.
- Model identifier, version/checksum, resolved path, device, and load duration.
- Frames received, frames processed, frames dropped, and decode failures.
- Inference latency, end-to-end latency, and processed FPS.
- WebSocket connection/disconnection and close reason.
- Detection count/classes and low-confidence state.
- Risk score, risk level, rule-set version, and contributing rule IDs.
- Memory/resource data when available.
- Incident persistence and snapshot-storage result.
- Upload/session cleanup.

Do not log raw video frames, secrets, or unnecessary personal data. Add a request/session correlation ID to frontend-visible errors where possible.

---

## 13. What must be supplied before the model refactor

When the model files and datasets are provided, inspect them before changing inference code. The minimum inventory is:

- Weight files and their intended architecture/task.
- Class names and exact class IDs.
- Dataset folder structure and annotation format.
- Dataset license/source.
- Train/validation/test split.
- Training scripts and metrics, if any.
- Image/video resolution and FPS.
- Expected target device and hosting resource budget.
- Example clips that currently fail, plus expected behavior.

Do not infer that a file called `weapon_yolo.pt` has the right labels, was trained correctly, or is used by production. Inspect the metadata and run controlled validation.

---

## 14. Final recommendations

### Keep
- React/Vite frontend and its established dashboard design.
- FastAPI backend.
- Pydantic schemas as the basis for a stable API contract.
- Movement engine, interpretable risk rules, and alert-provider abstraction.
- Incident-history feature and storage integrations, after reliability fixes.
- Existing tests and model-training workflow.

### Refactor first
- Model path/loading and optional model lifecycle.
- Session ownership and tracker-state isolation.
- Video-source contract and WebSocket protocol.
- API URL handling and duplicate REST routes.
- Risk configuration and duplicate settings UIs.
- Incident persistence and error reporting.
- Deployment topology and environment configuration.

### Defer
- More models, learned risk fusion, and accident anticipation.
- External SMS/emergency-contact integrations.
- Multi-camera/edge deployment.
- Major dashboard redesign.
- Complex orchestration or infrastructure that the current usage does not require.

### Definition of done for the first stable refactor

A user can open the web dashboard, start a browser-camera session or upload a video, see live detections and stable track IDs, understand the current heuristic risk score and its reasons, stop the session cleanly, and review a persisted incident. The app can be deployed from documented instructions with a known model version and no hard-coded environment-specific source edits. Tests cover the critical contracts, and detector accuracy, tracking quality, risk-event quality, and latency are reported separately.

**Product principle:** Vision Guard is a real-time safety-monitoring software system. The ML models are components inside the product—not the product itself. The refactor succeeds when the whole pipeline is reliable, measurable, and understandable, not merely when a bounding box appears.


---

## 15. Newly supplied dataset audit — Weapon Detection v1 (Roboflow YOLOv8)

**Archive inspected:** `Weapon Detection.v1-dataset.yolov8.zip`

**Source metadata inside the archive:**
- Roboflow project: `fypweapon/weapon-detection-sckyd`
- Version: 1
- Export date recorded in the README: October 30, 2023
- License stated by the archive: **CC BY 4.0**. Preserve attribution and verify the license/source page before redistribution or public release.
- Annotation format: YOLOv8 object-detection text labels
- Export preprocessing: auto-orientation/EXIF stripping and resize to 416×416 using stretch; README says no augmentation was applied in the export.

### 15.1 Inventory observed in the ZIP

| Item | Observed result |
|---|---:|
| Total ZIP entries | 7,199 |
| Images | 3,595 JPG files |
| Train images + label files | 2,517 + 2,517 |
| Validation images + label files | 1,078 + 1,078 |
| Test images | 0 |
| Bounding-box annotations | 4,734 |
| Empty label files | 16 (10 train, 6 validation) |
| Malformed non-empty label rows detected by basic parsing | 0 |
| Bounding-box values outside normalized YOLO range / non-positive width or height | 0 |
| Exact duplicate image files within this archive (byte hash) | 0 |

The archive's `data.yaml` defines `train`, `val`, and `test` paths, but the ZIP contains only `train/` and `valid/`. **There is no independent test split.** Do not treat validation metrics as final held-out test results.

The image/label filename stems match in the train and validation splits. The 16 empty label files may be intentional negative/background images, but that must be confirmed before treating them as valid no-object examples.

### 15.2 Important blocker: class taxonomy is ambiguous

The `data.yaml` class list is:

```yaml
nc: 8
names: ['0', '1', '2', 'Gun', 'Guns', 'Handgun', 'Knife', 'Rifle']
```

The archive contains 4,734 boxes distributed by numeric class ID as follows:

| Class ID | Name declared in YAML | Box count |
|---:|---|---:|
| 0 | `0` | 263 |
| 1 | `1` | 374 |
| 2 | `2` | 778 |
| 3 | `Gun` | 501 |
| 4 | `Guns` | 890 |
| 5 | `Handgun` | 345 |
| 6 | `Knife` | 583 |
| 7 | `Rifle` | 1,000 |
| **Total** | | **4,734** |

Classes `0`, `1`, and `2` have no semantic names in the metadata. The names `Gun`, `Guns`, and `Handgun` may also overlap semantically. The archive alone does not explain whether these are distinct categories, annotation mistakes, or labels whose names were lost during export.

**Do not silently rename or merge classes.** Before training, inspect the original Roboflow project/label definitions and sample annotations/visualizations to establish the intended meaning of every class ID. If the original definitions cannot be recovered, document the uncertainty and create an explicit reviewed mapping based on annotation inspection.

### 15.3 How this dataset fits Vision Guard

This is an **image object-detection dataset**, not a movement/action or accident-anticipation dataset. It can potentially support fine-tuning or evaluating a weapon-object detector, once the class taxonomy is verified. It cannot, by itself, teach the system:
- whether an object is being used dangerously;
- how a person is moving over time;
- whether an event is likely to escalate;
- whether an accident will happen before it happens.

The existing `yolov8n.pt` and `yolov8s.pt` are model weights; this dataset is labeled data. They are separate assets and must not be assumed to have been trained on this dataset.

### 15.4 Recommended use plan

1. **Keep the original ZIP immutable** and record its checksum/version.
2. **Recover and verify the class definitions** for IDs 0–7 before any training run.
3. Render a review grid with YOLO boxes and class labels; inspect a representative sample from each class, including the three numeric-name classes.
4. Verify the 16 empty label files are intentional negative examples rather than missing annotations.
5. Create a genuinely independent test split. Prefer a source/video/person-level split when provenance permits, to reduce near-duplicate or scene leakage across train/validation/test.
6. Train a baseline only after taxonomy review. Record the exact base checkpoint (`yolov8n.pt` or `yolov8s.pt`), image size, hyperparameters, package versions, class mapping, random seed, and split manifest.
7. Compare the fine-tuned checkpoint with the unmodified base checkpoint on the **same held-out test set**.
8. Report per-class precision, recall, mAP50, mAP50–95, confusion/error examples, and inference latency. Do not report a single accuracy number without the class-wise context.
9. Test on the separately supplied short videos as a **deployment-domain check**, not as training data by default. Annotate representative frames/events first and keep them separate from training if they are intended to measure generalization.
10. Integrate the resulting detector through the single `VisionPipeline`/model-registry path described earlier. Do not add a separate inference implementation just for this dataset.

### 15.5 Decision

**Status: useful candidate dataset, not ready for training until the class taxonomy is resolved.**

The most urgent next step is not to launch training. It is to verify what every class ID means, then create a clean held-out test split. The archive parses structurally as YOLO-style labels, but structural validity is not evidence that the annotations or category definitions are semantically correct.

