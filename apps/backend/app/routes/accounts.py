import asyncio
import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import LoginSession, User, utcnow
from app.schemas.accounts import AccountStatus, LoginOut, LoginRequest, PasswordChange, TeacherCreate, UserOut
from app.services.auth import bearer, require_admin, require_teacher, token_hash
from app.services.limits import limiter
from app.services.passwords import hash_password, verify_password

router = APIRouter(prefix="/api", tags=["accounts"])
# Equal work for unknown users; never store or log the submitted plaintext password.
dummy_hash = hash_password(secrets.token_urlsafe(32))
hash_slots = asyncio.Semaphore(2)


@router.post("/auth/login", response_model=LoginOut)
async def login(
    payload: LoginRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)
):
    limiter.check(f"login-ip:{request.client.host if request.client else 'local'}", 20)
    limiter.check(f"login-identifier:{payload.email}", 10)
    matches = (
        await db.scalars(
            select(User)
            .where(or_(func.lower(User.email) == payload.email, func.lower(User.name) == payload.email))
            .limit(2)
        )
    ).all()
    user = matches[0] if len(matches) == 1 else None
    async with hash_slots:
        valid = await asyncio.to_thread(
            verify_password, payload.password, user.password_hash if user else dummy_hash
        )
    if not valid or not user or not user.active:
        raise HTTPException(401, "Invalid name/email or password")
    await db.execute(delete(LoginSession).where(LoginSession.expires_at <= utcnow()))
    token = secrets.token_urlsafe(32)
    db.add(
        LoginSession(token_hash=token_hash(token), user_id=user.id, expires_at=utcnow() + timedelta(hours=8))
    )
    await db.commit()
    response.headers["Cache-Control"] = "no-store"
    return {"token": token, "user": user}


@router.get("/auth/me", response_model=UserOut)
async def me(user: User = Depends(require_teacher)):
    return user


@router.post("/auth/logout")
async def logout(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer), db: AsyncSession = Depends(get_db)
):
    if credentials:
        await db.execute(
            delete(LoginSession).where(LoginSession.token_hash == token_hash(credentials.credentials))
        )
        await db.commit()
    return {"ok": True}


@router.post("/auth/password")
async def change_password(
    payload: PasswordChange,
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
):
    if user.id == "legacy":
        raise HTTPException(409, "Legacy development access has no account password")
    async with hash_slots:
        valid = await asyncio.to_thread(verify_password, payload.current_password, user.password_hash)
        if not valid:
            raise HTTPException(401, "Current password is incorrect")
        user.password_hash = await asyncio.to_thread(hash_password, payload.new_password)
    current_hash = token_hash(credentials.credentials)
    await db.execute(
        delete(LoginSession).where(LoginSession.user_id == user.id, LoginSession.token_hash != current_hash)
    )
    await db.commit()
    return {"ok": True}


@router.get("/admin/teachers", response_model=list[UserOut], dependencies=[Depends(require_admin)])
async def teachers(db: AsyncSession = Depends(get_db)):
    return (
        await db.scalars(select(User).where(User.role == "teacher").order_by(User.created_at.desc()))
    ).all()


@router.post(
    "/admin/teachers", response_model=UserOut, status_code=201, dependencies=[Depends(require_admin)]
)
async def create_teacher(payload: TeacherCreate, db: AsyncSession = Depends(get_db)):
    async with hash_slots:
        encoded = await asyncio.to_thread(hash_password, payload.password)
    user = User(email=payload.email, name=payload.name, password_hash=encoded, role="teacher")
    db.add(user)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(409, "An account with this email already exists") from exc
    return user


@router.post(
    "/admin/teachers/{user_id}/status", response_model=UserOut, dependencies=[Depends(require_admin)]
)
async def teacher_status(user_id: str, payload: AccountStatus, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user or user.role != "teacher":
        raise HTTPException(404, "Teacher not found")
    user.active = payload.active
    if not payload.active:
        await db.execute(delete(LoginSession).where(LoginSession.user_id == user.id))
    await db.commit()
    return user
