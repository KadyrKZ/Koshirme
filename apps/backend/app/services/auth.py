import hashlib
import secrets
from datetime import UTC

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import Exam, LoginSession, StudentSession, User, utcnow

bearer = HTTPBearer(auto_error=False)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def valid_admin(token: str) -> bool:
    return settings.allow_legacy_admin and secrets.compare_digest(token, settings.admin_token)


async def authenticate_teacher(db: AsyncSession, token: str) -> User:
    if valid_admin(token):
        return User(id="legacy", name="Local test administrator", email="legacy@localhost", role="admin", active=True)
    login = await db.get(LoginSession, token_hash(token))
    if not login or login.expires_at.replace(tzinfo=login.expires_at.tzinfo or UTC) <= utcnow():
        raise HTTPException(401, "Sign in required")
    user = await db.get(User, login.user_id)
    if not user or not user.active:
        raise HTTPException(401, "Account disabled")
    return user


async def require_teacher(db: AsyncSession = Depends(get_db),
                          credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> User:
    if not credentials:
        raise HTTPException(401, "Sign in required")
    return await authenticate_teacher(db, credentials.credentials)


async def require_admin(user: User = Depends(require_teacher)) -> User:
    if user.role != "admin":
        raise HTTPException(403, "Administrator access required")
    return user


async def authorized_exam(db: AsyncSession, exam_id: str, user: User) -> Exam:
    exam = await db.get(Exam, exam_id)
    if not exam or (user.role != "admin" and exam.owner_id != user.id):
        raise HTTPException(404, "Room not found")
    return exam


async def authenticate_student(db: AsyncSession, session_id: str, token: str) -> StudentSession:
    student = await db.get(StudentSession, session_id)
    if not student or not secrets.compare_digest(student.token_hash, token_hash(token)):
        raise HTTPException(401, "Invalid student session")
    return student


async def require_student(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
):
    if not credentials:
        raise HTTPException(401, "Student token required")
    return await authenticate_student(db, session_id, credentials.credentials)
