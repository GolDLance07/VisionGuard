"""
VisionGuard — YOLOv8 Weapon Detection Model Fine-Tuning Script
Trains on the extracted dataset in data/weapon-detection/
Supports CPU, Apple Silicon (MPS), or NVIDIA CUDA GPU.
"""

import os
import sys
from pathlib import Path
from ultralytics import YOLO

def train(
    data_yaml: str = "data/weapon-detection/data.yaml",
    base_model: str = "yolov8s.pt",
    epochs: int = 30,
    imgsz: int = 416,
    batch: int = 16,
    device: str = "auto",
    project: str = "experiments/runs",
    name: str = "weapon_v1",
):
    root_dir = Path(__file__).resolve().parent.parent
    data_path = root_dir / data_yaml

    if not data_path.exists():
        print(f"Error: dataset YAML not found at {data_path}")
        sys.exit(1)

    print(f"==================================================")
    print(f"VisionGuard Weapon Detection Fine-Tuning")
    print(f"Dataset:    {data_path}")
    print(f"Base Model: {base_model}")
    print(f"Epochs:     {epochs}")
    print(f"Image Size: {imgsz}")
    print(f"Batch Size: {batch}")
    print(f"Device:     {device}")
    print(f"==================================================")

    model = YOLO(base_model)

    results = model.train(
        data=str(data_path),
        epochs=epochs,
        imgsz=imgsz,
        batch=batch,
        device=device,
        project=str(root_dir / project),
        name=name,
        workers=2,
        exist_ok=True,
    )

    best_weights = root_dir / project / name / "weights" / "best.pt"
    if best_weights.exists():
        target_model = root_dir / "backend" / "models" / "weapon_yolo.pt"
        target_model.parent.mkdir(parents=True, exist_ok=True)
        import shutil
        shutil.copy(best_weights, target_model)
        print(f"\n[SUCCESS] Best model weights exported to: {target_model}")
    else:
        print("\nTraining completed.")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Train YOLOv8 on VisionGuard Weapon Dataset")
    parser.add_argument("--epochs", type=int, default=30, help="Number of training epochs")
    parser.add_argument("--batch", type=int, default=16, help="Batch size")
    parser.add_argument("--imgsz", type=int, default=416, help="Image size (dataset native is 416)")
    parser.add_argument("--base", type=str, default="yolov8s.pt", help="Base model (yolov8n.pt or yolov8s.pt)")
    parser.add_argument("--device", type=str, default="", help="Device: 'cpu', '0', or empty for auto")
    args = parser.parse_args()

    dev = args.device if args.device else ("0" if os.environ.get("CUDA_VISIBLE_DEVICES") else "cpu")
    train(epochs=args.epochs, batch=args.batch, imgsz=args.imgsz, base_model=args.base, device=dev)
