"""add multiple allowed urls and pause state

Revision ID: 0003
Revises: 0002
"""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("exams", sa.Column("allowed_urls", sa.JSON(), nullable=True))
    op.execute("UPDATE exams SET allowed_urls = json_build_array(allowed_url)")
    op.alter_column("exams", "allowed_urls", nullable=False)
    op.add_column("exams", sa.Column("paused", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    op.drop_column("exams", "paused")
    op.drop_column("exams", "allowed_urls")
