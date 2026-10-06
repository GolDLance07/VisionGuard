# Vision Guard V1 🛡️

**Real-Time Visual Safety Monitoring System**

Vision Guard is an end-to-end computer vision and rule-based risk evaluation system designed for real-time safety monitoring. It ingests video from live webcams or uploaded recordings, runs object detection and persistent multi-object tracking, calculates spatial kinematic trajectories, evaluates multi-factor safety rules, and streams rich visual and audio alerts to an interactive React dashboard via WebSockets.

---

## 🌟 Key Features

### 1. Multi-Stage Computer Vision Pipeline
- **YOLO Object Detection**: Powered by Ultralytics YOLOv8 models (`yolov8n` for ultra-low latency, `yolov8s` for higher precision on compact objects like knives, scissors, and tools).
- **Persistent Multi-Object Tracking**: Uses ByteTrack to assign consistent track IDs across frames even during temporary occlusions.
- **Kinematic Movement Analysis**: Computes real-time object velocity, displacement, and heading vectors with exponential moving average (EMA) smoothing and visual directional arrows.
- **Edge-to-Edge Spatial Proximity**: Measures true boundary distance between tracked persons and detected hazardous objects.

### 2. Hazard Categorization & Audio Voice Announcements
- **Unified Hazard Categorization**: Intelligently groups classes into clear safety categories (e.g. `knife` and `scissors` $\rightarrow$ **"Sharp Object"**; `gun` and `pistol` $\rightarrow$ **"Firearm"**; `baseball bat` and `crowbar` $\rightarrow$ **"Blunt Weapon"**).
- **Text-to-Speech (TTS) Voice Alerts**: Voice synthesis automatically announces safety threats (e.g., *"Warning. Sharp object detected"*) with smart cooldown throttling to avoid alert fatigue.
- **Visual Alert Banners**: Color-coded callouts display the active hazard category, underlying detected class, and model confidence score directly over the video stream.

### 3. Rule-Based Multi-Factor Risk Engine
- **Non-Negotiable Centralized Config**: All weights, score cut-offs, and speed/distance thresholds reside in `backend/app/risk/config.py`.
- **Evaluated Safety Factors**:
  - **Unsafe Object Presence**: Heavy weight applied when weapons or sharp objects are detected with high confidence.
  - **Person-to-Hazard Proximity**: Normalized inverse distance scoring when people and hazardous items converge.
  - **Movement Velocity**: Accelerating or erratic speed scores.
  - **Approach Trend**: Approaching trajectory analysis between interacting entities.
- **Persistence Window Protection**: Guarantees zero single-frame false alarms. Sustained threshold triggers are required before escalating to `HIGH` risk.

### 4. Incident Log & Evidence Snapshots
- **Automatic High-Resolution Evidence Capture**: When elevated risk thresholds are met, Vision Guard captures timestamped evidence frames.
- **Hazard & Timestamp Logging**: Incident cards explicitly highlight the detected category (e.g. `⚠️ Sharp Object Detected`), exact capture time (`🕒 12:55:04 AM`), confidence levels, and contributing trigger rules.
- **Modal Inspection & Download**: Click any logged incident to inspect the full-resolution frame, review factor breakdowns, or export evidence.

### 5. Operator Control Panel & Runtime Tuning
- **Live Model Switcher**: Toggle between `yolov8n.pt` and `yolov8s.pt` on the fly without restarting the server.
- **Real-Time Calibration**: Live sliders to tune detection confidence, proximity sensitivity, audio alert toggles, and frame skip rates via `POST /config`.
- **Flexible Ingestion**: Switch seamlessly between connected webcams and local video file uploads.

---

## 🏗️ Architecture & Data Flow

```text
[ Camera / MP4 Upload ]
          │
          ▼
 [ OpenCV Frame Capture ] ──> Timestamped BGR Frames
          │
          ▼
   [ YOLOv8 Model ] ───────> Filtered Classes (person, knife, scissors, etc.)
          │
          ▼
     [ ByteTrack ] ─────────> Persistent Track IDs & History
          │
          ▼
 [ Movement Engine ] ───────> Velocity, Direction Vectors, Proximity
          │
          ▼
   [ Risk Engine ] ─────────> Weighted Rule Aggregation & Temporal Smoothing
          │
          ▼
   [ FastAPI / WS ] ────────> Stream DetectionFrame JSON over /ws/detection
          │
          ▼
[ React + Vite Dashboard ] ──> Real-time canvas overlay, Voice TTS, Incident Log
```

---

## 📁 Repository Structure

```
vision-guard/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI application & lifespan management
│   │   ├── api/
│   │   │   ├── routes.py           # REST endpoints (/health, /session/*, /config, /upload)
│   │   │   └── websocket.py        # Real-time WebSocket streaming (/ws/detection)
│   │   ├── detection/
│   │   │   ├── detector.py         # YOLO detector wrapper with category mapping
│   │   │   └── tracker.py          # Ultralytics ByteTrack wrapper
│   │   ├── movement/
│   │   │   └── movement_engine.py  # Kinematics, smoothing, and velocity vectors
│   │   ├── risk/
│   │   │   ├── config.py           # Single source of truth for all thresholds & weights
│   │   │   ├── rules.py            # Individual rule functions & hazard categorization
│   │   │   └── risk_engine.py      # Score normalization, persistence, and classification
│   │   ├── video/
│   │   │   └── stream.py           # Thread-safe video capture & processing loop
│   │   └── schemas/
│   │       └── detection.py        # Shared Pydantic models (mirrored in frontend)
│   ├── models/                     # Model weights directory (gitignored)
│   │   ├── yolov8n.pt              # YOLOv8 Nano weights
│   │   └── yolov8s.pt              # YOLOv8 Small weights
│   ├── tests/                      # Pytest test suite (26 unit/integration tests)
│   ├── requirements.txt            # Python dependencies
│   └── pytest.ini                  # Pytest configuration
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── VideoPanel.jsx      # Video stream, SVG vector overlays & TTS alerts
│   │   │   ├── RiskPanel.jsx       # Risk score gauge, level badge & contributing rules
│   │   │   ├── ObjectsList.jsx     # Tracked objects table with IDs and velocities
│   │   │   ├── WarningPanel.jsx    # Persistent HIGH risk warning banner
│   │   │   ├── IncidentHistory.jsx # Incident log cards with timestamp & snapshot preview
│   │   │   ├── SettingsModal.jsx   # Live configuration drawer & model selector
│   │   │   └── Controls.jsx        # Camera/upload source selector & session controls
│   │   ├── hooks/
│   │   │   └── useDetectionWebSocket.jsx # WebSocket client with automatic reconnection
│   │   ├── App.jsx                 # Application layout and incident capture logic
│   │   └── index.css               # Tailwind CSS styles
│   ├── package.json                # Frontend dependencies
│   └── vite.config.js              # Vite server & proxy configuration
└── AGENTS.md                       # Architectural rules and guidelines
```

---

## 🚀 Getting Started

### Prerequisites
- **Python**: 3.10 to 3.14 installed
- **Node.js**: v18.x or later with `npm`
- **Git**

---

### Step 1: Backend Setup

Open a terminal (PowerShell on Windows or bash on Linux/macOS) in the repository root:

```powershell
# Navigate to the backend directory
cd backend

# Create a virtual environment
python -m venv .venv

# Activate the virtual environment
# Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# Linux / macOS:
# source .venv/bin/activate

# Install dependencies (use --only-binary :all: for precompiled packages)
pip install -r requirements.txt --only-binary :all:
```

#### Download Models (Optional — auto-downloaded on first run)
Ultralytics will automatically download the base model if not present, or you can pre-download them into `backend/models/`:
```powershell
# Using Python to cache models
python -c "from ultralytics import YOLO; YOLO('yolov8n.pt'); YOLO('yolov8s.pt')"
```

#### Start the Backend Server
```powershell
uvicorn app.main:app --port 8000 --reload
```
The FastAPI backend will start at `http://localhost:8000`. You can inspect the interactive Swagger API documentation at `http://localhost:8000/docs`.

---

### Step 2: Frontend Setup

Open a second terminal window:

```powershell
# Navigate to the frontend directory
cd frontend

# Install dependencies
npm install

# Start the Vite development server
npm run dev
```

The frontend will start at **`http://localhost:5173`**. The Vite dev server automatically proxies API requests (`/api`) and WebSocket connections (`/ws`) to `http://localhost:8000`.

---

## 🧪 Testing & Validation

### Run Backend Pytest Suite
Vision Guard enforces mandatory unit tests for all risk calculation rules, normalization bounds, kinematic movements, persistence windows, and API schemas:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m pytest tests/ -v
```
*Expected: 26 passed tests.*

### Validate Frontend Production Build
```powershell
cd frontend
npm run build
```

---

## 📡 API Contract

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check & system liveness |
| `POST` | `/session/start` | Start monitoring session (`source: "webcam"` or `"upload"`) |
| `POST` | `/session/stop` | Stop monitoring session and release video/camera handles |
| `POST` | `/upload` | Upload video file for file-based analysis |
| `GET` | `/config` | Retrieve current tunable thresholds and weights |
| `POST` | `/config` | Dynamically update active configuration & YOLO model |
| `WS` | `/ws/detection` | Full-duplex WebSocket streaming `DetectionFrame` JSON payloads |

### Sample WebSocket Output Payload (`DetectionFrame`)
```json
{
  "timestamp": 1775501700.12,
  "objects": [
    {
      "id": 1,
      "class_name": "person",
      "category": "Person",
      "confidence": 0.89,
      "bbox": [120, 80, 310, 480],
      "velocity": [1.2, 0.4],
      "speed": 1.26,
      "heading": 18.4
    },
    {
      "id": 2,
      "class_name": "scissors",
      "category": "Sharp Object",
      "confidence": 0.84,
      "bbox": [280, 220, 340, 290],
      "velocity": [0.8, -0.2],
      "speed": 0.82,
      "heading": 345.9
    }
  ],
  "risk_score": 0.88,
  "risk_level": "HIGH",
  "reasons": [
    {
      "rule": "unsafe_object",
      "score": 0.84,
      "details": "Sharp Object detected (scissors, 84% conf)"
    },
    {
      "rule": "object_proximity",
      "score": 0.92,
      "details": "Person and Sharp Object in critical proximity (42px)"
    }
  ],
  "frame": "<base64_encoded_jpeg_string>"
}
```

---

## 🛡️ Demo Safety Protocol & Disclaimers

1. **Harmless Props Only**: In accordance with the project safety protocol, live tests must use harmless props only (e.g. blunt kitchen spoons, toy items, or pre-recorded evaluation clips).
2. **Neutral Language**: Alerts communicate observable physical conditions (e.g. *"POTENTIAL SAFETY RISK"*, *"Sharp Object Detected"*) rather than speculative human intent.
3. **Operator Verification**: Vision Guard provides automated real-time situational awareness to assist human supervisors; it is not a replacement for qualified security personnel.