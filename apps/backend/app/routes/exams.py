import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, lock_exam
from app.models import Exam, StudentSession, ViolationEvent, utcnow
from app.schemas.api import EventOut, ExamCreate, ExamOut, StudentOut
from app.services.auth import authorized_exam, require_teacher
from app.services.sessions import publish_student, state_message
from app.services.storage import storage
from app.websockets.hub import hub

router = APIRouter(prefix="/api", tags=["teacher"])


@router.post("/exams", response_model=ExamOut, status_code=201)
async def create_exam(payload: ExamCreate, db: AsyncSession = Depends(get_db), user=Depends(require_teacher)):
    code = f"{secrets.randbelow(10000):04d}"
    while await db.scalar(select(Exam.id).where(Exam.join_code == code, Exam.finished_at.is_(None))):
        code = f"{secrets.randbelow(10000):04d}"
    values = payload.model_dump(exclude={"allowed_url"})
    urls = values["allowed_urls"]
    exam = Exam(
        **values,
        allowed_url=urls[0],
        join_code=code,
        owner_id=None if user.id == "legacy" else user.id,
    )
    db.add(exam)
    await db.commit()
    return exam


@router.get("/exams", response_model=list[ExamOut])
async def list_exams(db: AsyncSession = Depends(get_db), user=Depends(require_teacher)):
    query = select(Exam).order_by(Exam.created_at.desc())
    if user.role != "admin":
        query = query.where(Exam.owner_id == user.id)
    return (await db.scalars(query)).all()


@router.get("/exams/{exam_id}", response_model=ExamOut)
async def get_exam(exam_id: str, db: AsyncSession = Depends(get_db), user=Depends(require_teacher)):
    return await authorized_exam(db, exam_id, user)


async def change_exam(db: AsyncSession, exam_id: str, action: str, user):
    await authorized_exam(db, exam_id, user)
    exam = await lock_exam(db, exam_id)
    if not exam:
        raise HTTPException(404, "Exam not found")
    if action in {"start", "resume"} and exam.finished_at:
        raise HTTPException(409, "A finished exam cannot be restarted; create another exam")
    if action == "pause" and exam.finished_at:
        raise HTTPException(409, "The room has finished")
    active = action in {"start", "resume"}
    exam.active = active
    exam.paused = action == "pause"
    students = (await db.scalars(select(StudentSession).where(StudentSession.exam_id == exam_id))).all()
    if action == "finish":
        exam.finished_at = exam.finished_at or utcnow()
        for student in students:
            student.active = False
            student.ready = False
    elif action == "pause":
        for student in students:
            student.active = False
    else:
        for student in students:
            # Readiness is explicit consent. Monitoring starts for every ready participant at once.
            if student.ready:
                student.active = True
    await db.commit()
    await hub.admin_broadcast(
        exam_id, {"type": "exam_updated", "exam": ExamOut.model_validate(exam).model_dump(mode="json")}
    )
    for student in students:
        await hub.student_broadcast(student.id, state_message(student, exam))
        await publish_student(student)
    return exam


@router.post("/exams/{exam_id}/start", response_model=ExamOut)
async def start_exam(exam_id: str, db: AsyncSession = Depends(get_db), user=Depends(require_teacher)):
    return await change_exam(db, exam_id, "start", user)


@router.post("/exams/{exam_id}/pause", response_model=ExamOut)
async def pause_exam(exam_id: str, db: AsyncSession = Depends(get_db), user=Depends(require_teacher)):
    return await change_exam(db, exam_id, "pause", user)


@router.post("/exams/{exam_id}/finish", response_model=ExamOut)
async def finish_exam(exam_id: str, db: AsyncSession = Depends(get_db), user=Depends(require_teacher)):
    return await change_exam(db, exam_id, "finish", user)


@router.delete("/exams/{exam_id}", status_code=204)
async def delete_exam(exam_id: str, db: AsyncSession = Depends(get_db), user=Depends(require_teacher)):
    exam = await authorized_exam(db, exam_id, user)
    if exam.active:
        raise HTTPException(409, "Pause or finish the room before deleting it")
    # Deliver a terminal state while the room and its students still exist.
    exam = await change_exam(db, exam_id, "finish", user)
    session_ids = list(
        (await db.scalars(select(StudentSession.id).where(StudentSession.exam_id == exam_id))).all()
    )
    screenshots: list[str] = []
    if session_ids:
        screenshots = list(
            (await db.scalars(
                select(ViolationEvent.screenshot_path).where(
                    ViolationEvent.student_session_id.in_(session_ids),
                    ViolationEvent.screenshot_path.is_not(None),
                )
            )).all()
        )
        await db.execute(delete(ViolationEvent).where(ViolationEvent.student_session_id.in_(session_ids)))
        await db.execute(delete(StudentSession).where(StudentSession.id.in_(session_ids)))
    await db.delete(exam)
    await db.commit()
    for filename in screenshots:
        await storage.delete(filename)


@router.get("/exams/{exam_id}/students", response_model=list[StudentOut])
async def list_students(exam_id: str, db: AsyncSession = Depends(get_db), user=Depends(require_teacher)):
    await authorized_exam(db, exam_id, user)
    return (
        await db.scalars(
            select(StudentSession)
            .where(StudentSession.exam_id == exam_id)
            .order_by(StudentSession.started_at)
        )
    ).all()


@router.get("/students/{session_id}/events", response_model=list[EventOut])
async def list_events(
    session_id: str, limit: int = 200, before: str | None = None, db: AsyncSession = Depends(get_db)
    , user=Depends(require_teacher)
):
    student = await db.get(StudentSession, session_id)
    if not student:
        raise HTTPException(404, "Student not found")
    await authorized_exam(db, student.exam_id, user)
    query = select(ViolationEvent).where(ViolationEvent.student_session_id == session_id)
    if before:
        cursor = await db.get(ViolationEvent, before)
        if not cursor or cursor.student_session_id != session_id:
            raise HTTPException(422, "Invalid cursor")
        query = query.where(ViolationEvent.timestamp < cursor.timestamp)
    return (
        await db.scalars(query.order_by(ViolationEvent.timestamp.desc()).limit(max(1, min(limit, 500))))
    ).all()
