"""In-memory inference job tracking for frontend progress polling."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime
from datetime import timezone
from threading import Lock
from typing import Any
from uuid import uuid4


MAX_TRACKED_INFERENCE_JOBS = 200

_INFERENCE_JOBS: dict[str, dict[str, Any]] = {}
_INFERENCE_JOB_ORDER: list[str] = []
_INFERENCE_JOBS_LOCK = Lock()


def utc_timestamp_to_iso() -> str:
    """Return the current UTC timestamp in ISO format."""
    return datetime.now(timezone.utc).isoformat()


def _prune_old_inference_jobs() -> None:
    """Bound memory by dropping the oldest tracked jobs."""
    while len(_INFERENCE_JOB_ORDER) > MAX_TRACKED_INFERENCE_JOBS:
        oldest_job_id = _INFERENCE_JOB_ORDER.pop(0)
        _INFERENCE_JOBS.pop(oldest_job_id, None)


def create_inference_job(
    run_id: int,
    total_images: int,
    skipped_images: list[str],
    skipped_image_ids: list[int],
    invalid_image_ids: list[int],
    model_changed: bool,
    is_running_on_new_images_only: bool,
    processed_run_image_ids: list[int],
) -> dict[str, Any]:
    """Create and store a new inference job record."""
    inference_job_id = uuid4().hex
    inference_job_data: dict[str, Any] = {
        "job_id": inference_job_id,
        "status": "running",
        "run_id": run_id,
        "processed_images": 0,
        "total_images": int(total_images),
        "skipped_images": list(skipped_images),
        "skipped_image_ids": list(skipped_image_ids),
        "invalid_image_ids": list(invalid_image_ids),
        "model_changed": model_changed,
        "is_running_on_new_images_only": is_running_on_new_images_only,
        "processed_run_image_ids": list(processed_run_image_ids),
        "error_message": None,
        "run": None,
        "created_at": utc_timestamp_to_iso(),
        "updated_at": utc_timestamp_to_iso(),
    }

    with _INFERENCE_JOBS_LOCK:
        _INFERENCE_JOBS[inference_job_id] = inference_job_data
        _INFERENCE_JOB_ORDER.append(inference_job_id)
        _prune_old_inference_jobs()
        return deepcopy(inference_job_data)


def get_inference_job(inference_job_id: str) -> dict[str, Any] | None:
    """Return one inference job by ID."""
    with _INFERENCE_JOBS_LOCK:
        inference_job_data = _INFERENCE_JOBS.get(inference_job_id)
        if inference_job_data is None:
            return None
        return deepcopy(inference_job_data)


def update_inference_job_progress(
    inference_job_id: str, processed_images: int, total_images: int
) -> None:
    """Update the progress counters for a running inference job."""
    with _INFERENCE_JOBS_LOCK:
        inference_job_data = _INFERENCE_JOBS.get(inference_job_id)
        if inference_job_data is None:
            return

        bounded_total_images = max(0, int(total_images))
        bounded_processed_images = max(0, int(processed_images))
        if bounded_total_images > 0:
            bounded_processed_images = min(bounded_processed_images, bounded_total_images)

        inference_job_data["processed_images"] = bounded_processed_images
        inference_job_data["total_images"] = bounded_total_images
        inference_job_data["updated_at"] = utc_timestamp_to_iso()


def complete_inference_job(inference_job_id: str, run_data: dict[str, Any]) -> None:
    """Mark a job as completed and attach final run payload."""
    with _INFERENCE_JOBS_LOCK:
        inference_job_data = _INFERENCE_JOBS.get(inference_job_id)
        if inference_job_data is None:
            return

        inference_job_data["status"] = "completed"
        inference_job_data["processed_images"] = int(inference_job_data["total_images"])
        inference_job_data["run"] = deepcopy(run_data)
        inference_job_data["updated_at"] = utc_timestamp_to_iso()


def fail_inference_job(inference_job_id: str, error_message: str) -> None:
    """Mark a job as failed and capture the error details."""
    with _INFERENCE_JOBS_LOCK:
        inference_job_data = _INFERENCE_JOBS.get(inference_job_id)
        if inference_job_data is None:
            return

        inference_job_data["status"] = "failed"
        inference_job_data["error_message"] = error_message
        inference_job_data["updated_at"] = utc_timestamp_to_iso()
