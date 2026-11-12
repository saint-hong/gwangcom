"""imaginations 모델 — 상상(원본·혼합·인용) + 댓글 · 상세 조회 기록 (기획안 v9 7장).

v10 반영목록 3-3: 댓글·답글도 게시글처럼 이 테이블에 kind=comment 로 저장한다 (X 방식).
  parent_id = 바로 위 글(상상 또는 맨 위 댓글), root_id = 맨 위 상상. 답글은 지금 1단계까지.
  홈 피드 · 서재 Thunder 탭 · "대중 상상" 지표에서는 kind=comment 를 뺀다.
"""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.domains.tags.models import Domain
from app.domains.users.models import User
from app.infrastructure.core.database import Base


class Imagination(Base):
    __tablename__ = "imaginations"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('original', 'blend', 'quote', 'comment')", name="ck_imaginations_kind"
        ),
        CheckConstraint(
            "status IN ('visible', 'hidden', 'deleted')", name="ck_imaginations_status"
        ),
        CheckConstraint(
            "tagging_status IN ('pending', 'done', 'failed')", name="ck_imaginations_tagging"
        ),
        Index("ix_imaginations_feed", "status", "created_at", "id"),
        Index("ix_imaginations_author", "author_id", "created_at"),
        Index("ix_imaginations_domain", "domain_id", "created_at"),
        Index("ix_imaginations_thread", "parent_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(10), default="original", server_default="original")
    # 글자 수 한도는 이용 한도(F20)가 정한다. 컬럼 길이는 관리자가 늘릴 수 있게 넉넉히 둔다.
    title: Mapped[str | None] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(String(5000))
    desire: Mapped[str | None] = mapped_column(String(1000))
    image_url: Mapped[str | None] = mapped_column(String(300))
    domain_id: Mapped[int] = mapped_column(ForeignKey("domains.id"))
    secondary_domain_id: Mapped[int | None] = mapped_column(ForeignKey("domains.id"))
    quoted_id: Mapped[int | None] = mapped_column(
        ForeignKey("imaginations.id", ondelete="SET NULL")
    )
    # 댓글(kind=comment)일 때만: 바로 위 글 · 맨 위 상상
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("imaginations.id", ondelete="CASCADE"))
    root_id: Mapped[int | None] = mapped_column(ForeignKey("imaginations.id", ondelete="CASCADE"))
    ai_assisted: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    prompt_id: Mapped[int | None] = mapped_column(Integer)  # 이번 주 질문(Sprint 6)에서 FK 추가
    shake_allowed: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    status: Mapped[str] = mapped_column(String(10), default="visible", server_default="visible")

    # 정렬·표시용 집계 캐시. comment_count: 상상이면 댓글+답글 전체, 댓글이면 답글 수
    thunder_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    comment_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    wave_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    quote_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    bookmark_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    child_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    tagging_status: Mapped[str] = mapped_column(
        String(10), default="pending", server_default="pending"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    author: Mapped[User] = relationship(lazy="joined")
    domain: Mapped[Domain] = relationship(foreign_keys=[domain_id], lazy="joined")
    secondary_domain: Mapped[Domain | None] = relationship(
        foreign_keys=[secondary_domain_id], lazy="joined"
    )

    @property
    def display_title(self) -> str:
        """제목이 없으면 본문 첫 줄을 제목으로 쓴다 (F2)."""
        if self.title:
            return self.title
        first = self.body.strip().splitlines()[0] if self.body.strip() else ""
        return first[:40] + ("…" if len(first) > 40 else "")


class ImaginationView(Base):
    """상세 조회 기록 — 서재 "최근 본 상상" + 관심 신호 (v9 F7). 다시 보면 viewed_at 만 갱신."""

    __tablename__ = "imagination_views"
    __table_args__ = (Index("ix_imagination_views_user_recent", "user_id", "viewed_at"),)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    imagination_id: Mapped[int] = mapped_column(
        ForeignKey("imaginations.id", ondelete="CASCADE"), primary_key=True
    )
    viewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
