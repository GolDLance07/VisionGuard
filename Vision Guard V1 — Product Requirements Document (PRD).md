# Vision Guard V1: Product Requirements Document

Team: Peak Vision · Team Leader: Aarush Rahul Patel · IEEE Hackathon 2026 · Problem Statement PS 03.1 · Track: Computer Vision / Detection / Applied ML

Version 1.0 · Status: Draft for build · Source: Vision Guard V1 Software Project Handoff

## 1. Purpose of this document

This PRD defines what Vision Guard V1 is, who it is for, what it must do, and how we will know it succeeded. It is the product-level source of truth. Technical choices are in the TRD, build order is in the Implementation Plan, and screens and flows are in the App Flow and UI/UX document.

## 2. Product summary

Vision Guard is a real-time, context-aware visual safety monitoring application. It takes a camera feed (live webcam or uploaded video), detects people and a small set of potentially unsafe objects, tracks them across frames, analyses movement and proximity, computes an explainable risk score, and shows a warning with reasons on a web dashboard.

Vision Guard is not a YOLO notebook. It is a real-time safety monitoring software system with machine learning models as replaceable components inside it.

### 2.1 The core idea

A basic system does: Camera → Detect knife → Alert. This is noisy, context-free, and prone to false alarms.

Vision Guard V1 does: Camera → Object Detection → Person/Object Tracking → Movement Analysis → Risk Rules → Risk Score → Web Dashboard → Warning.

The system reasons about the combination of detected objects, detected people, movement, distance between objects and people, and persistence over multiple frames.

### 2.2 What V1 is deliberately not

V1 does not try to be a universal accident-prediction system. Its goal is a working product that establishes the core architecture for future pre-incident risk anticipation. V1 is intentionally small.

## 3. Problem statement

Passive cameras record video, and a human must notice what matters. Human monitoring is slow, tiring, and misses safety-critical events. Unsafe objects can appear unexpectedly in homes, campuses, workplaces and public spaces.

Existing detection-only tools flag an object with no context. A knife lying on a kitchen counter and a knife moving quickly toward a person look the same to them. This produces either missed events or constant false alarms.

The opportunity is to turn an ordinary webcam into a proactive monitoring tool that considers context and always explains its decisions.

## 4. Goals and non-goals

### 4.1 Goals

- G1: Deliver a working end-to-end application (camera → backend → web dashboard) at every milestone.
- G2: Detect people and a limited set of unsafe objects in real time.
- G3: Track detected objects with persistent IDs and estimate movement.
- G4: Compute a rule-based, explainable risk score from observable signals.
- G5: Show a clear warning only when risk conditions persist, and always show the reasons.
- G6: Keep ML components independent and replaceable so more advanced models can be plugged in later.
- G7: Present as a professional, calm safety monitoring tool, not a dramatic alarm product.

### 4.2 Non-goals for V1

- Universal accident prediction
- Facial recognition or person identification
- Emotion detection
- Criminal profiling or intent prediction
- Automatic police contact or emergency services
- SMS, email or emergency-contact notification (architecture must allow it later)
- Complex cloud infrastructure
- Mobile application
- Multi-camera support
- LLM reasoning, huge multimodal models, or a custom Transformer from scratch
- One giant model trained on merged datasets

## 5. Guiding principles

1. Observable conditions only. The system evaluates what is visible: objects, people, movement, distance, persistence. It never infers criminal intent, personality, emotion, identity, or whether someone will hurt another person.
2. Explainable by default. Every risk decision comes with reasons. The UI never shows a bare "AI says dangerous."
3. No single-frame alarms. A high-risk alert needs a condition to persist over a rolling time window.
4. Fail gracefully. Low detection confidence shows LOW CONFIDENCE, never HIGH RISK.
5. Product first, models second. A working application always exists; models are plugged in over time.
6. Keep it small. Do not optimise prematurely and do not add infrastructure V1 does not need.

## 6. Target users and use cases

### 6.1 Primary users

- Safety monitor / operator: a person responsible for watching a space (campus staff, workplace safety officer, facility supervisor) who wants help noticing events.
- Individual or home user: someone using a laptop webcam to monitor a room or entrance.
- Hackathon evaluators / demo audience: need to understand the system and its reasoning within minutes.

### 6.2 Core use cases

- UC1: Operator opens the dashboard, starts the webcam, and watches live video with detection overlays.
- UC2: Operator uploads a recorded video and reviews detections, tracking and risk over time.
- UC3: A potentially unsafe object appears near a person with rapid movement; the dashboard raises a warning with reasons.
- UC4: A knife is simply sitting in view with no person nearby or no movement; the system shows low or medium risk and does not alarm.
- UC5: Operator adjusts configuration (for example thresholds) and sees updated behaviour.

## 7. Scope of V1

### 7.1 Inputs

- Live webcam
- Uploaded video file

### 7.2 Detection

- Person
- Selected potentially unsafe objects, initially limited to: knife, scissors, firearm (only if the chosen model or dataset supports it), and other explicitly supported objects.
- The product will not try to detect every possible unsafe object.

### 7.3 Tracking and movement

- Person position and object position
- Object-to-person and person-to-person distance
- Movement speed and direction
- Persistence across frames

### 7.4 Risk

A simple, configurable, rule-based risk score using observable signals. Example combination: unsafe object detected + person detected + rapid movement + object approaching another person + pattern persists = POTENTIAL SAFETY RISK.

### 7.5 Alerts

- Visual warning on the dashboard (required)
- Browser or system sound (optional)

## 8. Functional requirements

Priority: P0 = required for the MVP demo, P1 = should have in V1, P2 = nice to have.

### 8.1 Video input

- FR-01 (P0): The user can start and stop a webcam session from the dashboard.
- FR-02 (P1): The user can upload a video file and have it processed as a session.
- FR-03 (P0): Live video is displayed in the dashboard with minimal delay.

### 8.2 Detection

- FR-04 (P0): The system detects people and supported unsafe objects in each processed frame.
- FR-05 (P0): Each detection includes class, confidence and bounding box.
- FR-06 (P0): The detector is accessed through an abstract interface so the underlying model can be swapped.
- FR-07 (P0): Detections below a configurable confidence threshold are treated as low confidence.

### 8.3 Tracking and movement

- FR-08 (P0): Each detected person and object receives a persistent ID (for example Person #1, Knife #1).
- FR-09 (P0): The system maintains for each tracked item: ID, class, bounding box, centre, timestamp, velocity.
- FR-10 (P0): The system estimates velocity, direction and displacement from centre positions over time, using timestamps or frame rate.
- FR-11 (P1): Movement values are smoothed to avoid noisy alerts.
- FR-12 (P0): The system computes distance between person and object, and between person and person.

### 8.4 Risk engine

- FR-13 (P0): The system computes a risk score between 0.0 and 1.0 from observable signals: unsafe object detected, object confidence, person present, object motion, person motion, object-person distance, multiple people, persistence.
- FR-14 (P0): The score maps to LOW, MEDIUM or HIGH using configurable thresholds stored in one configuration location.
- FR-15 (P0): Every risk result includes a list of human-readable reasons.
- FR-16 (P0): A single frame never triggers HIGH risk. A rolling time window must show the condition persisting.
- FR-17 (P0): If confidence is low the system reports LOW CONFIDENCE rather than HIGH risk.

### 8.5 Dashboard and alerts

- FR-18 (P0): The dashboard shows live video with bounding boxes, object names, confidence and tracking IDs.
- FR-19 (P0): The dashboard shows the current risk level, the score as a percentage, and the list of detected objects.
- FR-20 (P0): When risk is HIGH and persistent, the dashboard shows a POTENTIAL SAFETY RISK warning panel and a video overlay, with the reasons listed.
- FR-21 (P1): An optional audio alert plays in the browser when a warning appears, with a mute control.
- FR-22 (P1): The user can view and adjust key configuration values from the UI or via the configuration endpoint.
- FR-23 (P0): The dashboard is usable without opening a Python terminal or notebook.

### 8.6 System and operations

- FR-24 (P0): The backend exposes health, session start/stop, configuration and a real-time detection stream.
- FR-25 (P1): Model latency and risk decisions are logged.
- FR-26 (P1): The alert layer is modular so notification providers (SMS, email, push, emergency contact) can be added later without changing the risk engine.

## 9. Non-functional requirements

- Performance: target an interactive frame rate on a typical laptop webcam. Exact FPS and latency targets are set during Milestone 1 benchmarking and recorded; the system must degrade gracefully (for example by skipping frames) rather than freeze.
- Reliability: the app must keep running if a frame fails to process, and must show a clear state if the camera is unavailable.
- Explainability: 100 percent of risk decisions carry reasons.
- Privacy and ethics: no face recognition, no identity data, no emotion inference. Video is processed locally by default and is not stored unless explicitly enabled later. Warnings use neutral language such as "potential safety risk."
- Maintainability: ML modules, frontend and backend are independent. Thresholds live in one configuration. The risk engine has unit tests. Model weights and datasets are kept out of Git.
- Usability: a first-time user can start a session and understand a warning within a couple of minutes without documentation.
- Portability: runs on a standard laptop with a webcam; GPU is optional.

## 10. MVP definition and demo script

The minimum successful demo:

1. Open the Vision Guard web application.
2. Start the webcam.
3. Live video appears.
4. YOLO detects people and objects.
5. Objects are tracked.
6. Movement is calculated.
7. The risk engine evaluates conditions.
8. A risk score appears.
9. A warning appears when risk persists.
10. The UI explains why the warning occurred.

Example demo narrative: a person enters the frame and is detected; a knife-like object is detected; the object begins moving rapidly; the distance between the object and another person decreases; the condition persists; the dashboard shows POTENTIAL SAFETY RISK, Risk Score 84 percent, with reasons: unsafe object detected, rapid movement, proximity decreasing, persistent condition.

Demo safety note: demonstrations should use harmless props or recorded video, and never real weapons.

## 11. Success criteria

V1 is successful when a user can:

1. Open the web application.
2. Start the camera.
3. See live video.
4. See detected objects.
5. See tracking information.
6. See movement information.
7. See a continuously updated risk score.
8. Receive a warning when configured risk conditions persist.
9. Understand why the warning occurred.

The application must work without requiring a notebook.

### 11.1 Metrics we will track

- Detection: precision, recall, mAP.
- Tracking: ID consistency, tracking stability.
- Risk detection: precision, recall, F1, false positive rate, false negative rate.
- Real-time system: FPS, inference latency, end-to-end latency, CPU/GPU utilisation.
- Anticipation (future versions): warning lead time, time-to-risk error, early detection rate.

Numeric pass/fail targets for these metrics are an open item to be agreed after the Milestone 1 benchmark.

## 12. Milestones

- M1: Pretrained YOLO → webcam → detection → web dashboard.
- M2: YOLO → tracking → movement.
- M3: Movement + object/person relationship → rule-based risk.
- M4: Risk persistence → warning system.
- M5: Custom dataset.
- M6: Specialist action model.
- M7: Temporal / anomaly model.
- M8: Learned risk fusion.

V1 delivery covers M1 to M4. M5 to M8 are the roadmap toward V2/V3. At every milestone camera → backend → frontend must keep working.

## 13. Risks and mitigations

- False positives (everyday objects such as scissors flagged): require persistence, configurable thresholds, show reasons so a human can judge quickly.
- False negatives (unsafe object missed): be transparent that V1 is an assistive tool, test across conditions, improve with a custom dataset in M5.
- Low light, occlusion, motion blur, camera angle: test explicitly, show LOW CONFIDENCE when detection is weak.
- Tracking ID switches in crowded scenes: use an established tracker, track ID consistency as a metric.
- Limited classes in a pretrained model: scope the unsafe-object list honestly; do not claim coverage that does not exist.
- Bias and data limits: document every model and dataset; diversify data before custom training.
- Misuse or over-trust: neutral wording, explicit statement that the system does not judge people or intent, human verification expected.
- Scope creep: the V1 non-goals list is binding.

## 14. Future direction

After V1, independently trained specialists (object, action, pose, temporal anomaly, safety hazard) feed a shared risk-fusion layer, which can produce pre-incident risk and time-to-risk estimates through an alert manager. Candidate datasets for specialists are EPIC-KITCHENS (object-action and hand-object interaction), Firearm Action Dataset (object-action interaction), UCF-Crime (temporal anomaly representation, not an object-detection dataset), Workplace Hazards Dataset (pre-incident hazards) and iSafetyBench (hazardous versus normal actions). Datasets are never merged; each model is trained independently.

Long-term research question: can independently trained vision specialists covering object recognition, human action, temporal anomalies and safety hazards be fused to anticipate emerging physical safety risks in an unseen real-time environment?

## 15. Open questions

- Which exact YOLO variant and which unsafe classes does the pretrained model support well enough for V1 (is a firearm class available)?
- What are the numeric thresholds for rapid movement, close proximity and persistence window length?
- What FPS and latency targets are acceptable on the demo hardware?
- Is audio alert in or out of the demo?
- Will uploaded-video processing be real-time playback or faster-than-real-time batch?
