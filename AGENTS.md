# Vision Guard V1 — Agent Instructions

## Project Overview
Real-time visual safety monitoring: webcam/video → YOLO detection → tracking → movement analysis → rule-based risk engine → React dashboard via WebSocket. V1 MVP = Milestones 1-4 (detection → tracking → relationships → persistent warnings).

**Monorepo layout:**
```
vision-guard/
  backend/     # FastAPI, Python, Ultralytics YOLO, OpenCV
  frontend/    # React + Vite + Tailwind
  data/        # datasets (never committed)
  experiments/ # notebooks only
  docs/        # architecture.md, model.md
```

---

## Essential Commands

### Backend (Windows PowerShell)
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt --only-binary :all:
# Download model if missing:
# wget https://github.com/ultralytics/assets/releases/download/v8.3.0/yolov8n.pt -O models/yolov8n.pt
uvicorn app.main:app --reload
```

### Frontend
```powershell
cd frontend
npm install
npm run dev          # dev server at localhost:5173 (proxies /api, /ws to backend)
npm run build        # production build to dist/
```

### Tests
```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m pytest tests/ -v
```

---

## Architecture Principles (Non-Negotiable)
1. **Independent ML components** — detector, tracker, movement, risk engine are separate modules with clear interfaces
2. **One working end-to-end path always** — camera → backend → frontend must work at every milestone
3. **Configuration separate from logic** — all thresholds/weights in `risk/config.py` only
4. **No hardcoded values** — never put thresholds in multiple files
5. **Models/weights outside Git** — `backend/models/README.md` explains this
6. **Schemas defined once** — Pydantic in `schemas/detection.py`, mirrored in frontend
7. **Log everything** — model latency per frame, every risk decision with reasons

---

## Key Files to Know
| File | Purpose |
|------|---------|
| `backend/app/main.py` | FastAPI entrypoint, session lifecycle |
| `backend/app/api/routes.py` | REST endpoints (`/health`, `/session/start`, `/session/stop`, `/config`) |
| `backend/app/api/websocket.py` | WebSocket `/ws/detection` streaming |
| `backend/app/detection/detector.py` | YOLO wrapper with allow-list & confidence threshold |
| `backend/app/detection/tracker.py` | Ultralytics tracker wrapper (persistent IDs) |
| `backend/app/movement/movement_engine.py` | Velocity, direction, displacement with smoothing |
| `backend/app/risk/risk_engine.py` | Rule aggregation, normalisation, level classification |
| `backend/app/risk/rules.py` | Individual rule functions returning (score, reason) |
| `backend/app/risk/config.py` | **Single source of truth for all thresholds/weights** |
| `backend/app/video/stream.py` | Camera/file frame capture with timestamps |
| `backend/app/schemas/detection.py` | Pydantic models for WebSocket payload |

---

## Development Workflow
- **Milestone order**: M1 (detect) → M2 (track+move) → M3 (relationships+risk) → M4 (persistence+warnings)
- **At every milestone**: camera → backend → frontend must work
- **Branch rules**: short-lived feature branches, PRs with ≥1 reviewer
- **Definition of Done** (every task):
  - Code follows TRD §14 engineering rules
  - No thresholds outside `risk/config.py`
  - Tests added/updated, risk engine tests pass
  - Schema changes backward compatible
  - Model latency & risk decisions logged
  - End-to-end verified working
  - Model/dataset changes documented in `docs/model.md`

---

## Testing Requirements
- **Unit (mandatory)**: risk rules, normalisation, level boundaries, persistence logic, movement maths, schema validation
- **Integration**: replay recorded clip through full pipeline, assert risk level sequence
- **E2E**: start backend+frontend, run demo clip, verify dashboard shows boxes, score, warning, reasons
- **Test conditions**: normal/low light, motion blur, occlusion, angles, distances, backgrounds, multiple people, hidden objects
- **Safety**: harmless props only, no real weapons, no committed footage of people

---

## Common Pitfalls to Avoid
- ❌ Hardcoding thresholds anywhere except `risk/config.py`
- ❌ Committing model weights or datasets to Git
- ❌ Sending raw model internals over WebSocket (use defined schemas)
- ❌ Training custom models before end-to-end app works (M5+ only)
- ❌ Blocking FastAPI event loop with inference (use background thread/task)
- ❌ Single-frame HIGH risk (guaranteed impossible by persistence window)
- ❌ HIGH risk from low-confidence detections (must show LOW CONFIDENCE)

---

## Configuration (All Tunable Values)
Centralised in `risk/config.py` + backend settings → `GET /config`:
- Detection confidence threshold, unsafe-class allow-list, model path
- Frame-skip, processing resolution
- Track expiry, smoothing window
- Movement speed thresholds, proximity distance thresholds
- Score weights, LOW/MEDIUM/HIGH cut-offs
- Persistence window, minimum persistence duration
- Low-confidence threshold, audio alert on/off

---

## API Contract (Stable)
```
GET  /health                    → liveness
POST /session/start             → {source: "webcam"|"upload", device_index?, file_ref?}
POST /session/stop              → stop & release camera
GET  /config                    → all tunable values
WS   /ws/detection              → stream of {timestamp, objects[], risk_score, risk_level, reasons[]}
```
Object schema: `{id, class, confidence, bbox[x1,y1,x2,y2]}`

---

## Frontend Structure
```
frontend/src/
  components/ # VideoPanel, RiskPanel, ObjectsList, WarningPanel, Controls
  hooks/      # useDetectionWebSocket() → latest state
```
UI depends only on API schema, never on ML internals.

---

## V1 Non-Goals (Binding)
No facial recognition, emotion detection, intent prediction, SMS/email alerts, mobile app, multi-camera, LLM reasoning, merged-dataset training, cloud infrastructure.

---

## Documentation Sources
- **PRD** — what/why, functional requirements, success criteria
- **TRD** — technical design, component specs, schemas, engineering rules
- **App Flow** — user journey, pipeline, risk decision flow, warning state machine
- **Implementation Plan** — milestone tasks, exit criteria, test matrix, demo script

---

## Demo Safety Protocol
- Use harmless props (blunt kitchen utensil, toy) or recorded clips
- Never real weapons
- Neutral language: "POTENTIAL SAFETY RISK" not "DANGER"
- System disclaimer: reports observable conditions only, human verification expected

---

## Known Quirks (Verified)
- **Python 3.14**: numpy 2.x fails to build from source; use `--only-binary :all:` or rely on pre-installed numpy
- **Windows PowerShell**: use `.\.venv\Scripts\Activate.ps1` not `source .venv/bin/activate`
- **Ultralytics**: auto-downloads model on first run if `models/yolov8n.pt` missing; prefer explicit download
- **Frontend WebSocket**: proxied via Vite config (`/ws` → `ws://localhost:8000`); runs on port 5173
- **Risk persistence**: HIGH risk requires ≥50% of persistence_window frames + min_persistence_duration (0.5s default)