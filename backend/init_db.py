from pathlib import Path
import os
import sqlite3


BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
APP_DATA = Path(os.getenv("MUSSEL_APP_DATA_DIR", str(PROJECT_ROOT / "app_data"))).expanduser().resolve()
DB_PATH = APP_DATA / "app.db"
IMAGES_DIR = APP_DATA / "images"
MODELS_DIR = APP_DATA / "models"
SCHEMA_PATH = BACKEND_DIR / "schema.sql"


def init_db() -> None:
    """Create app storage folders and apply the SQLite schema."""
    APP_DATA.mkdir(parents=True, exist_ok=True)
    IMAGES_DIR.mkdir(exist_ok=True)
    MODELS_DIR.mkdir(exist_ok=True)

    schema_sql = SCHEMA_PATH.read_text(encoding="utf-8")

    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.executescript(schema_sql)
        conn.commit()


if __name__ == "__main__":
    init_db()
    print(f"Initialized DB: {DB_PATH}")
