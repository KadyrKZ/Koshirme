import secrets

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, lock_exam
from app.models import Exam, StudentSession, utcnow
from app.schemas.api import JoinOut, JoinRequest
from app.services.auth import require_student, token_hash
from app.services.events import aware, insert_event, publish_event
from app.services.limits import limiter
from app.services.sessions import publish_student, state_message, student_exam
from app.websockets.hub import hub

router = APIRouter(prefix="/api/student", tags=["student"])


@router.post("/join", response_model=JoinOut, status_code=201)
async def join(payload: JoinRequest, request: Request, db: AsyncSession = Depends(get_db)):
    limiter.check(f"join:{request.client.host if request.client else 'local'}", 30)
    exam = await db.scalar(
        select(Exam)
        .where(Exam.join_code == payload.join_code, Exam.finished_at.is_(None))
        .order_by(Exam.created_at.desc())
    )
    if not exam:
        raise HTTPException(404, "Exam code not found")
    exam = await lock_exam(db, exam.id)
    if exam.finished_at:
        raise HTTPException(409, "Exam has finished")
    existing = await db.scalar(
        select(StudentSession)
        .where(StudentSession.exam_id == exam.id, StudentSession.student_name == payload.student_name.strip())
        .order_by(StudentSession.started_at.desc())
    )
    if existing:
        token = secrets.token_urlsafe(32)
        existing.token_hash = token_hash(token)
        existing.connected = False
        existing.last_seen = utcnow()
        if not exam.active:
            existing.active = False
            existing.ready = False
        event = None
        if exam.active:
            event = insert_event(db, existing, "STUDENT_RECONNECTED", metadata={"reason": "session_rejoin"})
        await db.commit()
        if event:
            await publish_event(existing, event)
        else:
            await publish_student(existing)
        return {"session": existing, "exam": student_exam(exam), "token": token}
    if exam.active or exam.paused:
        raise HTTPException(409, "This room has already started")
    token = secrets.token_urlsafe(32)
    student = StudentSession(exam_id=exam.id, student_name=payload.student_name, token_hash=token_hash(token))
    db.add(student)
    await db.commit()
    await publish_student(student)
    return {"session": student, "exam": student_exam(exam), "token": token}


@router.get("/sessions/{session_id}")
async def session_state(
    session_id: str, student: StudentSession = Depends(require_student), db: AsyncSession = Depends(get_db)
):
    exam = await db.get(Exam, student.exam_id)
    return state_message(student, exam)


@router.post("/sessions/{session_id}/ready")
async def ready(
    session_id: str, student: StudentSession = Depends(require_student), db: AsyncSession = Depends(get_db)
):
    exam = await lock_exam(db, student.exam_id)
    await db.refresh(student)
    if exam.finished_at:
        raise HTTPException(409, "The room has finished")
    now = utcnow()
    if not student.connected or (now - aware(student.last_seen)).total_seconds() > 10:
        raise HTTPException(409, "Chrome extension is not connected")
    if not student.desktop_last_seen or (now - aware(student.desktop_last_seen)).total_seconds() > 10:
        raise HTTPException(409, "Desktop Guard is not connected")
    student.ready = True
    student.active = exam.active
    await db.commit()
    state = state_message(student, exam)
    await hub.student_broadcast(student.id, state)
    await publish_student(student)
    return state


# Backwards-compatible alias for already installed Desktop builds.
@router.post("/sessions/{session_id}/start")
async def start_alias(
    session_id: str, student: StudentSession = Depends(require_student), db: AsyncSession = Depends(get_db)
):
    return await ready(session_id, student, db)


@router.post("/sessions/{session_id}/stop")
async def stop(
    session_id: str, student: StudentSession = Depends(require_student), db: AsyncSession = Depends(get_db)
):
    raise HTTPException(403, "Only the teacher can stop monitoring")
