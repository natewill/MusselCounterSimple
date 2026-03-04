from datetime import datetime
from datetime import timezone
from typing import Any

from backend.init_db import MODELS_DIRECTORY


def list_models_from_disk() -> dict[str, Any]:
    """Return model directory metadata and all model files found on disk."""
    MODELS_DIRECTORY.mkdir(parents=True, exist_ok=True)

    models: list[dict[str, Any]] = []
    for path in sorted(MODELS_DIRECTORY.iterdir()):
        if not path.is_file():
            continue
        stat = path.stat()
        models.append(
            {
                "file_name": path.name,
                "model_file_name": str(path.resolve()),
                "size_bytes": stat.st_size,
                "modified_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            }
        )

    return {
        "models_dir": str(MODELS_DIRECTORY.resolve()),
        "models": models,
    }
