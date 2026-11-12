"""prompts 모델 — 이번 주 질문 (Sprint 6-C, 기획안 v11 F13 · 7장 prompts).

운영자가 등록하는 상상 주제. 질문으로 들어온 상상은 imaginations.prompt_id 가 붙어 자유 상상과 구분한다
(질문 편향 통제 — 운영자가 던진 질문이 반복 상상을 만들어 낼 수 있어서).
지금 질문 = 켜져 있고(is_active) 기간 안(starts_at ≤ 지금 < ends_at, ends_at 이 비면 계속)인 것 중 가장 늦게 시작한 것.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.core.database import Base


class Prompt(Base):
    __tablename__ = "prompts"
    __table_args__ = (Index("ix_prompts_period", "is_active", "starts_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(80))  # 질문 한 줄
    body: Mapped[str | None] = mapped_column(String(300))  # 덧붙이는 설명 (선택)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
