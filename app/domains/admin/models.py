"""admin 모델 — 운영자 숨김 기록 (Sprint 6-A, 기획안 v11 F19).

지금 상태는 imaginations.status(visible | hidden)에 있고, 누가 · 언제 · 왜 숨기고 다시 보이게 했는지는
여기에 쌓는다 (UI 가 곧 데이터 수집 장치 — 운영 판단도 기록으로 남긴다).
"""

from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.core.database import Base


class ModerationLog(Base):
    __tablename__ = "moderation_logs"
    __table_args__ = (
        CheckConstraint("action IN ('hide', 'unhide')", name="ck_moderation_logs_action"),
        Index("ix_moderation_logs_item", "imagination_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    admin_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    imagination_id: Mapped[int] = mapped_column(ForeignKey("imaginations.id", ondelete="CASCADE"))
    action: Mapped[str] = mapped_column(String(10))
    reason: Mapped[str | None] = mapped_column(String(200))  # 운영자 메모 (작성자에게 보이지 않음)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
