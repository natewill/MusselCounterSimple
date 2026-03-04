"""Faster R-CNN inference adapter and DB writeback helpers."""

from collections import OrderedDict
from contextlib import contextmanager
import ctypes
import io
import os
from pathlib import Path
import sys
from typing import Callable
from typing import Any
import sqlite3


@contextmanager
def _suppress_stderr():
    """Temporarily silence C-level stderr (libjpeg warnings)."""
    try:
        stderr_fd = sys.stderr.fileno()
        old_stderr = os.dup(stderr_fd)
        devnull = os.open(os.devnull, os.O_WRONLY)
        os.dup2(devnull, stderr_fd)
        os.close(devnull)
        yield
        os.dup2(old_stderr, stderr_fd)
        os.close(old_stderr)
    except (OSError, io.UnsupportedOperation):
        yield


try:
    from PIL import Image
    import torch
    import torchvision
    import torchvision.transforms as transforms
except ImportError:  # pragma: no cover - handled at runtime by explicit checks
    Image = None
    torch = None
    torchvision = None
    transforms = None


RCNN_LABELS = {
    1: "live",
    2: "dead",
}
MODEL_CACHE: dict[str, tuple[float, Any, Any]] = {}


def _ensure_torch_installed() -> None:
    """Validate runtime dependencies required for RCNN inference."""
    if torch is None or torchvision is None or transforms is None or Image is None:
        raise RuntimeError(
            "RCNN inference requires torch, torchvision, and pillow. "
            "Install dependencies from requirements.txt."
        )


def _model_file_name_to_absolute_path(model_file_name: str) -> Path:
    """Resolve and validate an absolute model path."""
    expanded_path = Path(model_file_name).expanduser()
    if not expanded_path.is_absolute():
        raise ValueError(f"model_file_name must be an absolute path: {model_file_name}")
    model_path = expanded_path.resolve()
    if not model_path.is_file():
        raise FileNotFoundError(f"Model file not found: {model_path}")
    return model_path


def _load_model(model_path: Path) -> tuple[Any, Any]:
    """Load a serialized RCNN model and return (model, device)."""
    _ensure_torch_installed()

    # Pick GPU when available; otherwise run on CPU.
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    # Load checkpoint on the target device.
    checkpoint = torch.load(str(model_path), map_location=device)

    # Support common checkpoint layouts.
    if isinstance(checkpoint, dict):
        if "model_state_dict" in checkpoint:
            state_dict = checkpoint["model_state_dict"]
        elif "state_dict" in checkpoint:
            state_dict = checkpoint["state_dict"]
        else:
            state_dict = checkpoint
    else:
        state_dict = checkpoint

    if not isinstance(state_dict, (dict, OrderedDict)):
        raise RuntimeError("Expected checkpoint to contain model weights state_dict.")

    # Strip DataParallel prefixes (module.*) when present.
    normalized_state_dict: OrderedDict[str, Any] = OrderedDict()
    for key, value in state_dict.items():
        normalized_state_dict[key.removeprefix("module.")] = value

    # This project uses a fixed 3-class RCNN head: background/live/dead.
    model = torchvision.models.detection.fasterrcnn_resnet50_fpn(
        weights=None,
        weights_backbone=None,
        num_classes=3,
    )
    try:
        model.load_state_dict(normalized_state_dict)
    except Exception as error:
        raise RuntimeError(f"Failed to load RCNN model weights from {model_path}: {error}") from error

    model = model.to(device)
    model.eval()
    return model, device


def _get_model_device(model_file_name: str) -> tuple[Any, Any]:
    """Return a cached (model, device) for a model file, reloading when file changes."""
    model_path = _model_file_name_to_absolute_path(model_file_name)
    cache_key = str(model_path)
    modified_time = model_path.stat().st_mtime

    cached = MODEL_CACHE.get(cache_key)
    if cached is not None and cached[0] == modified_time:
        return cached[1], cached[2]

    model, device = _load_model(model_path)
    MODEL_CACHE[cache_key] = (modified_time, model, device)
    return model, device


def _run_rcnn_inference(model_device_tuple: tuple[Any, Any], image_path: str) -> list[dict[str, Any]]:
    """Run RCNN inference for one image and return standardized detections."""
    _ensure_torch_installed()
    model, device = model_device_tuple
    transform = transforms.ToTensor()

    with _suppress_stderr():
        image = Image.open(image_path).convert("RGB")
    tensor = transform(image).to(device)

    with torch.no_grad():
        prediction = model([tensor])[0]

    boxes = prediction["boxes"].detach().cpu().tolist()
    scores = prediction["scores"].detach().cpu().tolist()
    labels = prediction["labels"].detach().cpu().tolist()

    detections: list[dict[str, Any]] = []
    for box, score, label in zip(boxes, scores, labels):
        class_name = RCNN_LABELS.get(int(label))
        if class_name is None:
            continue
        detections.append(
            {
                "class_name": class_name,
                "confidence_score": float(score),
                "bbox_x1": float(box[0]),
                "bbox_y1": float(box[1]),
                "bbox_x2": float(box[2]),
                "bbox_y2": float(box[3]),
            }
        )

    if device.type == "cuda":
        torch.cuda.empty_cache()

    return detections


def run_rcnn_inference_for_run_images(
    connection: sqlite3.Connection,
    run_image_ids: list[int],
    model_file_name: str,
    threshold_score: float,
    on_run_image_processed: Callable[[int, int], None] | None = None,
) -> None:
    """Run RCNN inference for selected run_images and refresh cached counts."""
    if not run_image_ids:
        return

    model_device_tuple = _get_model_device(model_file_name)
    placeholders = ",".join(["?"] * len(run_image_ids))
    run_images_from_database = connection.execute(
        f"""
        SELECT
            run_images.id AS run_image_id,
            images.stored_path
        FROM run_images
        JOIN images ON images.id = run_images.image_id
        WHERE run_images.id IN ({placeholders})
        ORDER BY run_images.id ASC
        """,
        run_image_ids,
    ).fetchall()
    total_images_to_process = len(run_images_from_database)

    for processed_images, run_image_from_database in enumerate(run_images_from_database, start=1):
        run_image_id = int(run_image_from_database["run_image_id"])
        image_path = str(run_image_from_database["stored_path"])
        detections = _run_rcnn_inference(model_device_tuple, image_path)

        connection.execute(
            """
            DELETE FROM detections
            WHERE run_image_id = ?
            """,
            (run_image_id,),
        )

        live_mussel_count = 0
        dead_mussel_count = 0

        for detection in detections:
            connection.execute(
                """
                INSERT INTO detections (
                    run_image_id,
                    class_name,
                    confidence_score,
                    bbox_x1,
                    bbox_y1,
                    bbox_x2,
                    bbox_y2,
                    is_edited,
                    is_deleted
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)
                """,
                (
                    run_image_id,
                    detection["class_name"],
                    detection["confidence_score"],
                    detection["bbox_x1"],
                    detection["bbox_y1"],
                    detection["bbox_x2"],
                    detection["bbox_y2"],
                ),
            )

            if detection["confidence_score"] >= threshold_score:
                if detection["class_name"] == "live":
                    live_mussel_count += 1
                elif detection["class_name"] == "dead":
                    dead_mussel_count += 1

        connection.execute(
            """
            UPDATE run_images
            SET
                live_mussel_count = ?,
                dead_mussel_count = ?
            WHERE id = ?
            """,
            (live_mussel_count, dead_mussel_count, run_image_id),
        )

        if on_run_image_processed is not None:
            on_run_image_processed(processed_images, total_images_to_process)
