# Model Documentation

## Current Model
- **YOLOv8n** (nano) - Default for V1 MVP
- Classes: COCO 80 classes
- Unsafe classes of interest: `knife`, `scissors` (COCO), custom weapons need training

## Unsafe Class Allow-List (config)
```python
unsafe_classes = ["knife", "gun", "weapon", "scissors"]
```
Note: "gun", "weapon" not in COCO - will need custom model for V2+.

## Model Path
`backend/models/yolov8n.pt` (excluded from Git)

## Versioning
- Model changes documented here with date, reason, performance impact
- V1: Pre-trained COCO only
- V2+: Custom fine-tuning on safety dataset

## Performance Targets
- Inference: <30ms/frame on CPU
- End-to-end latency: <100ms
- FPS: >10 on typical laptop