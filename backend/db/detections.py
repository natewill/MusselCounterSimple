from typing import Any

import sqlite3

from backend.db.runs import update_run_mussel_count


def recalculate_run_mussel_counts_from_detections(
    connection: sqlite3.Connection, run_id: int, threshold_score: float
) -> None:
    """Recalculate per-image counts and refresh run totals from stored detections."""
    run_images_from_database = connection.execute(
        """
        SELECT id
        FROM run_images
        WHERE run_id = ?
        ORDER BY id ASC
        """,
        (run_id,),
    ).fetchall()

    for run_image_from_database in run_images_from_database:
        run_image_id = int(run_image_from_database["id"])
        recalculate_run_image_mussel_counts_from_detections(
            connection, run_image_id, threshold_score
        )

    update_run_mussel_count(connection, run_id)


def recalculate_run_image_mussel_counts_from_detections(
    connection: sqlite3.Connection, run_image_id: int, threshold_score: float
) -> None:
    """Recalculate one run_image live/dead counts from stored detections."""
    mussel_counts_from_database = connection.execute(
        """
        SELECT
            SUM(
                CASE
                    WHEN class_name = 'live' AND is_deleted = 0 AND COALESCE(confidence_score, 0) >= ?
                    THEN 1 ELSE 0
                END
            ) AS live_mussel_count,
            SUM(
                CASE
                    WHEN class_name = 'dead' AND is_deleted = 0 AND COALESCE(confidence_score, 0) >= ?
                    THEN 1 ELSE 0
                END
            ) AS dead_mussel_count
        FROM detections
        WHERE run_image_id = ?
        """,
        (threshold_score, threshold_score, run_image_id),
    ).fetchone()

    live_mussel_count = int(mussel_counts_from_database["live_mussel_count"] or 0)
    dead_mussel_count = int(mussel_counts_from_database["dead_mussel_count"] or 0)
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


def get_run_info_from_detection_id(
    connection: sqlite3.Connection, detection_id: int
) -> dict[str, Any] | None:
    """Return run info for a detection ID."""
    run_information_from_database = connection.execute(
        """
        SELECT
            detections.id AS detection_id,
            detections.run_image_id,
            run_images.run_id,
            runs.threshold_score
        FROM detections
        JOIN run_images ON run_images.id = detections.run_image_id
        JOIN runs ON runs.id = run_images.run_id
        WHERE detections.id = ?
        """,
        (detection_id,),
    ).fetchone()
    if run_information_from_database is None:
        return None
    return dict(run_information_from_database)


def update_detection_fields(
    connection: sqlite3.Connection, detection_id: int, fields_to_update: dict[str, Any]
) -> None:
    """Update a detection with a validated set of fields."""
    allowed_fields = {
        "class_name",
        "is_edited",
        "is_deleted",
    }
    unknown_fields = set(fields_to_update.keys()) - allowed_fields
    if unknown_fields:
        raise ValueError(f"Unsupported detection fields: {sorted(unknown_fields)}")

    if not fields_to_update:
        return

    assignments = ", ".join(f"{field_name} = ?" for field_name in fields_to_update.keys())
    values = list(fields_to_update.values()) + [detection_id]
    connection.execute(
        f"""
        UPDATE detections
        SET {assignments}
        WHERE id = ?
        """,
        values,
    )
