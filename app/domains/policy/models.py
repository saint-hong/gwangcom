"""policy 모델 — 등급 · 이용 한도·권한 (기획안 v9 F20, 7장)."""

from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.core.database import Base


class UserTier(Base):
    """등급 (기본 / 활발한 Dreamer / 테스트 그룹 …). 이름과 값은 운영자가 정한다 (Sprint 6)."""

    __tablename__ = "user_tiers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(40), unique=True)
    description: Mapped[str | None] = mapped_column(String(200))
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PolicySetting(Base):
    """한도·권한 값 하나. scope = global | tier | user. 같은 key 는 user → tier → global 순으로 우선한다."""

    __tablename__ = "policy_settings"
    __table_args__ = (
        CheckConstraint("scope IN ('global', 'tier', 'user')", name="ck_policy_scope"),
        CheckConstraint(
            "(scope = 'global' AND tier_id IS NULL AND user_id IS NULL)"
            " OR (scope = 'tier' AND tier_id IS NOT NULL AND user_id IS NULL)"
            " OR (scope = 'user' AND user_id IS NOT NULL AND tier_id IS NULL)",
            name="ck_policy_scope_target",
        ),
        # NULL 을 같은 값으로 보도록 COALESCE 로 유일성 보장
        Index(
            "uq_policy_settings_target_key",
            "scope",
            text("COALESCE(tier_id, 0)"),
            text("COALESCE(user_id, 0)"),
            "key",
            unique=True,
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    scope: Mapped[str] = mapped_column(String(10))
    tier_id: Mapped[int | None] = mapped_column(ForeignKey("user_tiers.id", ondelete="CASCADE"))
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    key: Mapped[str] = mapped_column(String(60))
    value: Mapped[Any] = mapped_column(JSONB)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class PolicyChangeLog(Base):
    """한도 · 권한 · 등급 · 역할을 바꾼 기록 (기획안 F20 "변경 기록", Sprint 6-B).

    누가(admin_id) · 언제 · 누구의(target_scope + tier_id / user_id) · 무엇을(key) · 어떤 값에서(old) 어떤 값으로(new).
    key 는 policy key(limit.* · perm.*) 외에 사용자 등급 변경 "user.tier" · 역할 변경 "user.role" 도 쓴다.
    값을 지우면(기본값 따르기 · 예외 해제) new_value = null.
    """

    __tablename__ = "policy_change_logs"
    __table_args__ = (
        CheckConstraint(
            "target_scope IN ('global', 'tier', 'user')", name="ck_policy_change_logs_scope"
        ),
        Index("ix_policy_change_logs_user", "user_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    admin_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    target_scope: Mapped[str] = mapped_column(String(10))
    tier_id: Mapped[int | None] = mapped_column(ForeignKey("user_tiers.id", ondelete="SET NULL"))
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    key: Mapped[str] = mapped_column(String(60))
    old_value: Mapped[Any | None] = mapped_column(JSONB)
    new_value: Mapped[Any | None] = mapped_column(JSONB)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
