# Vision Guard V1 - Project Scaffold Complete

## Structure Created

```
vision-guard/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI entrypoint
│   │   ├── api/
│   │   │   ├── routes.py           # REST endpoints
│   │   │   └── websocket.py        # WebSocket /ws/detection
│   │   ├── detection/
│   │   │   ├── detector.py         # YOLO detector wrapper
│   │   │   └── tracker.py          # Ultralytics tracker wrapper
│   │   ├── movement/
│   │   │   └── movement_engine.py  # Velocity, direction, smoothing
│   │   ├── risk/
│   │   │   ├── config.py           # ALL thresholds/weights (single source)
│   │   │   ├── rules.py            # Individual rule functions
│   │   │   └── risk_engine.py      # Aggregation, persistence, levels
│   │   ├── video/
│   │   │   └── stream.py           # Video capture + session management
│   │   ├── schemas/
│   │   │   └── detection.py        # Pydantic models (shared with frontend)
│   │   └── tests/
│   ├── models/
│   │   └── README.md               # Model weights go here (not in Git)
│   ├── tests/
│   │   └── test_risk_engine.py     # Mandatory risk engine unit tests
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── VideoPanel.jsx      # Video + detection overlay
│   │   │   ├── RiskPanel.jsx       # Risk score, level, reasons
│   │   │   ├── ObjectsList.jsx     # Detected objects table
│   │   │   ├── WarningPanel.jsx    # HIGH risk warning display
│   │   │   └── Controls.jsx        # Session start/stop, config
│   │   ├── hooks/
│   │   │   └── useDetectionWebSocket.jsx  # WebSocket with reconnect
│   │   ├── App.jsx                 # Main app component
│   │   ├── main.jsx                # Entry point
│   │   └── index.css               # Tailwind imports
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
├── data/                           # Datasets (not in Git)
├── experiments/                    # Notebooks only
├── docs/
│   ├── README.md
│   ├── architecture.md
│   └── model.md
└── AGENTS.md                       # Your instructions
```

## Next Steps

### 1. Install Backend Dependencies
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Download Model
```bash
cd backend/models
wget https://github.com/ultralytics/assets/releases/download/v8.3.0/yolov8n.pt
```

### 3. Install Frontend Dependencies
```bash
cd frontend
npm install
```

### 4. Run Backend
```bash
cd backend
.venv\Scripts\activate
uvicorn app.main:app --reload
```

### 5. Run Frontend
```bash
cd frontend
npm run dev
```

### 6. Run Tests
```bash
cd backend
pytest tests/ -v
```

## Key Architecture Points Implemented

✅ Independent ML components (detector, tracker, movement, risk engine)
✅ All config in `backend/app/risk/config.py` only
✅ Schemas defined once in `backend/app/schemas/detection.py`
✅ WebSocket streaming with DetectionFrame schema
✅ Persistence window prevents single-frame HIGH risk
✅ Low confidence handling shows "LOW CONFIDENCE" reason
✅ Tests for risk rules, normalization, persistence, level boundaries