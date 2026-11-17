"""notes 모델 — Observe Note (Sprint 6-E, 기획안 v11 F14 · 7장 notes).

운영자가 직접 쓰는 인사이트 글. 운영자는 만들기 · 고치기 · 지우기를 모두 할 수 있다 (2026-11-17 사용자 결정 —
원칙 5 "상상은 고칠 수 없음"은 Dreamer 의 상상 규칙이라 운영자 글에는 해당하지 않음).
- 본문은 Markdown (소제목 ## 으로 목차, 이미지 ![캡션](주소) 은 화면에서 그림 + 캡션)
- 번호(#N)는 처음 발행할 때 매긴다. 임시 저장 글은 번호가 없고 운영자에게만 보인다
"""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.core.database import Base


class Note(Base):
    __tablename__ = "notes"
    __table_args__ = (
        Index("ix_notes_published", "status", "published_at"),
        CheckConstraint("status IN ('draft', 'published')", name="ck_notes_status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    number: Mapped[int | None] = mapped_column(Integer, unique=True)  # 처음 발행할 때 #N
    title: Mapped[str] = mapped_column(String(120))
    lead: Mapped[str | None] = mapped_column(String(300))  # 한 줄 요약
    body_md: Mapped[str] = mapped_column(Text, default="", server_default="")
    # 2026-11-17 사용자 결정 (X · h사 긴 글 검토 뒤)
    cover_url: Mapped[str | None] = mapped_column(String(300))  # 대표 이미지
    summary: Mapped[str | None] = mapped_column(
        Text
    )  # AI 요약 (AI 초안 → 운영자가 고쳐서 저장, 줄마다 한 항목)
    sources: Mapped[str | None] = mapped_column(Text)  # 출처 (줄마다 하나, 비면 화면에 안 보임)
    view_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    status: Mapped[str] = mapped_column(String(10), default="draft", server_default="draft")
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class NoteReaction(Base):
    """Observe Note 반응 — Thunder · Wave · 북마크 (2026-11-17 사용자 요청). 한 사람이 노트마다 종류별로 하나."""

    __tablename__ = "note_reactions"
    __table_args__ = (
        Index("ix_note_reactions_note", "note_id", "kind"),
        Index("ix_note_reactions_user", "user_id", "kind", "created_at"),
        Index(
            "ix_note_reactions_kind_time", "kind", "created_at"
        ),  # 팔로잉 피드: 팔로우한 사람의 노트 Wave
        CheckConstraint("kind IN ('thunder', 'wave', 'bookmark')", name="ck_note_reactions_kind"),
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    note_id: Mapped[int] = mapped_column(
        ForeignKey("notes.id", ondelete="CASCADE"), primary_key=True
    )
    kind: Mapped[str] = mapped_column(String(10), primary_key=True)
    # Wave 확산 경로: 이 사람의 Wave 를 보고 Wave 함 (상상 waves.via_user_id 와 같은 뜻)
    via_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
