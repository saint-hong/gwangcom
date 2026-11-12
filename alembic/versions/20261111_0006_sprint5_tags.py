"""Sprint 5-A — 태그(tags) · 상상-태그 연결(imagination_tags)

기획안 v10 F10 · 7장. 정규화 규칙은 app/domains/tags/models.py 머리말 (v11 반영목록 3장).
주의: autogenerate 가 HNSW 인덱스(0005 에서 SQL 로 만든 것)를 지우려고 잡는다 → 그 줄은 뺐다.

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-11 12:58:04.310783
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = '0006'
down_revision: str | None = '0005'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('tags',
    sa.Column('id', sa.BigInteger(), nullable=False),
    sa.Column('name', sa.String(length=40), nullable=False),
    sa.Column('label', sa.String(length=40), nullable=False),
    sa.Column('type', sa.String(length=10), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("type IN ('tech', 'desire')", name='ck_tags_type'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('name', 'type', name='uq_tags_name_type')
    )
    op.create_table('imagination_tags',
    sa.Column('imagination_id', sa.BigInteger(), nullable=False),
    sa.Column('tag_id', sa.BigInteger(), nullable=False),
    sa.Column('source', sa.String(length=10), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("source IN ('ai', 'user')", name='ck_imagination_tags_source'),
    sa.ForeignKeyConstraint(['imagination_id'], ['imaginations.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['tag_id'], ['tags.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('imagination_id', 'tag_id')
    )
    op.create_index('ix_imagination_tags_tag', 'imagination_tags', ['tag_id', 'imagination_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_imagination_tags_tag', table_name='imagination_tags')
    op.drop_table('imagination_tags')
    op.drop_table('tags')
