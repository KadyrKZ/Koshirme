import asyncio
import json

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.database import SessionLocal
from app.models import StudentSession
from app.schemas.api import ExamOut, StudentOut
from app.services.auth import authenticate_student, authenticate_teacher, authorized_exam
from app.services.sessions import heartbeat
from app.websockets.hub import Peer, hub

router = APIRouter()


async def authenticate_frame(ws: WebSocket) -> dict:
    await ws.accept()
    data = await asyncio.wait_for(ws.receive_text(), timeout=5)
    if len(data) > 4096:
        raise ValueError("Auth frame too large")
    frame = json.loads(data)
    if not isinstance(frame, dict) or frame.get("type") != "auth" or not isinstance(frame.get("token"), str):
        raise ValueError("Auth frame required")
    return frame


@router.websocket("/ws/admin/{exam_id}")
async def admin_socket(ws: WebSocket, exam_id: str):
    peer = Peer(ws)
    try:
        frame = await authenticate_frame(ws)
        # Hold the send lock across snapshot loading so live updates cannot arrive ahead of it.
        async with peer.lock, SessionLocal() as db:
            user = await authenticate_teacher(db, frame["token"])
            exam = await authorized_exam(db, exam_id, user)
            hub.admins[exam_id].add(peer)
            students = (
                await db.scalars(select(StudentSession).where(StudentSession.exam_id == exam_id))
            ).all()
            await ws.send_json(
                {
                    "type": "snapshot",
                    "exam": ExamOut.model_validate(exam).model_dump(mode="json"),
                    "students": [StudentOut.model_validate(s).model_dump(mode="json") for s in students],
                }
            )
        while True:
            raw = await asyncio.wait_for(ws.receive_text(), timeout=45)
            if len(raw) > 1024:
                await ws.close(1009)
                return
            message = json.loads(raw)
            if not isinstance(message, dict):
                raise ValueError("Object expected")
            if message.get("type") == "ping":
                await peer.send({"type": "pong"})
    except (WebSocketDisconnect, TimeoutError, ValueError, RuntimeError, HTTPException):
        try:
            await ws.close(4401)
        except (RuntimeError, WebSocketDisconnect):
            pass
    finally:
        hub.admins[exam_id].discard(peer)


@router.websocket("/ws/student/{session_id}")
async def student_socket(ws: WebSocket, session_id: str):
    role = ""
    peer = Peer(ws)
    try:
        frame = await authenticate_frame(ws)
        role = frame.get("role", "")
        if role not in {"extension", "desktop"}:
            raise ValueError("Invalid client role")
        async with SessionLocal() as db:
            await authenticate_student(db, session_id, frame["token"])
        previous = hub.students[session_id].get(role)
        hub.students[session_id][role] = peer
        if previous:
            await previous.ws.close(4001, "Connection replaced")
        async with SessionLocal() as db:
            await peer.send(await heartbeat(db, session_id, role))
        while True:
            raw = await asyncio.wait_for(ws.receive_text(), timeout=20)
            if len(raw) > 1024:
                await ws.close(1009)
                return
            message = json.loads(raw)
            if not isinstance(message, dict):
                raise ValueError("Object expected")
            if message.get("type") != "heartbeat":
                continue
            if hub.students[session_id].get(role) is not peer:
                break
            async with SessionLocal() as db:
                await peer.send(await heartbeat(db, session_id, role))
    except (WebSocketDisconnect, TimeoutError, ValueError, HTTPException, RuntimeError):
        try:
            await ws.close(4401)
        except (RuntimeError, WebSocketDisconnect):
            pass
    finally:
        if hub.students[session_id].get(role) is peer:
            del hub.students[session_id][role]
