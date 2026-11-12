from datetime import UTC, datetime
from typing import Any, Literal
from urllib.parse import urlsplit, urlunsplit
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator, model_validator

EventType = Literal[
    "PAGE_HIDDEN",
    "NEW_TAB",
    "TAB_CHANGED",
    "GOOGLE_LENS_ATTEMPT",
    "BROWSER_UI_ATTEMPT",
    "CHROME_FOCUS_LOST",
    "DESKTOP_GUARD_DISCONNECTED",
    "STUDENT_DISCONNECTED",
    "STUDENT_RECONNECTED",
    "TEACHER_SCREENSHOT",
    "RETURN_TO_EXAM",
]
Severity = Literal["info", "medium", "high"]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    @field_serializer("*", when_used="json", check_fields=False)
    def serialize(self, value: Any):
        if isinstance(value, datetime):
            return value.replace(tzinfo=value.tzinfo or UTC).isoformat()
        return value


class ExamCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    allowed_url: str | None = Field(default=None, max_length=2048)
    allowed_urls: list[str] | None = Field(default=None, min_length=1, max_length=3)
    start_time: datetime | None = None

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value):
        if not value.strip():
            raise ValueError("Title cannot be blank")
        return value.strip()

    @model_validator(mode="before")
    @classmethod
    def accept_legacy_url(cls, value):
        if isinstance(value, dict) and not value.get("allowed_urls") and value.get("allowed_url"):
            value = {**value, "allowed_urls": [value["allowed_url"]]}
        return value

    @field_validator("allowed_urls")
    @classmethod
    def contest_urls(cls, values):
        if not values:
            raise ValueError("At least one URL is required")
        result = []
        for value in values:
            value = value.strip()
            url = urlsplit(value)
            if (
                len(value) > 2048 or not value.lower().startswith("https://")
                or url.scheme != "https" or not url.hostname
                or url.username or url.password or url.port not in (None, 443)
            ):
                raise ValueError("Use HTTPS URLs")
            host = url.hostname.lower()
            if ":" in host:
                host = f"[{host}]"
            normalized = urlunsplit((url.scheme, host, url.path or "/", "", ""))
            if normalized not in result:
                result.append(normalized)
        return result

    @model_validator(mode="after")
    def require_urls(self):
        if not self.allowed_urls:
            raise ValueError("At least one HTTPS URL is required")
        return self


class ExamOut(ORMModel):
    id: str
    title: str
    join_code: str
    allowed_url: str
    allowed_urls: list[str]
    created_at: datetime
    start_time: datetime | None
    finished_at: datetime | None
    active: bool
    paused: bool


class JoinRequest(BaseModel):
    student_name: str = Field(min_length=1, max_length=120)
    join_code: str = Field(pattern=r"^\d{4}$")

    @field_validator("student_name")
    @classmethod
    def name_not_blank(cls, value):
        if not value.strip():
            raise ValueError("Name cannot be blank")
        return value.strip()


class StudentOut(ORMModel):
    id: str
    exam_id: str
    student_name: str
    connected: bool
    active: bool
    ready: bool
    started_at: datetime
    last_seen: datetime
    risk_score: int
    violations_count: int
    last_event: str | None


class JoinOut(BaseModel):
    session: StudentOut
    exam: ExamOut
    token: str


class EventCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    student_session_id: UUID
    event_type: EventType
    severity: Severity
    timestamp: datetime
    current_url: str | None = Field(default=None, max_length=2048)
    metadata: dict[str, str | int | bool | None] = Field(default_factory=dict, max_length=10)

    @field_validator("metadata")
    @classmethod
    def minimal_metadata(cls, value):
        allowed = {"source", "reason", "window_id", "tab_id"}
        if set(value) - allowed or any(isinstance(v, str) and len(v) > 150 for v in value.values()):
            raise ValueError("Only minimal event context is accepted")
        return value


class EventOut(ORMModel):
    id: str
    student_session_id: str
    event_type: EventType
    severity: Severity
    current_url: str | None
    timestamp: datetime
    screenshot_path: str | None
    metadata: dict[str, Any] = Field(validation_alias="details")


class ScreenshotFailure(BaseModel):
    reason: Literal[
        "desktop_disconnected",
        "permission_denied",
        "capture_failed",
        "upload_failed",
        "rate_limited",
        "lease_expired",
    ]
