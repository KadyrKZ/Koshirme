import os
import tempfile
from pathlib import Path

test_dir = Path(tempfile.mkdtemp(prefix="examguard-tests-"))
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{test_dir / 'test.db'}"
os.environ["UPLOAD_DIR"] = str(test_dir / "screenshots")
os.environ["ADMIN_TOKEN"] = "test-teacher-token-12345"
os.environ["ALLOW_LEGACY_ADMIN"] = "true"
os.environ["SEED_DEMO"] = "false"

import pytest
from fastapi.testclient import TestClient

from app.database import Base, engine
from app.main import app
from app.services.limits import limiter


@pytest.fixture
def client():
    import asyncio

    async def reset():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)

    asyncio.run(reset())
    limiter.buckets.clear()
    with TestClient(app) as client:
        yield client


@pytest.fixture
def teacher():
    return {"Authorization": "Bearer test-teacher-token-12345"}
