"""reactions 모델 — Thunder · Wave · 북마크 + 켜기·끄기 기록 (기획안 v9 7장, v10 반영목록 2장).

상상과 댓글(kind=comment) 모두 같은 표를 쓴다. 분석에서 "욕망 지표"를 볼 때는 kind 로 댓글을 거른다.
"""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.core.database import Base


def _user_fk() -> Mapped[int]:
    return mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)


def _item_fk() -> Mapped[int]:
    return mapped_column(ForeignKey("imaginations.id", ondelete="CASCADE"), primary_key=True)


class Thunder(Base):
    """Thunder — "번뜩인다, 멋지다" 호감 신호 (욕망의 표시 지표)."""

    __tablename__ = "thunders"
    __table_args__ = (Index("ix_thunders_user_recent", "user_id", "created_at"),)

    user_id: Mapped[int] = _user_fk()
    imagination_id: Mapped[int] = _item_fk()
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Wave(Base):
    """Wave — 내 팔로워에게 퍼뜨리기. via_user_id = 이 사람의 Wave 를 보고 Wave 함 (Sprint 3 부터 채움)."""

    __tablename__ = "waves"
    __table_args__ = (Index("ix_waves_user_recent", "user_id", "created_at"),)

    user_id: Mapped[int] = _user_fk()
    imagination_id: Mapped[int] = _item_fk()
    via_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Bookmark(Base):
    """북마크 — 서재에 모인다. 수는 관심 신호(분석용, 화면에는 표시하지 않음)."""

    __tablename__ = "bookmarks"
    __table_args__ = (Index("ix_bookmarks_user_recent", "user_id", "created_at"),)

    user_id: Mapped[int] = _user_fk()
    imagination_id: Mapped[int] = _item_fk()
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ReactionEvent(Base):
    """반응을 켜고 끈 일을 시간순으로 쌓는다 (원칙 2: 모든 행동은 분석 데이터).

    기록 범위가 너무 사소하지 않은지는 추후 검토한다 (v10 반영목록 2장).
    """

    __tablename__ = "reaction_events"
    __table_args__ = (
        CheckConstraint("type IN ('thunder', 'wave', 'bookmark')", name="ck_reaction_events_type"),
        Index("ix_reaction_events_item", "imagination_id", "created_at"),
        Index("ix_reaction_events_user", "user_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    imagination_id: Mapped[int] = mapped_column(ForeignKey("imaginations.id", ondelete="CASCADE"))
    type: Mapped[str] = mapped_column(String(10))
    on: Mapped[bool] = mapped_column(Boolean)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
