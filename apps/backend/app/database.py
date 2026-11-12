from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


class Base(DeclarativeBase):
    pass


engine = create_async_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db():
    async with SessionLocal() as db:
        yield db


async def lock_exam(db: AsyncSession, exam_id: str):
    from sqlalchemy import select

    from app.models import Exam

    return await db.scalar(
        select(Exam).where(Exam.id == exam_id).with_for_update().execution_options(populate_existing=True)
    )
