"""운영자 서비스 — 기본 정책 · 등급 · 사용자 관리 (Sprint 6-B, 기획안 v11 F20 · A5 · A6).

- 값은 policy_settings 에 둔다: 전체 기본값(global) → 등급(tier) → 개인 예외(user). 계산은 policy.service 가 한다
- 바꿀 때마다 policy_change_logs 에 누가 · 언제 · 누구의 · 무엇을 · 어떤 값에서 어떤 값으로를 남긴다
- 등급 초안: 기본 / 활발한 Dreamer / 테스트 그룹 (처음 값은 모두 전체 기본값을 따른다)
"""

from datetime import datetime
from typing import Any, Literal

from sqlalchemy import case, delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.domains.admin.schemas import (
    ActivityOut,
    AdminUserDetail,
    AdminUserRow,
    AdminUsersOut,
    ChangeLogOut,
    LimitRow,
    PolicyKeyOut,
    PolicyOut,
    TierOut,
)
from app.domains.imaginations.models import Imagination
from app.domains.policy.models import PolicyChangeLog, PolicySetting, UserTier
from app.domains.policy.service import (
    POLICY_KEY_MAP,
    POLICY_KEYS,
    SAFE_DEFAULTS,
    _tier_id_for,
    check_value,
    get_effective_policy,
    resolve_with_source,
)
from app.domains.users.models import User
from app.shared.errors import bad_request, conflict, not_found
from app.shared.time import now_utc

PAGE_SIZES = (20, 50, 100)
LOG_LIMIT = 50
EXTRA_LABELS = {"user.tier": "등급", "user.role": "역할"}
UserSort = Literal["id", "nickname", "email", "role", "tier", "posts", "created"]


def _err(exc: ValueError):
    return bad_request("invalid_value", str(exc))


# ---------------------------------------------------------------- 공통


def _keys() -> list[PolicyKeyOut]:
    return [
        PolicyKeyOut(
            key=k.key, label=k.label, group=k.group, kind=k.kind, unit=k.unit, min=k.min, max=k.max
        )  # type: ignore[arg-type]
        for k in POLICY_KEYS
    ]


def _tiers(db: Session) -> list[TierOut]:
    default_id = db.scalar(select(UserTier.id).where(UserTier.is_default.is_(True)).limit(1))
    counts: dict[int | None, int] = {}
    for tid, n in db.execute(select(User.tier_id, func.count()).group_by(User.tier_id)):
        key = default_id if tid is None else tid  # 등급이 비면 기본 등급
        counts[key] = counts.get(key, 0) + n
    return [
        TierOut(
            id=t.id,
            name=t.name,
            description=t.description,
            is_default=t.is_default,
            user_count=counts.get(t.id, 0),
        )
        for t in db.scalars(select(UserTier).order_by(UserTier.is_default.desc(), UserTier.id))
    ]


def _log(
    db: Session,
    admin: User,
    *,
    scope: str,
    key: str,
    old: Any,
    new: Any,
    tier_id: int | None = None,
    user_id: int | None = None,
    expires_at: datetime | None = None,
) -> None:
    db.add(
        PolicyChangeLog(
            admin_id=admin.id,
            target_scope=scope,
            tier_id=tier_id,
            user_id=user_id,
            key=key,
            old_value=old,
            new_value=new,
            expires_at=expires_at,
        )
    )


def _logs(db: Session, *conditions) -> list[ChangeLogOut]:
    admin_t = User.__table__.alias("log_admin")
    user_t = User.__table__.alias("log_user")
    rows = db.execute(
        select(PolicyChangeLog, admin_t.c.nickname, user_t.c.nickname, UserTier.name)
        .outerjoin(admin_t, admin_t.c.id == PolicyChangeLog.admin_id)
        .outerjoin(user_t, user_t.c.id == PolicyChangeLog.user_id)
        .outerjoin(UserTier, UserTier.id == PolicyChangeLog.tier_id)
        .where(*conditions)
        .order_by(PolicyChangeLog.created_at.desc(), PolicyChangeLog.id.desc())
        .limit(LOG_LIMIT)
    ).all()
    out = []
    for log, admin_nick, user_nick, tier_name in rows:
        spec = POLICY_KEY_MAP.get(log.key)
        out.append(
            ChangeLogOut(
                id=log.id,
                admin=admin_nick,
                target_scope=log.target_scope,  # type: ignore[arg-type]
                tier=tier_name,
                user=user_nick,
                key=log.key,
                label=spec.label if spec else EXTRA_LABELS.get(log.key, log.key),
                old_value=log.old_value,
                new_value=log.new_value,
                expires_at=log.expires_at,
                at=log.created_at,
            )
        )
    return out


def _setting(db: Session, scope: str, key: str, *, tier_id=None, user_id=None):
    q = select(PolicySetting).where(PolicySetting.scope == scope, PolicySetting.key == key)
    q = q.where(
        PolicySetting.tier_id.is_(None) if tier_id is None else PolicySetting.tier_id == tier_id
    )
    q = q.where(
        PolicySetting.user_id.is_(None) if user_id is None else PolicySetting.user_id == user_id
    )
    return db.scalar(q)


# ---------------------------------------------------------------- A6 기본 정책 · 등급


def policy_view(db: Session) -> PolicyOut:
    global_values = dict(SAFE_DEFAULTS)
    tier_values: dict[int, dict[str, Any]] = {}
    for row in db.scalars(select(PolicySetting).where(PolicySetting.scope.in_(("global", "tier")))):
        if row.key not in POLICY_KEY_MAP:
            continue
        if row.scope == "global":
            global_values[row.key] = row.value
        else:
            tier_values.setdefault(row.tier_id, {})[row.key] = row.value  # type: ignore[index]
    return PolicyOut(
        keys=_keys(),
        global_values=global_values,
        tier_values=tier_values,
        tiers=_tiers(db),
        logs=_logs(db, PolicyChangeLog.target_scope.in_(("global", "tier"))),
    )


def set_policy(
    db: Session, admin: User, scope: str, tier_id: int | None, key: str, value: Any
) -> PolicyOut:
    """전체 기본값 또는 등급 값을 바꾼다. 등급 값에 null 을 주면 지우고 전체 기본값을 따른다."""
    if key not in POLICY_KEY_MAP:
        raise bad_request("invalid_key", "없는 항목이에요.")
    if scope == "global":
        if value is None:
            raise bad_request("invalid_value", "전체 기본값은 비울 수 없어요.")
        tier_id = None
    elif tier_id is None or db.get(UserTier, tier_id) is None:
        raise not_found("등급을 찾을 수 없어요.")
    if value is not None:
        try:
            value = check_value(key, value)
        except ValueError as exc:
            raise _err(exc) from exc

    row = _setting(db, scope, key, tier_id=tier_id)
    old = row.value if row is not None else (SAFE_DEFAULTS[key] if scope == "global" else None)
    if old == value and (row is not None or value is None):
        return policy_view(db)
    if value is None:
        if row is not None:
            db.delete(row)
    elif row is None:
        db.add(
            PolicySetting(scope=scope, tier_id=tier_id, key=key, value=value, updated_by=admin.id)
        )
    else:
        row.value = value
        row.updated_by = admin.id
    _log(db, admin, scope=scope, key=key, old=old, new=value, tier_id=tier_id)
    db.commit()
    return policy_view(db)


def create_tier(db: Session, admin: User, name: str, description: str | None) -> PolicyOut:
    db.add(UserTier(name=name.strip(), description=(description or "").strip() or None))
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise conflict("tier_exists", "같은 이름의 등급이 있어요.") from exc
    return policy_view(db)


def update_tier(
    db: Session,
    admin: User,
    tier_id: int,
    *,
    name: str | None,
    description: str | None,
    is_default: bool | None,
) -> PolicyOut:
    tier = db.get(UserTier, tier_id)
    if tier is None:
        raise not_found("등급을 찾을 수 없어요.")
    if name is not None:
        tier.name = name.strip()
    if description is not None:
        tier.description = description.strip() or None
    if is_default is True and not tier.is_default:
        for t in db.scalars(select(UserTier).where(UserTier.is_default.is_(True))):
            t.is_default = False
        tier.is_default = True
    elif is_default is False and tier.is_default:
        raise bad_request(
            "need_default", "기본 등급은 하나 있어야 해요. 다른 등급을 기본으로 정해 주세요."
        )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise conflict("tier_exists", "같은 이름의 등급이 있어요.") from exc
    return policy_view(db)


def delete_tier(db: Session, admin: User, tier_id: int) -> PolicyOut:
    """기본 등급은 지울 수 없다. 이 등급이던 사용자는 기본 등급으로 돌아간다 (tier_id 가 비워짐)."""
    tier = db.get(UserTier, tier_id)
    if tier is None:
        raise not_found("등급을 찾을 수 없어요.")
    if tier.is_default:
        raise bad_request("default_tier", "기본 등급은 지울 수 없어요.")
    db.execute(
        delete(PolicySetting).where(PolicySetting.scope == "tier", PolicySetting.tier_id == tier.id)
    )
    db.delete(tier)
    db.commit()
    return policy_view(db)


# ---------------------------------------------------------------- A5 사용자 관리


def _posts_sub():
    return (
        select(Imagination.author_id, func.count().label("n"))
        .where(Imagination.status == "visible", Imagination.kind.in_(("original", "quote")))
        .group_by(Imagination.author_id)
        .subquery()
    )


def _exceptions_sub():
    return (
        select(PolicySetting.user_id, func.count().label("n"))
        .where(
            PolicySetting.scope == "user",
            or_(PolicySetting.expires_at.is_(None), PolicySetting.expires_at > now_utc()),
        )
        .group_by(PolicySetting.user_id)
        .subquery()
    )


def list_users(
    db: Session,
    *,
    q: str | None = None,
    role: str = "all",
    tier_id: int | None = None,
    page: int = 1,
    size: int = 20,
    sort: str = "created",
    order: str = "desc",
) -> AdminUsersOut:
    if size not in PAGE_SIZES:
        raise bad_request("invalid_size", "한 페이지에 20 · 50 · 100개씩 볼 수 있어요.")
    default_id = db.scalar(select(UserTier.id).where(UserTier.is_default.is_(True)).limit(1))
    tier_of = func.coalesce(User.tier_id, default_id)
    posts, exceptions = _posts_sub(), _exceptions_sub()
    query = (
        select(
            User,
            UserTier.name,
            func.coalesce(posts.c.n, 0).label("posts"),
            func.coalesce(exceptions.c.n, 0),
        )
        .outerjoin(UserTier, UserTier.id == tier_of)
        .outerjoin(posts, posts.c.author_id == User.id)
        .outerjoin(exceptions, exceptions.c.user_id == User.id)
    )
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.where(or_(User.nickname.ilike(like), User.email.ilike(like)))
    if role != "all":
        query = query.where(User.role == role)
    if tier_id is not None:
        query = query.where(tier_of == tier_id)
    col = {
        "id": User.id,
        "nickname": User.nickname,
        "email": User.email,
        "role": case({"admin": 0, "user": 1}, value=User.role, else_=9),
        "tier": UserTier.name,
        "posts": func.coalesce(posts.c.n, 0),
        "created": User.created_at,
    }[sort]
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    page = min(max(1, page), max(1, -(-total // size)))
    rows = db.execute(
        query.order_by(col.asc() if order == "asc" else col.desc(), User.id.desc())
        .offset((page - 1) * size)
        .limit(size)
    ).all()
    return AdminUsersOut(
        items=[_user_row(u, tier, p, e) for u, tier, p, e in rows],
        total=total,
        page=page,
        size=size,
    )


def _user_row(u: User, tier: str | None, posts: int, exceptions: int) -> AdminUserRow:
    return AdminUserRow(
        id=u.id,
        nickname=u.nickname,
        email=u.email,
        avatar_url=u.avatar_url,
        role=u.role,  # type: ignore[arg-type]
        tier=tier,
        posts=posts,
        exceptions=exceptions,
        created_at=u.created_at,
    )


def _get_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise not_found("사용자를 찾을 수 없어요.")
    return user


def user_detail(db: Session, user_id: int) -> AdminUserDetail:
    user = _get_user(db, user_id)
    tier_id = _tier_id_for(db, user)
    tier = db.get(UserTier, tier_id) if tier_id else None

    def count(*cond) -> int:
        return db.scalar(select(func.count()).select_from(Imagination).where(*cond)) or 0

    mine = (Imagination.author_id == user.id, Imagination.status == "visible")
    policy = get_effective_policy(db, user)
    activity = ActivityOut(
        posts=count(*mine, Imagination.kind.in_(("original", "quote"))),
        blends=count(*mine, Imagination.kind == "blend"),
        comments=count(*mine, Imagination.kind == "comment"),
        thunders_received=db.scalar(
            select(func.coalesce(func.sum(Imagination.thunder_count), 0)).where(
                *mine, Imagination.kind != "comment"
            )
        )
        or 0,
        posts_today=policy.posts_today,
        shakes_today=policy.shakes_today,
    )
    resolved = resolve_with_source(db, user)
    exceptions = {
        r.key: r
        for r in db.scalars(
            select(PolicySetting).where(
                PolicySetting.scope == "user", PolicySetting.user_id == user.id
            )
        )
    }
    now = now_utc()
    limits = []
    for spec in POLICY_KEYS:
        r = resolved[spec.key]
        ex = exceptions.get(spec.key)
        limits.append(
            LimitRow(
                key=spec.key,
                value=r.value,
                source=r.source,  # type: ignore[arg-type]
                exception=ex.value if ex else None,
                exception_expires_at=ex.expires_at if ex else None,
                exception_expired=bool(ex and ex.expires_at and ex.expires_at <= now),
            )
        )
    posts = activity.posts
    n_exc = sum(1 for row in limits if row.exception is not None and not row.exception_expired)
    return AdminUserDetail(
        user=_user_row(user, tier.name if tier else None, posts, n_exc),
        tier_id=tier_id,
        activity=activity,
        keys=_keys(),
        limits=limits,
        tiers=_tiers(db),
        logs=_logs(db, PolicyChangeLog.user_id == user.id),
    )


def update_user(
    db: Session, admin: User, user_id: int, *, role: str | None, tier_id: int | None, set_tier: bool
) -> AdminUserDetail:
    """역할 · 등급 바꾸기. 자기 자신의 운영자 역할은 뺄 수 없다 (운영자가 아무도 없게 되는 것을 막음)."""
    user = _get_user(db, user_id)
    if role is not None and role != user.role:
        if user.id == admin.id:
            raise bad_request("self_role", "내 운영자 역할은 여기서 바꿀 수 없어요.")
        _log(db, admin, scope="user", key="user.role", old=user.role, new=role, user_id=user.id)
        user.role = role
    if set_tier:
        if tier_id is not None and db.get(UserTier, tier_id) is None:
            raise not_found("등급을 찾을 수 없어요.")
        before = _tier_id_for(db, user)
        default_id = db.scalar(select(UserTier.id).where(UserTier.is_default.is_(True)).limit(1))
        after = tier_id if tier_id is not None else default_id
        if before != after:
            names = dict(db.execute(select(UserTier.id, UserTier.name)).all())
            _log(
                db,
                admin,
                scope="user",
                key="user.tier",
                old=names.get(before),
                new=names.get(after),
                user_id=user.id,
            )
        user.tier_id = None if tier_id == default_id else tier_id
    db.commit()
    return user_detail(db, user.id)


def set_user_exception(
    db: Session,
    admin: User,
    user_id: int,
    key: str,
    value: Any,
    expires_at: datetime | None,
) -> AdminUserDetail:
    """개인 예외 (이 사용자에게만 다른 값). 만료일이 지나면 등급 · 전체 기본값을 따른다."""
    user = _get_user(db, user_id)
    try:
        value = check_value(key, value)
    except ValueError as exc:
        raise _err(exc) from exc
    if expires_at is not None and expires_at <= now_utc():
        raise bad_request("invalid_expires", "만료일은 지금보다 뒤로 정해 주세요.")
    row = _setting(db, "user", key, user_id=user.id)
    old = row.value if row else None
    if row is None:
        db.add(
            PolicySetting(
                scope="user",
                user_id=user.id,
                key=key,
                value=value,
                expires_at=expires_at,
                updated_by=admin.id,
            )
        )
    else:
        row.value, row.expires_at, row.updated_by = value, expires_at, admin.id
    _log(
        db, admin, scope="user", key=key, old=old, new=value, user_id=user.id, expires_at=expires_at
    )
    db.commit()
    return user_detail(db, user.id)


def clear_user_exception(db: Session, admin: User, user_id: int, key: str) -> AdminUserDetail:
    user = _get_user(db, user_id)
    if key not in POLICY_KEY_MAP:
        raise bad_request("invalid_key", "없는 항목이에요.")
    row = _setting(db, "user", key, user_id=user.id)
    if row is not None:
        _log(db, admin, scope="user", key=key, old=row.value, new=None, user_id=user.id)
        db.delete(row)
        db.commit()
    return user_detail(db, user.id)
