import sqlite3


def create_run(connection: sqlite3.Connection, model_file_name: str, threshold_score: float) -> int:
    """Insert a new run and return its ID."""
    cursor = connection.execute(
        """
        INSERT INTO runs (model_file_name, threshold_score)
        VALUES (?, ?)
        """,
        (model_file_name, threshold_score),
    )
    return int(cursor.lastrowid)


def run_exists(connection: sqlite3.Connection, run_id: int) -> bool:
    """Return True when a run with the given ID exists."""
    run_from_database = connection.execute(
        """
        SELECT id
        FROM runs
        WHERE id = ?
        """,
        (run_id,),
    ).fetchone()
    return run_from_database is not None


def link_image_to_run(connection: sqlite3.Connection, run_id: int, image_id: int) -> tuple[int, bool]:
    """Link an image to a run and return (run_image_id, was_inserted)."""
    existing_run_image_from_database = connection.execute(
        """
        SELECT id
        FROM run_images
        WHERE run_id = ? AND image_id = ?
        """,
        (run_id, image_id),
    ).fetchone()
    if existing_run_image_from_database is not None:
        return int(existing_run_image_from_database["id"]), False

    cursor = connection.execute(
        """
        INSERT INTO run_images (run_id, image_id)
        VALUES (?, ?)
        """,
        (run_id, image_id),
    )
    return int(cursor.lastrowid), True


def update_run_mussel_count(connection: sqlite3.Connection, run_id: int) -> None:
    """Recalculate cached run totals from run_images."""
    run_totals_from_database = connection.execute(
        """
        SELECT
            COUNT(*) AS image_count,
            COALESCE(SUM(live_mussel_count), 0) AS live_mussel_count,
            COALESCE(SUM(dead_mussel_count), 0) AS dead_mussel_count
        FROM run_images
        WHERE run_id = ?
        """,
        (run_id,),
    ).fetchone()

    connection.execute(
        """
        UPDATE runs
        SET
            image_count = ?,
            live_mussel_count = ?,
            dead_mussel_count = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (
            run_totals_from_database["image_count"],
            run_totals_from_database["live_mussel_count"],
            run_totals_from_database["dead_mussel_count"],
            run_id,
        ),
    )


def get_run_model_file_name(connection: sqlite3.Connection, run_id: int) -> str | None:
    """Return the model filename stored on a run."""
    model_file_name_from_database = connection.execute(
        """
        SELECT model_file_name
        FROM runs
        WHERE id = ?
        """,
        (run_id,),
    ).fetchone()
    if model_file_name_from_database is None:
        return None
    return model_file_name_from_database["model_file_name"]


def update_run_model_file_name(
    connection: sqlite3.Connection, run_id: int, model_file_name: str
) -> None:
    """Update the model filename stored on a run."""
    connection.execute(
        """
        UPDATE runs
        SET model_file_name = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (model_file_name, run_id),
    )


def update_run_threshold(connection: sqlite3.Connection, run_id: int, threshold_score: float) -> None:
    """Update the threshold score stored on a run."""
    connection.execute(
        """
        UPDATE runs
        SET threshold_score = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (threshold_score, run_id),
    )


def unlink_image_from_run(connection: sqlite3.Connection, run_id: int, run_image_id: int) -> bool:
    """Delete a run_images row and return True if it existed."""
    cursor = connection.execute(
        """
        DELETE FROM run_images
        WHERE id = ? AND run_id = ?
        """,
        (run_image_id, run_id),
    )
    return cursor.rowcount > 0


def list_run_image_ids(connection: sqlite3.Connection, run_id: int) -> list[int]:
    """Return all run_image IDs for a run."""
    run_images_from_database = connection.execute(
        """
        SELECT id
        FROM run_images
        WHERE run_id = ?
        ORDER BY id ASC
        """,
        (run_id,),
    ).fetchall()
    return [int(run_image_from_database["id"]) for run_image_from_database in run_images_from_database]
