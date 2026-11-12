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
    "limit.tag_count": 5,  # 작성자가 붙일 수 있는 기술 태그 수 (F2, 5-D)
    "perm.can_post": True,
    "perm.can_comment": True,
    "perm.can_wave": True,
    "perm.can_quote": True,
    "perm.can_shake": True,
}


@dataclass(frozen=True)
class PolicyKey:
    """운영자 화면(A5 · A6)에 보이는 한도 · 권한 항목 하나."""

    key: str
    label: str
    group: str  # 글자 수 · 하루 횟수 · 첨부 · 태그 · 권한
    kind: str  # int | bool
    unit: str = ""
    min: int = 0
    max: int = 0


# 운영자가 바꿀 수 있는 항목 (기획안 v11 F20 표). SAFE_DEFAULTS 와 같은 key 를 같은 순서로 둔다
POLICY_KEYS: list[PolicyKey] = [
    PolicyKey("limit.title_chars", "제목", "글자 수", "int", "자", 1, 200),
    PolicyKey("limit.body_chars", "상상 본문", "글자 수", "int", "자", 10, 5000),
    PolicyKey("limit.desire_chars", "왜 원하나요", "글자 수", "int", "자", 1, 1000),
    PolicyKey("limit.quote_chars", "인용", "글자 수", "int", "자", 1, 2000),
    PolicyKey("limit.comment_chars", "댓글", "글자 수", "int", "자", 1, 2000),
    PolicyKey("limit.post_daily", "상상 쓰기", "하루 횟수", "int", "회", 0, 1000),
    PolicyKey("limit.shake_daily", "Shake it", "하루 횟수", "int", "회", 0, 1000),
    PolicyKey("limit.image_count", "이미지 장수", "첨부", "int", "장", 0, 1),
    PolicyKey("limit.image_mb", "이미지 용량", "첨부", "int", "MB", 1, 20),
    PolicyKey("limit.tag_count", "기술 태그 수", "태그", "int", "개", 0, 20),
    PolicyKey("perm.can_post", "상상하기", "권한", "bool"),
    PolicyKey("perm.can_comment", "댓글", "권한", "bool"),
    PolicyKey("perm.can_wave", "Wave", "권한", "bool"),
    PolicyKey("perm.can_quote", "인용", "권한", "bool"),
    PolicyKey("perm.can_shake", "Shake it", "권한", "bool"),
]
POLICY_KEY_MAP = {k.key: k for k in POLICY_KEYS}


def check_value(key: str, value: Any) -> Any:
    """운영자가 넣은 값을 항목 종류 · 범위에 맞게 검사해 돌려준다. 맞지 않으면 ValueError."""
    spec = POLICY_KEY_MAP.get(key)
    if spec is None:
        raise ValueError("없는 항목이에요.")
    if spec.kind == "bool":
        if not isinstance(value, bool):
            raise ValueError("켜기 · 끄기 값이어야 해요.")
        return value
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError("숫자여야 해요.")
    if not spec.min <= value <= spec.max:
        raise ValueError(f"{spec.label}은(는) {spec.min}~{spec.max}{spec.unit} 사이로 정해 주세요.")
    return value


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


@dataclass
class ResolvedValue:
    value: Any
    source: str  # user(개인 예외) | tier(등급) | global(전체 기본값) | default(코드 안전값)
    expires_at: Any = None  # 개인 예외의 만료일


def resolve_with_source(db: Session, user: User) -> dict[str, ResolvedValue]:
    """운영자 화면용: key 마다 최종 값과 그 값이 어디서 왔는지 (resolve_values 와 같은 순서)."""
    out = {k: ResolvedValue(v, "default") for k, v in SAFE_DEFAULTS.items()}
    tier_id = _tier_id_for(db, user)
    conditions = [PolicySetting.scope == "global"]
    if tier_id is not None:
        conditions.append((PolicySetting.scope == "tier") & (PolicySetting.tier_id == tier_id))
    conditions.append(
        (PolicySetting.scope == "user")
        & (PolicySetting.user_id == user.id)
        & (or_(PolicySetting.expires_at.is_(None), PolicySetting.expires_at > now_utc()))
    )
    rank = {"global": 0, "tier": 1, "user": 2}
    rows = db.scalars(select(PolicySetting).where(or_(*conditions))).all()
    for row in sorted(rows, key=lambda r: rank[r.scope]):
        out[row.key] = ResolvedValue(row.value, row.scope, row.expires_at)
    return out
