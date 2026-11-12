"""policy 서비스 — 사용자에게 적용되는 최종 이용 한도·권한 계산 (기획안 v9 F20 · 7장 "최종 한도 계산").

순서: 개인별 예외(만료 안 된 것) → 등급 값 → 전체 기본값. 먼저 찾은 값을 쓴다.
코드의 SAFE_DEFAULTS 는 policy_settings 가 비었을 때의 안전값으로만 쓴다.
"""

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.domains.imaginations.models import Imagination
from app.domains.policy.models import PolicySetting, UserTier
from app.domains.users.models import User
from app.shared.time import kst_day_start, now_utc

SAFE_DEFAULTS: dict[str, Any] = {
    "limit.title_chars": 40,
    "limit.body_chars": 500,
    "limit.desire_chars": 100,
    "limit.quote_chars": 300,
    "limit.comment_chars": 300,
    "limit.post_daily": 30,
    "limit.shake_daily": 10,
    "limit.image_count": 1,
    "limit.image_mb": 5,
    "perm.can_post": True,
    "perm.can_comment": True,
    "perm.can_wave": True,
    "perm.can_quote": True,
    "perm.can_shake": True,
}


@dataclass
class EffectivePolicy:
    values: dict[str, Any] = field(default_factory=dict)
    posts_today: int = 0
    shakes_today: int = 0  # 오늘 게시된 Shake it 수 (shake_attempts.status=published)

    def limit(self, key: str) -> int:
        return int(self.values[f"limit.{key}"])

    def can(self, key: str) -> bool:
        return bool(self.values[f"perm.can_{key}"])

    @property
    def posts_remaining(self) -> int:
        return max(0, self.limit("post_daily") - self.posts_today)

    @property
    def shakes_remaining(self) -> int:
        return max(0, self.limit("shake_daily") - self.shakes_today)


def _tier_id_for(db: Session, user: User) -> int | None:
    if user.tier_id is not None:
        return user.tier_id
    return db.scalar(select(UserTier.id).where(UserTier.is_default.is_(True)).limit(1))


def resolve_values(db: Session, user: User | None) -> dict[str, Any]:
    """key 마다 최종 값을 고른다. user 가 없으면(비로그인) 전체 기본값."""
    values = dict(SAFE_DEFAULTS)
    conditions = [PolicySetting.scope == "global"]
    tier_id = None
    if user is not None:
        tier_id = _tier_id_for(db, user)
        if tier_id is not None:
            conditions.append((PolicySetting.scope == "tier") & (PolicySetting.tier_id == tier_id))
        conditions.append(
            (PolicySetting.scope == "user")
            & (PolicySetting.user_id == user.id)
            & (or_(PolicySetting.expires_at.is_(None), PolicySetting.expires_at > now_utc()))
        )
    rows = db.scalars(select(PolicySetting).where(or_(*conditions))).all()
    rank = {"global": 0, "tier": 1, "user": 2}
    for row in sorted(rows, key=lambda r: rank[r.scope]):  # 뒤(우선순위 높은 것)가 덮어쓴다
        values[row.key] = row.value
    return values


def get_effective_policy(db: Session, user: User | None) -> EffectivePolicy:
    policy = EffectivePolicy(values=resolve_values(db, user))
    if user is not None:
        policy.posts_today = (
            db.scalar(
                select(func.count())
                .select_from(Imagination)
                .where(
                    Imagination.author_id == user.id,
                    Imagination.kind.in_(("original", "quote")),  # 혼합·댓글은 세지 않는다
                    Imagination.created_at >= kst_day_start(),
                )
            )
            or 0
        )
        from app.domains.shake.models import ShakeAttempt  # 순환 import 를 피해 여기서

        policy.shakes_today = (
            db.scalar(
                select(func.count())
                .select_from(ShakeAttempt)
                .where(
                    ShakeAttempt.user_id == user.id,
                    ShakeAttempt.status == "published",  # 실패는 세지 않는다 (F8)
                    ShakeAttempt.created_at >= kst_day_start(),
                )
            )
            or 0
        )
    return policy
