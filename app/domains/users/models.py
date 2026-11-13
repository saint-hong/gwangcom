"""users 모델 — 회원 · 팔로우 (기획안 v9 7장 users · follows). 연령대는 받지 않는다 (v9)."""

from datetime import date, datetime

from sqlalchemy import BigInteger, CheckConstraint, Date, DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.core.database import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("role IN ('user', 'admin')", name="ck_users_role"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(String(100))
    nickname: Mapped[str] = mapped_column(String(20), unique=True)
    bio: Mapped[str | None] = mapped_column(String(160))
    avatar_url: Mapped[str | None] = mapped_column(String(300))
    cover_url: Mapped[str | None] = mapped_column(String(300))  # 프로필 커버 이미지 (Sprint 3)
    role: Mapped[str] = mapped_column(String(10), default="user", server_default="user")
    tier_id: Mapped[int | None] = mapped_column(ForeignKey("user_tiers.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"


class Follow(Base):
    """팔로우 (F11) — 팔로잉 피드와 Wave 전파의 기반."""

    __tablename__ = "follows"
    __table_args__ = (
        CheckConstraint("follower_id <> followee_id", name="ck_follows_not_self"),
        Index("ix_follows_followee", "followee_id", "created_at"),
    )

    follower_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    followee_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UserVisit(Base):
    """하루 접속 기록 (6-D 활성화 분석, 2026-11-13) — 로그인한 Dreamer 가 그날(한국 날짜) 처음 요청할 때 한 줄.

    활동(글 · 반응)이 없어도 "들어와서 보기만 한 날"을 알 수 있다 → 신규 Dreamer 첫 7일 단계표의 "다시 들어옴".
    """

    __tablename__ = "user_visits"
    __table_args__ = (Index("ix_user_visits_day", "day"),)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    day: Mapped[date] = mapped_column(Date, primary_key=True)  # 한국 날짜
    first_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
