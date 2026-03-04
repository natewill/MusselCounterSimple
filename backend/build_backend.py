"""Build the packaged backend executable with PyInstaller."""

from __future__ import annotations

from pathlib import Path
import subprocess
import sys


BACKEND_DIR = Path(__file__).resolve().parent
SERVER_ENTRY = BACKEND_DIR / "server_entry.py"
DIST_DIR = BACKEND_DIR / "dist"
BUILD_DIR = BACKEND_DIR / "build"
SPEC_DIR = BACKEND_DIR
SCHEMA_PATH = BACKEND_DIR / "schema.sql"


def build_backend_executable() -> None:
    """Create a one-file backend executable for Electron packaged builds."""
    add_data_separator = ";" if sys.platform.startswith("win") else ":"
    add_data_arg = f"{SCHEMA_PATH}{add_data_separator}backend"

    command = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onefile",
        "--name",
        "mussel-backend",
        "--distpath",
        str(DIST_DIR),
        "--workpath",
        str(BUILD_DIR),
        "--specpath",
        str(SPEC_DIR),
        "--add-data",
        add_data_arg,
        "--hidden-import",
        "uvicorn.logging",
        "--hidden-import",
        "uvicorn.loops.auto",
        "--hidden-import",
        "uvicorn.protocols.http.auto",
        "--hidden-import",
        "uvicorn.protocols.websockets.auto",
        "--hidden-import",
        "uvicorn.lifespan.on",
        str(SERVER_ENTRY),
    ]

    subprocess.run(command, check=True)


if __name__ == "__main__":
    build_backend_executable()
