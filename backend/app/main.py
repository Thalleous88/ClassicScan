from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import get_settings
from app.db.database import Base, engine
from app.routers import auth, scan
import app.model.user
import app.model.scan

settings = get_settings()
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("classicscan")

@asynccontextmanager
async def lifespan(app: FastAPI):

    settings.storage_dir_path.mkdir(parents=True, exist_ok=True)

    try:
        Base.metadata.create_all(bind=engine)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        log.info("DB connected")
    except Exception as e:
        log.exception("DB initialization failed: %s", e)
        raise
    yield

app = FastAPI(title="ClassicScan API", version="0.1.0", lifespan=lifespan)

origins = settings.cors_origin_list
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Enhance-Mode"],
)

app.include_router(auth.router)
app.include_router(scan.router)

@app.get("/")
def read_root():
    return {"name": "ClassicScan API", "status": "ok"}

@app.get("/health")
def health():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok", "db": "ok"}
    except Exception as e:
        log.error("health check db failed: %s", e)
        return {"status": "degraded", "db": "down"}
