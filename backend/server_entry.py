"""Runtime entrypoint used for packaged backend executable builds."""

from __future__ import annotations

import os

import uvicorn

from backend.main import app


def run_backend_server() -> None:
    """Start the local FastAPI backend server for desktop mode."""
    host = os.getenv("MUSSEL_API_HOST", "127.0.0.1")
    port = int(os.getenv("MUSSEL_API_PORT", "8000"))
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    run_backend_server()
