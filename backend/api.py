"""FastAPI routes for runs, model_execution, detections, models, and image file serving.

This module is the backend API surface used by the Electron frontend. It coordinates:
- Run lifecycle (/predict, /runs, /runs/{run_id})
- Background model execution and progress polling (`/predict/run-jobs/{run_job_id}`)
- Detection edits and run count recalculation
- Model discovery from disk (`/models`)
- Image ingest and image byte serving (`/images/upload`, `/images/{image_id}`)
"""

from pathlib import Path
from typing import Any
from typing import Literal

from fastapi import APIRouter
from fastapi import File
from fastapi import HTTPException
from fastapi import UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from pydantic import ConfigDict
from pydantic import Field

from backend.database import get_database_connection
from backend.database import get_image_file_metadata_from_database
from backend.database import get_run_info_from_detection_id
from backend.database import get_run_from_database
from backend.database import list_runs_from_database
from backend.database import recalculate_run_image_mussel_counts_from_detections
from backend.database import recalculate_run_mussel_counts_from_detections
from backend.database import run_exists
from backend.database import unlink_image_from_run
from backend.database import update_detection_fields
from backend.database import update_run_mussel_count
from backend.database import update_run_threshold
from backend.image_ingest import ingest_image_into_database
from backend.run_jobs import get_run_job
from backend.predict_service import PredictServiceError
from backend.predict_service import PredictServiceInput
from backend.predict_service import execute_predict_request
from backend.model_store import list_models_from_disk

router = APIRouter()


class PredictRequest(BaseModel):
    """Request body for creating/updating a run and starting model_execution."""

    run_id: int | None = None
    image_ids: list[int] = Field(default_factory=list)
    image_paths: list[str] = Field(default_factory=list)
    model_file_name: str
    threshold_score: float = 0.5


class RecalculateRequest(BaseModel):
    """Request body for recomputing counts on one existing run."""

    run_id: int
    threshold_score: float


class DetectionPatchRequest(BaseModel):
    """Allowed editable fields for one detection."""

    model_config = ConfigDict(extra="forbid")
    class_name: Literal["live", "dead"] | None = None
    is_deleted: bool | None = None


@router.post("/predict")
def create_or_update_run_and_do_model_execution(
    request: PredictRequest,
) -> dict[str, Any]:
    """Thin route: delegate `/predict` workflow to service layer."""
    try:
        return execute_predict_request(
            PredictServiceInput(
                run_id=request.run_id,
                image_ids=list(request.image_ids),
                image_paths=list(request.image_paths),
                model_file_name=request.model_file_name,
                threshold_score=request.threshold_score,
            )
        )
    except PredictServiceError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error


@router.get("/predict/run-jobs/{run_job_id}")
def get_predict_task(run_job_id: str) -> dict[str, Any]:
    """Return one run job state for frontend progress polling.

    The response includes status (`running`, `completed`, or `failed`), counters
    (`processed_images`, `total_images`), and final run data when completed.
    """
    run_job_data = get_run_job(run_job_id)
    if run_job_data is None:
        raise HTTPException(status_code=404, detail="Run job not found")
    return run_job_data


@router.post("/recalculate")
def recalculate_mussel_counts(request: RecalculateRequest) -> dict[str, Any]:
    """Recompute run totals from already-stored detections.

    This endpoint does not run the model. It re-applies the provided threshold to
    existing detections and refreshes run-level totals in the database.
    """
    with get_database_connection() as database_connection:
        if not run_exists(database_connection, request.run_id):
            raise HTTPException(status_code=404, detail="Run not found")

        update_run_threshold(database_connection, request.run_id, request.threshold_score)
        recalculate_run_mussel_counts_from_detections(
            database_connection, request.run_id, request.threshold_score
        )
        database_connection.commit()
        run_data = get_run_from_database(database_connection, request.run_id)

    if run_data is None:
        raise HTTPException(status_code=500, detail="Failed to load run")

    return {"run": run_data}


@router.patch("/detections/{detection_id}")
def edit_detection_in_database(detection_id: int, request: DetectionPatchRequest) -> dict[str, Any]:
    """Edit one detection (`class_name` and/or `is_deleted`) and refresh counts.

    Allowed edits are intentionally narrow:
    - Re-label detection class (`live` or `dead`)
    - Soft-delete/restore detection (`is_deleted`)
    """
    fields_to_update = request.model_dump(exclude_unset=True)
    if not fields_to_update:
        raise HTTPException(status_code=400, detail="No detection fields provided")

    with get_database_connection() as database_connection:
        run_information = get_run_info_from_detection_id(database_connection, detection_id)
        if run_information is None:
            raise HTTPException(status_code=404, detail="Detection not found")

        if "is_deleted" in fields_to_update:
            fields_to_update["is_deleted"] = 1 if fields_to_update["is_deleted"] else 0
        fields_to_update["is_edited"] = 1

        update_detection_fields(database_connection, detection_id, fields_to_update)
        recalculate_run_image_mussel_counts_from_detections(
            database_connection,
            run_image_id=int(run_information["run_image_id"]),
            threshold_score=float(run_information["threshold_score"]),
        )
        update_run_mussel_count(database_connection, int(run_information["run_id"]))
        database_connection.commit()
        run_data = get_run_from_database(database_connection, int(run_information["run_id"]))

    if run_data is None:
        raise HTTPException(status_code=500, detail="Failed to load run")

    return {"run": run_data}


@router.delete("/runs/{run_id}/images/{run_image_id}")
def remove_image_from_run(run_id: int, run_image_id: int) -> dict[str, Any]:
    """Remove one image link from a run and recompute run totals."""
    with get_database_connection() as database_connection:
        if not run_exists(database_connection, run_id):
            raise HTTPException(status_code=404, detail="Run not found")

        deleted = unlink_image_from_run(database_connection, run_id, run_image_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Image not found in run")

        update_run_mussel_count(database_connection, run_id)
        database_connection.commit()
        run_data = get_run_from_database(database_connection, run_id)

    if run_data is None:
        raise HTTPException(status_code=500, detail="Failed to load run")

    return {"run": run_data}


@router.get("/runs")
def list_runs() -> list[dict[str, Any]]:
    """Return all runs for the history view, newest first."""
    with get_database_connection() as database_connection:
        return list_runs_from_database(database_connection)


@router.get("/runs/{run_id}")
def get_run(run_id: int) -> dict[str, Any]:
    """Return one run with nested run images and detections."""
    with get_database_connection() as database_connection:
        run_data = get_run_from_database(database_connection, run_id)
    if run_data is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return run_data


@router.get("/models")
def list_models() -> dict[str, Any]:
    """Return model files discovered in the on-disk models directory."""
    return list_models_from_disk()


@router.post("/images/upload")
def upload_images(files: list[UploadFile] = File(...)) -> dict[str, Any]:
    """Upload images into storage/database without linking them to any run yet.

    This endpoint is used by the frontend image picker flow so images can be
    uploaded once and later attached to one or more runs.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    uploaded_images: list[dict[str, Any]] = []
    with get_database_connection() as database_connection:
        for uploaded_file in files:
            displayed_file_name = uploaded_file.filename or "uploaded_image"
            file_bytes = uploaded_file.file.read()
            uploaded_file.file.close()
            if not file_bytes:
                raise HTTPException(status_code=400, detail=f"Empty file: {displayed_file_name}")

            uploaded_image = ingest_image_into_database(
                database_connection,
                displayed_file_name=displayed_file_name,
                file_bytes=file_bytes,
            )
            uploaded_images.append(uploaded_image)

        database_connection.commit()

    return {"images": uploaded_images}


@router.get("/images/{image_id}", response_class=FileResponse)
def get_image(image_id: int) -> FileResponse:
    """Serve image bytes for one stored image ID."""
    with get_database_connection() as database_connection:
        image_file_metadata = get_image_file_metadata_from_database(database_connection, image_id)

    if image_file_metadata is None:
        raise HTTPException(status_code=404, detail="Image not found")

    image_path = Path(image_file_metadata["stored_path"]).resolve()
    if not image_path.is_file():
        raise HTTPException(status_code=404, detail="Image file not found on disk")

    return FileResponse(
        path=str(image_path),
        filename=image_file_metadata["displayed_file_name"],
    )
