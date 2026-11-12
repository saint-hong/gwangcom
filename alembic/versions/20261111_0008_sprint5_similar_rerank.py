"""Sprint 5-C — 비슷한 상상 리랭킹 결과(similar_sets · similar_links) (기획안 v10 F23, v11 반영목록 5장)

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-11 17:33:18.320750
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = '0008'
down_revision: str | None = '0007'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('similar_sets',
    sa.Column('imagination_id', sa.BigInteger(), nullable=False),
    sa.Column('method', sa.String(length=10), nullable=False),
    sa.Column('model', sa.String(length=80), nullable=False),
    sa.Column('candidate_count', sa.SmallInteger(), nullable=False),
    sa.Column('computed_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['imagination_id'], ['imaginations.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('imagination_id')
    )
    op.create_table('similar_links',
    sa.Column('imagination_id', sa.BigInteger(), nullable=False),
    sa.Column('similar_id', sa.BigInteger(), nullable=False),
    sa.Column('rank', sa.SmallInteger(), nullable=False),
    sa.Column('score', sa.Float(), nullable=False),
    sa.Column('reason', sa.String(length=200), nullable=True),
    sa.ForeignKeyConstraint(['imagination_id'], ['similar_sets.imagination_id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['similar_id'], ['imaginations.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('imagination_id', 'similar_id')
    )
    op.create_index('ix_similar_links_similar', 'similar_links', ['similar_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_similar_links_similar', table_name='similar_links')
    op.drop_table('similar_links')
    op.drop_table('similar_sets')
