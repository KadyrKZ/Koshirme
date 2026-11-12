"""Accounts, room owners and student readiness; preserve historical exams."""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_index("ix_exams_join_code", table_name="exams")
    op.execute(
        """WITH numbered AS (
               SELECT id, row_number() OVER (ORDER BY created_at, id) - 1 AS number FROM exams
           )
           UPDATE exams SET join_code = lpad((numbered.number % 10000)::text, 4, '0')
           FROM numbered WHERE exams.id = numbered.id"""
    )
    op.alter_column("exams", "join_code", type_=sa.String(4), existing_type=sa.String(6))
    op.create_index("ix_exams_join_code", "exams", ["join_code"], unique=False)
    op.create_table("users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("password_hash", sa.String(256), nullable=False),
        sa.Column("role", sa.String(10), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_table("login_sessions",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_login_sessions_user_id", "login_sessions", ["user_id"])
    op.add_column("exams", sa.Column("owner_id", sa.String(36), sa.ForeignKey("users.id")))
    op.create_index("ix_exams_owner_id", "exams", ["owner_id"])
    op.add_column("student_sessions", sa.Column("ready", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.alter_column("student_sessions", "ready", server_default=None)


def downgrade():
    op.drop_column("student_sessions", "ready")
    op.drop_index("ix_exams_owner_id", "exams")
    op.drop_column("exams", "owner_id")
    op.drop_table("login_sessions")
    op.drop_table("users")
    op.drop_index("ix_exams_join_code", table_name="exams")
    op.alter_column("exams", "join_code", type_=sa.String(6), existing_type=sa.String(4))
    op.create_index("ix_exams_join_code", "exams", ["join_code"], unique=True)
