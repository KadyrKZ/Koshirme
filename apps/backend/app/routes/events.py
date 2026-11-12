from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import StudentSession, User, ViolationEvent
from app.schemas.api import EventCreate, EventOut, ScreenshotFailure
from app.services.auth import authenticate_student, authorized_exam, bearer, require_teacher
from app.services.events import capture_eligible, create_event, insert_event, publish_event
from app.services.limits import limiter
from app.services.storage import storage
from app.websockets.hub import hub

router = APIRouter(prefix="/api", tags=["events"])


@router.post("/students/{session_id}/screenshot-request", response_model=EventOut, status_code=201)
async def request_screenshot(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_teacher),
):
    student = await db.get(StudentSession, session_id)
    if not student:
        raise HTTPException(404, "Student not found")
    exam = await authorized_exam(db, student.exam_id, user)
    if not exam.active or not student.active or not student.connected:
        raise HTTPException(409, "Student monitoring is not active")
    event = insert_event(db, student, "TEACHER_SCREENSHOT", metadata={"capture_status": "pending"})
    await db.commit()
    await publish_event(student, event)
    await hub.student_broadcast(student.id, {"type": "capture_request", "event_id": event.id})
    return event


@router.post("/events", response_model=EventOut, status_code=201)
async def post_event(
    payload: EventCreate,
    db: AsyncSession = Depends(get_db),
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
):
    if not credentials:
        raise HTTPException(401, "Student token required")
    student = await authenticate_student(db, str(payload.student_session_id), credentials.credentials)
    limiter.check(f"events:{student.id}", 120)
    return await create_event(db, student, payload)


async def owned_event(event_id, db, credentials):
    if not credentials:
        raise HTTPException(401, "Student token required")
    event = await db.get(ViolationEvent, event_id)
    if not event:
        raise HTTPException(404, "Event not found")
    student = await authenticate_student(db, event.student_session_id, credentials.credentials)
    return event, student


@router.get("/events/{event_id}/capture", response_model=EventOut)
async def verify_capture(
    event_id: str,
    db: AsyncSession = Depends(get_db),
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
):
    event, student = await owned_event(event_id, db, credentials)
    await capture_eligible(db, event, student)
    return event


@router.post("/events/{event_id}/screenshot", response_model=EventOut)
async def upload_screenshot(
    event_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
):
    event, student = await owned_event(event_id, db, credentials)
    await capture_eligible(db, event, student)
    if event.screenshot_path:
        return event
    if file.content_type != "image/jpeg":
        raise HTTPException(415, "JPEG only")
    data = await file.read(settings.max_screenshot_bytes + 1)
    await file.close()
    if len(data) > settings.max_screenshot_bytes:
        raise HTTPException(413, "Screenshot is too large")
    filename = await storage.save(data)
    event.screenshot_path = filename
    event.details = {**event.details, "capture_status": "uploaded"}
    try:
        await db.commit()
    except Exception:
        await storage.delete(filename)
        raise
    await publish_event(student, event, "screenshot_updated")
    return event


@router.post("/events/{event_id}/screenshot-status", response_model=EventOut)
async def capture_failed(
    event_id: str,
    payload: ScreenshotFailure,
    db: AsyncSession = Depends(get_db),
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
):
    event, student = await owned_event(event_id, db, credentials)
    await capture_eligible(db, event, student)
    if not event.screenshot_path:
        event.details = {**event.details, "capture_status": "unavailable", "capture_reason": payload.reason}
        await db.commit()
        await publish_event(student, event, "screenshot_updated")
    return event


@router.get("/screenshots/{filename}")
async def get_screenshot(filename: str, db: AsyncSession = Depends(get_db), user: User = Depends(require_teacher)):
    event = await db.scalar(select(ViolationEvent).where(ViolationEvent.screenshot_path == filename))
    if not event:
        raise HTTPException(404, "Screenshot not found")
    student = await db.get(StudentSession, event.student_session_id)
    await authorized_exam(db, student.exam_id, user)
    return Response(
        await storage.read(filename),
        media_type="image/jpeg",
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )
