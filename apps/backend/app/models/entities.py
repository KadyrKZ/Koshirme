import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


def uuid_string() -> str:
    return str(uuid.uuid4())


class Exam(Base):
    __tablename__ = "exams"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_string)
    title: Mapped[str] = mapped_column(String(200))
    join_code: Mapped[str] = mapped_column(String(4), index=True)
    allowed_url: Mapped[str] = mapped_column(String(2048))
    allowed_urls: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    start_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    active: Mapped[bool] = mapped_column(Boolean, default=False)
    paused: Mapped[bool] = mapped_column(Boolean, default=False)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), index=True)


class StudentSession(Base):
    __tablename__ = "student_sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_string)
    exam_id: Mapped[str] = mapped_column(ForeignKey("exams.id"), index=True)
    student_name: Mapped[str] = mapped_column(String(120))
    token_hash: Mapped[str] = mapped_column(String(64))
    connected: Mapped[bool] = mapped_column(Boolean, default=False)
    active: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    ready: Mapped[bool] = mapped_column(Boolean, default=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    desktop_last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    risk_score: Mapped[int] = mapped_column(Integer, default=0)
    violations_count: Mapped[int] = mapped_column(Integer, default=0)
    last_event: Mapped[str | None] = mapped_column(String(50))


class ViolationEvent(Base):
    __tablename__ = "violation_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_string)
    student_session_id: Mapped[str] = mapped_column(ForeignKey("student_sessions.id"), index=True)
    event_type: Mapped[str] = mapped_column(String(50))
    severity: Mapped[str] = mapped_column(String(10))
    current_url: Mapped[str | None] = mapped_column(Text)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    screenshot_path: Mapped[str | None] = mapped_column(String(100), unique=True)
    details: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    __table_args__ = (Index("ix_events_session_time", "student_session_id", "timestamp"),)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_string)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(256))
    role: Mapped[str] = mapped_column(String(10), default="teacher")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class LoginSession(Base):
    __tablename__ = "login_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
