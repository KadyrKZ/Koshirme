"""Interactive operator-only first-admin setup. No default public password."""

import asyncio
from getpass import getpass

from sqlalchemy import select

from app.database import SessionLocal, engine
from app.models import User
from app.schemas.accounts import TeacherCreate
from app.services.passwords import hash_password


async def create(payload: TeacherCreate):
    async with SessionLocal() as db:
        if await db.scalar(select(User.id).where(User.role == "admin")):
            raise SystemExit("Administrator already exists; bootstrap refused.")
        db.add(
            User(
                email=payload.email,
                name=payload.name,
                role="admin",
                password_hash=hash_password(payload.password),
            )
        )
        await db.commit()
    await engine.dispose()
    print("Administrator created. Sign in using the account you entered.")


if __name__ == "__main__":
    email = input("Administrator email: ").strip()
    name = input("Administrator name: ").strip()
    password = getpass("Password (at least 6 characters): ")
    if password != getpass("Confirm password: "):
        raise SystemExit("Passwords do not match")
    asyncio.run(create(TeacherCreate(email=email, name=name, password=password)))
