"""Shake it 모델 — 계보(imagination_parents) · 시도 기록(shake_attempts) (기획안 v10 7장 · F8 · F9).

- imagination_parents: 혼합 글(child) ← 재료 글(parent) 2개. position 0 = 상대 글, 1 = 내 글
- shake_attempts: Shake it 행동 기록 (분석 핵심, 원칙 2). 실패도 남긴다. 하루 횟수는 published 만 센다
"""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.core.database import Base


class ImaginationParent(Base):
    __tablename__ = "imagination_parents"
    __table_args__ = (
        CheckConstraint("position IN (0, 1)", name="ck_imagination_parents_position"),
        Index("ix_imagination_parents_parent", "parent_id", "child_id"),
    )

    child_id: Mapped[int] = mapped_column(
        ForeignKey("imaginations.id", ondelete="CASCADE"), primary_key=True
    )
    position: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    parent_id: Mapped[int] = mapped_column(ForeignKey("imaginations.id", ondelete="CASCADE"))


class ShakeAttempt(Base):
    __tablename__ = "shake_attempts"
    __table_args__ = (
        CheckConstraint(
            "status IN ('processing', 'published', 'failed')", name="ck_shake_attempts_status"
        ),
        Index("ix_shake_attempts_user_day", "user_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    target_id: Mapped[int] = mapped_column(ForeignKey("imaginations.id", ondelete="CASCADE"))
    mine_id: Mapped[int] = mapped_column(ForeignKey("imaginations.id", ondelete="CASCADE"))
    selection_ms: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(12), default="processing")
    published_id: Mapped[int | None] = mapped_column(
        ForeignKey("imaginations.id", ondelete="SET NULL")
    )
    ai_elements: Mapped[dict | None] = mapped_column(JSONB)
    llm_model: Mapped[str | None] = mapped_column(String(80))
    error: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
