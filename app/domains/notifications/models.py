"""notifications 모델 — 알림 (기획안 v9 F15 · 7장, v10 반영목록 7장).

댓글도 게시글(kind=comment)이라 comment_id 칸은 없다. imagination_id 는
  thunder · wave → 반응을 받은 내 글 / comment · reply · quote → 새로 올라온 그 글 / follow → 없음
"""

from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.core.database import Base

TYPES = ("thunder", "wave", "quote", "comment", "reply", "follow", "shaken", "cited")


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        CheckConstraint(
            "type IN (" + ", ".join(f"'{t}'" for t in TYPES) + ")", name="ck_notifications_type"
        ),
        Index("ix_notifications_user_recent", "user_id", "created_at"),
        Index("ix_notifications_user_unread", "user_id", "read_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    type: Mapped[str] = mapped_column(String(10))
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    imagination_id: Mapped[int | None] = mapped_column(
        ForeignKey("imaginations.id", ondelete="CASCADE")
    )
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
