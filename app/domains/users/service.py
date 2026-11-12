"""프로필 · 팔로우 · 추천 Dreamer · 프로필 수정 · 비밀번호 (기획안 v9 F11 · F16 · S14, v10 반영목록 7장)."""

from typing import Literal

from sqlalchemy import delete, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.domains.auth.schemas import check_nickname, check_password
from app.domains.auth.security import hash_password, verify_password
from app.domains.imaginations.models import Imagination
from app.domains.imaginations.schemas import FeedOut
from app.domains.imaginations.service import PUBLIC_KINDS, present
from app.domains.notifications.service import notify
from app.domains.users import crud
from app.domains.users.models import Follow, User
from app.domains.users.schemas import (
    DreamerOut,
    FollowListOut,
    FollowOut,
    FollowUserOut,
    MeOut,
    ProfileCounts,
    ProfileOut,
    author_out,
    me_out,
)
from app.infrastructure.storage.images import save_image
from app.shared.cursor import decode_cursor, encode_cursor
from app.shared.errors import AppError, bad_request, conflict, forbidden, not_found

ProfileTab = Literal["posts", "comments", "quotes"]
FollowTab = Literal["followers", "following"]
PAGE_SIZE = 20
BIO_MAX = 160
PROFILE_IMAGE_MB = 5


def _get(db: Session, nickname: str) -> User:
    user = crud.get_by_nickname(db, nickname)
    if user is None:
        raise not_found("Dreamer 를 찾을 수 없어요. 닉네임이 바뀌었을 수 있어요.")
    return user


def _is_following(db: Session, me: User | None, target_id: int) -> bool:
    if me is None or me.id == target_id:
        return False
    return (
        db.scalar(
            select(Follow.follower_id).where(
                Follow.follower_id == me.id, Follow.followee_id == target_id
            )
        )
        is not None
    )


def _followers(db: Session, user_id: int) -> int:
    return (
        db.scalar(select(func.count()).select_from(Follow).where(Follow.followee_id == user_id))
        or 0
    )


def profile(db: Session, me: User | None, nickname: str) -> ProfileOut:
    user = _get(db, nickname)
    posts = (
        db.scalar(
            select(func.count())
            .select_from(Imagination)
            .where(
                Imagination.author_id == user.id,
                Imagination.kind != "comment",
                Imagination.status == "visible",
            )
        )
        or 0
    )
    following = (
        db.scalar(select(func.count()).select_from(Follow).where(Follow.follower_id == user.id))
        or 0
    )
    return ProfileOut(
        id=user.id,
        nickname=user.nickname,
        bio=user.bio,
        avatar_url=user.avatar_url,
        cover_url=user.cover_url,
        is_operator=user.is_admin,
        counts=ProfileCounts(posts=posts, following=following, followers=_followers(db, user.id)),
        is_me=me is not None and me.id == user.id,
        following=_is_following(db, me, user.id),
    )


def profile_items(
    db: Session, me: User | None, nickname: str, tab: ProfileTab, cursor: str | None
) -> FeedOut:
    """프로필 탭 [상상 | 댓글 | 인용] (2026-11-10: Wave 탭은 서재로 옮기고 인용 탭으로).

    상상 = 원본 + 혼합(Shake it), 댓글 = 댓글·답글, 인용 = 인용하기로 올린 글.
    """
    user = _get(db, nickname)
    kinds = {"posts": ("original", "blend"), "comments": ("comment",), "quotes": ("quote",)}[tab]
    at = Imagination.created_at
    q = select(Imagination, at).where(
        Imagination.author_id == user.id,
        Imagination.kind.in_(kinds),
        Imagination.status == "visible",
    )
    if cursor:
        t, i = decode_cursor(cursor)
        q = q.where(or_(at < t, (at == t) & (Imagination.id < i)))
    rows = (
        db.execute(q.order_by(at.desc(), Imagination.id.desc()).limit(PAGE_SIZE + 1)).unique().all()
    )
    has_more = len(rows) > PAGE_SIZE
    rows = rows[:PAGE_SIZE]
    items = [r[0] for r in rows]
    next_cursor = encode_cursor(rows[-1][1], rows[-1][0].id) if has_more and rows else None
    return FeedOut(items=present(db, items, me), next_cursor=next_cursor)


def follow(db: Session, me: User, nickname: str, on: bool) -> FollowOut:
    target = _get(db, nickname)
    if target.id == me.id:
        raise forbidden("own_profile", "나 자신은 팔로우할 수 없어요.")
    if on:
        added = db.execute(
            insert(Follow)
            .values(follower_id=me.id, followee_id=target.id)
            .on_conflict_do_nothing()
            .returning(Follow.follower_id)
        ).first()
        if added is not None:
            notify(db, user_id=target.id, actor_id=me.id, type="follow")
    else:
        db.execute(
            delete(Follow).where(Follow.follower_id == me.id, Follow.followee_id == target.id)
        )
    db.commit()
    return FollowOut(following=on, followers=_followers(db, target.id))


def follow_list(
    db: Session, me: User | None, nickname: str, tab: FollowTab, cursor: str | None
) -> FollowListOut:
    """팔로워(이 사람을 팔로우하는 계정) · 팔로잉(이 사람이 팔로우하는 계정), 최근 팔로우 순 20명."""
    user = _get(db, nickname)
    if tab == "followers":
        other, mine = Follow.follower_id, Follow.followee_id
    else:
        other, mine = Follow.followee_id, Follow.follower_id
    q = select(User, Follow.created_at).join(Follow, other == User.id).where(mine == user.id)
    if cursor:
        t, i = decode_cursor(cursor)
        q = q.where(or_(Follow.created_at < t, (Follow.created_at == t) & (User.id < i)))
    rows = db.execute(
        q.order_by(Follow.created_at.desc(), User.id.desc()).limit(PAGE_SIZE + 1)
    ).all()
    has_more = len(rows) > PAGE_SIZE
    rows = rows[:PAGE_SIZE]
    ids = [r[0].id for r in rows]
    i_follow: set[int] = set()
    follow_me: set[int] = set()
    if me is not None and ids:
        i_follow = set(
            db.scalars(
                select(Follow.followee_id).where(
                    Follow.follower_id == me.id, Follow.followee_id.in_(ids)
                )
            )
        )
        follow_me = set(
            db.scalars(
                select(Follow.follower_id).where(
                    Follow.followee_id == me.id, Follow.follower_id.in_(ids)
                )
            )
        )
    items = [
        FollowUserOut(
            author=author_out(u),
            bio=u.bio,
            following=u.id in i_follow,
            follows_me=u.id in follow_me,
        )
        for u, _ in rows
    ]
    next_cursor = encode_cursor(rows[-1][1], rows[-1][0].id) if has_more and rows else None
    return FollowListOut(items=items, next_cursor=next_cursor)


def recommended(db: Session, me: User | None, limit: int = 3) -> list[DreamerOut]:
    """추천 Dreamer: 내가 아직 팔로우하지 않은 사람 중 받은 Thunder 가 많은 순 (v10 반영목록 7장)."""
    thunders = (
        select(Imagination.author_id, func.sum(Imagination.thunder_count).label("t"))
        .where(Imagination.status == "visible", Imagination.kind.in_(PUBLIC_KINDS))
        .group_by(Imagination.author_id)
        .subquery()
    )
    q = select(User).outerjoin(thunders, thunders.c.author_id == User.id)
    if me is not None:
        q = q.where(
            User.id != me.id,
            User.id.not_in(select(Follow.followee_id).where(Follow.follower_id == me.id)),
        )
    q = q.order_by(func.coalesce(thunders.c.t, 0).desc(), User.created_at.desc()).limit(limit)
    return [DreamerOut(author=author_out(u), bio=u.bio, following=False) for u in db.scalars(q)]


def dreamer(db: Session, me: User | None, nickname: str) -> DreamerOut:
    """상세 화면 오른쪽 "이 상상의 Dreamer" 블록."""
    user = _get(db, nickname)
    return DreamerOut(
        author=author_out(user), bio=user.bio, following=_is_following(db, me, user.id)
    )


def update_me(
    db: Session,
    me: User,
    *,
    nickname: str | None,
    bio: str | None,
    avatar: bytes | None,
    cover: bytes | None,
    remove_avatar: bool,
    remove_cover: bool,
) -> MeOut:
    """프로필 수정 팝업 (X): 커버 · 프로필 이미지 · 이름(닉네임) · 자기소개. 개인 정보는 받지 않는다."""
    if nickname is not None and nickname.strip() != me.nickname:
        try:
            name = check_nickname(nickname)
        except ValueError as exc:
            raise bad_request("invalid_nickname", str(exc)) from exc
        other = crud.get_by_nickname(db, name)
        if other is not None and other.id != me.id:
            raise conflict("nickname_taken", "이미 쓰고 있는 닉네임이에요.")
        me.nickname = name
    if bio is not None:
        text = bio.strip()
        if len(text) > BIO_MAX:
            raise bad_request(
                "too_long", f"자기소개는 {BIO_MAX}자까지 쓸 수 있어요. (지금 {len(text)}자)"
            )
        me.bio = text or None
    if remove_avatar:
        me.avatar_url = None
    if avatar:
        me.avatar_url = save_image(avatar, PROFILE_IMAGE_MB)
    if remove_cover:
        me.cover_url = None
    if cover:
        me.cover_url = save_image(cover, PROFILE_IMAGE_MB)
    db.commit()
    db.refresh(me)
    return me_out(me)


def change_password(db: Session, me: User, current: str, new: str) -> None:
    if not verify_password(current, me.password_hash):
        raise AppError(400, "wrong_password", "지금 비밀번호가 맞지 않아요.")
    try:
        check_password(new)
    except ValueError as exc:
        raise bad_request("invalid_password", str(exc)) from exc
    me.password_hash = hash_password(new)
    db.commit()
