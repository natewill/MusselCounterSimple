from contextlib import asynccontextmanager

from fastapi import FastAPI

from backend.api import router
from backend.init_db import init_db


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Initialize local storage and database before serving requests."""
    init_db()
    yield


app = FastAPI(title="Mussel Counter API", lifespan=lifespan)
app.include_router(router)
