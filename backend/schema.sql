CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    model_file_name TEXT NOT NULL,
    threshold_score REAL NOT NULL,
    image_count INTEGER NOT NULL DEFAULT 0,
    live_mussel_count INTEGER NOT NULL DEFAULT 0,
    dead_mussel_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    displayed_file_name TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    sha_256_file_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS run_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL,
    image_id INTEGER NOT NULL,
    live_mussel_count INTEGER NOT NULL DEFAULT 0,
    dead_mussel_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE,
    FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
    UNIQUE(run_id, image_id)
);

CREATE TABLE IF NOT EXISTS detections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_image_id INTEGER NOT NULL,
    class_name TEXT NOT NULL CHECK (class_name IN ('live', 'dead')),
    confidence_score REAL,
    bbox_x1 REAL NOT NULL,
    bbox_y1 REAL NOT NULL,
    bbox_x2 REAL NOT NULL,
    bbox_y2 REAL NOT NULL,
    is_edited INTEGER NOT NULL DEFAULT 0,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (run_image_id) REFERENCES run_images(id) ON DELETE CASCADE
);
