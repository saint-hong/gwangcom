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
