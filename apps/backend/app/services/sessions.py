from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import lock_exam
from app.models import Exam, StudentSession, utcnow
from app.schemas.api import ExamOut, StudentOut
from app.services.events import aware, insert_event, publish_event
from app.websockets.hub import hub

WAITING_URL = "https://fizmat.win/waiting"


def student_exam(exam: Exam) -> dict:
    """Hide the assigned contest until the teacher starts the room."""
    result = ExamOut.model_validate(exam).model_dump(mode="json")
    if not exam.active:
        result["title"] = "Контест"
        result["allowed_url"] = WAITING_URL
        result["allowed_urls"] = [WAITING_URL]
    return result


def state_message(student: StudentSession, exam: Exam, kind="session_state") -> dict:
    return {
        "type": kind,
        "session": StudentOut.model_validate(student).model_dump(mode="json"),
        "exam": student_exam(exam),
        "lease_seconds": settings.monitoring_lease_seconds,
    }


async def publish_student(student: StudentSession):
    await hub.admin_broadcast(
        student.exam_id,
        {"type": "student_updated", "student": StudentOut.model_validate(student).model_dump(mode="json")},
    )


async def heartbeat(db: AsyncSession, session_id: str, role: str):
    student = await db.get(StudentSession, session_id)
    if not student:
        return None
    exam = await lock_exam(db, student.exam_id)
    await db.refresh(student)
    if role == "extension":
        student.connected = True
        student.last_seen = utcnow()
    else:
        student.desktop_last_seen = utcnow()
    await db.commit()
    if role == "extension":
        await publish_student(student)
    return state_message(student, exam, "heartbeat_ack")


async def check_timeouts(db: AsyncSession):
    students = (await db.scalars(select(StudentSession).where(StudentSession.connected.is_(True)))).all()
    now = utcnow()
    for candidate in students:
        if (now - aware(candidate.last_seen)).total_seconds() <= settings.heartbeat_timeout_seconds:
            continue
        exam = await lock_exam(db, candidate.exam_id)
        await db.refresh(candidate)
        if (
            not candidate.connected
            or (now - aware(candidate.last_seen)).total_seconds() <= settings.heartbeat_timeout_seconds
        ):
            await db.commit()
            continue
        candidate.connected = False
        event = None
        if exam.active and candidate.active:
            event = insert_event(
                db, candidate, "STUDENT_DISCONNECTED", metadata={"reason": "heartbeat_timeout"}
            )
        await db.commit()
        if event:
            await publish_event(candidate, event)
        else:
            await publish_student(candidate)
        await hub.student_broadcast(candidate.id, state_message(candidate, exam))
