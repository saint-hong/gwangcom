"""Sprint 5-D — 작성자 태그 편집: 지운 태그 기록(imagination_tags.removed_at) · 태그 수 한도(limit.tag_count)

작성자가 지운 태그는 행을 지우지 않고 removed_at 을 채운다 (2026-11-12 사용자 결정).
"AI 가 붙였는데 사람이 거절한 태그"는 태깅 품질을 보는 분석 데이터이기 때문이다.
화면 · 집계는 removed_at IS NULL 인 태그만 쓴다. 다시 태깅해도 지운 태그는 되살리지 않는다.

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-12 15:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "imagination_tags",
        sa.Column("removed_at", sa.DateTime(timezone=True), nullable=True),
    )
    # 작성자가 붙일 수 있는 기술 태그 수 (기획안 F2 "최대 5개", F20 이용 한도)
    policy = sa.table(
        "policy_settings",
        sa.column("scope", sa.String),
        sa.column("key", sa.String),
        sa.column("value", postgresql.JSONB),
    )
    op.bulk_insert(policy, [{"scope": "global", "key": "limit.tag_count", "value": 5}])


def downgrade() -> None:
    op.execute("DELETE FROM policy_settings WHERE key = 'limit.tag_count'")
    op.execute("DELETE FROM imagination_tags WHERE removed_at IS NOT NULL")
    op.drop_column("imagination_tags", "removed_at")
