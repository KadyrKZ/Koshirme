import asyncio

from sqlalchemy import select

from app.config import settings
from app.database import SessionLocal, engine
from app.models import Exam


async def seed():
    if not settings.seed_demo:
        return
    async with SessionLocal() as db:
        if not await db.scalar(select(Exam).where(Exam.title == "Python Demo Exam")):
            db.add(
                Exam(
                    title="Python Demo Exam",
                    join_code="1010",
                    allowed_url="https://contest.yandex.ru/",
                    allowed_urls=["https://contest.yandex.ru/"],
                )
            )
            await db.commit()
            print("Demo room created: Python Demo Exam / 1010 (teacher must start it)")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
