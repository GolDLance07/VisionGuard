# Architecture

## System Overview
```
Camera/Video → VideoStreamManager → Tracker → MovementEngine → RiskEngine → WebSocket → React Dashboard
```

## Components

### VideoStreamManager (`app/video/stream.py`)
- Manages multiple sessions
- Handles webcam and file sources
- Runs capture loop in async generator

### Detector (`app/detection/detector.py`)
- YOLO wrapper with confidence threshold
- Filters by unsafe-class allow-list + person

### Tracker (`app/detection/tracker.py`)
- Ultralytics built-in tracker (BoT-SORT/ByteTrack)
- Persistent track IDs across frames
- Track expiry management

### MovementEngine (`app/movement/movement_engine.py`)
- Velocity, speed, direction, displacement
- Smoothing via sliding window
- Per-track state management

### RiskEngine (`app/risk/risk_engine.py`)
- Rule-based aggregation with weights
- Persistence window for HIGH risk (≥50% frames + min_persistence_duration)
- Level classification (LOW/MEDIUM/HIGH/LOW_CONFIDENCE)
- Person-object distance history and approach trend tracking

### Rules (`app/risk/rules.py`)
- `unsafe_object`: Detect weapons/knives with low confidence handling
- `proximity`: Person-object distance thresholding
- `distance_trend`: Rate of approach (decreasing person-object distance)
- `multiple_people`: Multi-person situational context near unsafe object
- `speed`: Movement velocity thresholding
- `direction_change`: Erratic motion

### AlertManager (`app/risk/alert_manager.py`)
- Extensible alert notification interface (TRD §6.9)
- Dashboard alert provider with logging

## Data Flow
1. Frame captured → resized to processing resolution
2. Tracker runs detection + tracking in background worker thread
3. MovementEngine updates per-track kinematics with smoothing window
4. RiskEngine computes relationships, trends, and aggregates weighted rules
5. AlertManager dispatched if conditions met
6. Processed frame encoded as JPEG base64 and streamed with telemetry via WebSocket
7. React dashboard renders live video, bounding boxes, proximity lines, and HUD metrics

## Configuration
All tunable values in `app/risk/config.py` (RiskConfig class).
Exposed via `GET /config` and `GET /api/config`. Video uploads handled via `POST /api/session/upload`.