import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import settings
from app.database import SessionLocal, engine
from app.routes import accounts, events, exams, students
from app.services.sessions import check_timeouts
from app.websockets.routes import router as websocket_router

logger = logging.getLogger(__name__)


async def watchdog():
    while True:
        await asyncio.sleep(2)
        try:
            async with SessionLocal() as db:
                await check_timeouts(db)
        except Exception:
            logger.exception("Heartbeat watchdog failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    task = asyncio.create_task(watchdog())
    yield
    task.cancel()
    with suppress(asyncio.CancelledError):
        await task
    await engine.dispose()


app = FastAPI(title="KOSH!RME API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
app.include_router(exams.router)
app.include_router(accounts.router)
app.include_router(students.router)
app.include_router(events.router)
app.include_router(websocket_router)


@app.get("/api/health")
async def health():
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    return {"status": "ok", "service": "KOSH!RME"}
