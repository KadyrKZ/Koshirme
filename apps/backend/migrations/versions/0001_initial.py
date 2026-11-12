"""Initial KOSH!RME schema."""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "exams",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("join_code", sa.String(6), nullable=False),
        sa.Column("allowed_url", sa.String(2048), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("start_time", sa.DateTime(timezone=True)),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column("active", sa.Boolean(), nullable=False),
    )
    op.create_index("ix_exams_join_code", "exams", ["join_code"], unique=True)
    op.create_table(
        "student_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("exam_id", sa.String(36), sa.ForeignKey("exams.id"), nullable=False),
        sa.Column("student_name", sa.String(120), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("connected", sa.Boolean(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=False),
        sa.Column("desktop_last_seen", sa.DateTime(timezone=True)),
        sa.Column("risk_score", sa.Integer(), nullable=False),
        sa.Column("violations_count", sa.Integer(), nullable=False),
        sa.Column("last_event", sa.String(50)),
    )
    op.create_index("ix_student_sessions_exam_id", "student_sessions", ["exam_id"])
    op.create_index("ix_student_sessions_active", "student_sessions", ["active"])
    op.create_table(
        "violation_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("student_session_id", sa.String(36), sa.ForeignKey("student_sessions.id"), nullable=False),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("severity", sa.String(10), nullable=False),
        sa.Column("current_url", sa.Text()),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("screenshot_path", sa.String(100), unique=True),
        sa.Column("metadata", sa.JSON(), nullable=False),
    )
    op.create_index("ix_violation_events_student_session_id", "violation_events", ["student_session_id"])
    op.create_index("ix_events_session_time", "violation_events", ["student_session_id", "timestamp"])


def downgrade():
    op.drop_table("violation_events")
    op.drop_table("student_sessions")
    op.drop_table("exams")
