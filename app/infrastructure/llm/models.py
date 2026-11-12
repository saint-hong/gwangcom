"""llm_calls — AI 호출 기록 (기획안 v10 9장 · 7장). 비용 · 실패 · 속도를 추적한다."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.core.database import Base


class LlmCall(Base):
    __tablename__ = "llm_calls"
    __table_args__ = (
        CheckConstraint(
            "status IN ('success', 'failed', 'refused', 'limited')", name="ck_llm_calls_status"
        ),
        Index("ix_llm_calls_created", "created_at"),
        Index("ix_llm_calls_feature", "feature", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    feature: Mapped[str] = mapped_column(
        String(20)
    )  # tagging | shake | note_draft | embedding | eval
    provider: Mapped[str] = mapped_column(String(20))
    model: Mapped[str] = mapped_column(String(80))
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    imagination_id: Mapped[int | None] = mapped_column(
        ForeignKey("imaginations.id", ondelete="SET NULL")
    )
    input_tokens: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    output_tokens: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    est_cost_usd: Mapped[Decimal] = mapped_column(Numeric(12, 6), default=0, server_default="0")
    latency_ms: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    status: Mapped[str] = mapped_column(String(10))
    error: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
