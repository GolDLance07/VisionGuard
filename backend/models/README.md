# Vision Guard V1 - Backend Models

This directory is for YOLO model weights (.pt files).
**Do not commit model weights to Git.**

Download a model (e.g., YOLOv8n) and place it here:
- `yolov8n.pt` - Nano model (fastest, ~6MB)
- `yolov8s.pt` - Small model (~22MB)
- `yolov8m.pt` - Medium model (~52MB)
- `yolov8l.pt` - Large model (~87MB)
- `yolov8x.pt` - Extra large model (~136MB)

Default config expects `models/yolov8n.pt`.

To download:
```bash
# Using ultralytics (will auto-download on first run)
# Or manually:
wget https://github.com/ultralytics/assets/releases/download/v8.3.0/yolov8n.pt -O models/yolov8n.pt
```