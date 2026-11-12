"""Thunder · Wave · 북마크 켜기·끄기 + 서재 (기획안 v9 F4 · F6 · F7, v10 반영목록 2~3장).

상상과 댓글(kind=comment)에 똑같이 동작한다. 켜고 끌 때마다 reaction_events 에 기록한다.
"""

from typing import Literal

from sqlalchemy import delete, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.domains.imaginations import crud as imagination_crud
from app.domains.imaginations.models import Imagination, ImaginationView
from app.domains.imaginations.schemas import FeedOut, ReactionOut
from app.domains.imaginations.service import bump, counts_of, my_states, present
from app.domains.notifications.service import notify
from app.domains.policy.service import get_effective_policy
from app.domains.reactions.models import Bookmark, ReactionEvent, Thunder, Wave
from app.domains.users.models import User
from app.shared.cursor import decode_cursor, encode_cursor
from app.shared.errors import forbidden, not_found

ReactionType = Literal["thunder", "wave", "bookmark"]
LibraryTab = Literal["thunders", "waves", "shakes", "bookmarks", "recent"]

MODELS = {"thunder": Thunder, "wave": Wave, "bookmark": Bookmark}
COUNT_FIELD = {"thunder": "thunder_count", "wave": "wave_count", "bookmark": "bookmark_count"}
LIBRARY_PAGE_SIZE = 20
RECENT_MAX = 100  # 최근 본 상상은 최대 100개 (F7)


def _check(db: Session, user: User, item: Imagination, kind: ReactionType) -> None:
    """버튼을 흐리게 그리는 actions 와 같은 규칙을 요청마다 다시 검사한다."""
    if kind in ("thunder", "wave") and item.author_id == user.id:
        raise forbidden("own_post", "내 글에는 누를 수 없어요.")
    if kind == "wave" and not get_effective_policy(db, user).can("wave"):
        raise forbidden("not_allowed", "지금은 Wave 를 쓸 수 없어요.")


def toggle(
    db: Session,
    user: User,
    item_id: int,
    kind: ReactionType,
    on: bool,
    via_user_id: int | None = None,
) -> ReactionOut:
    item = imagination_crud.get_visible(db, item_id)
    if item is None:
        raise not_found("글을 찾을 수 없어요. 삭제됐을 수 있어요.")
    model = MODELS[kind]
    if on:
        _check(db, user, item, kind)
        values = {"user_id": user.id, "imagination_id": item.id}
        if kind == "wave" and via_user_id and via_user_id != user.id:
            values["via_user_id"] = via_user_id
        changed = db.execute(
            insert(model).values(**values).on_conflict_do_nothing().returning(model.user_id)
        ).first()
    else:
        changed = db.execute(
            delete(model)
            .where(model.user_id == user.id, model.imagination_id == item.id)
            .returning(model.user_id)
        ).first()

    if changed is not None:  # 이미 켜져 있거나 꺼져 있으면 수·기록을 건드리지 않는다
        bump(db, item.id, COUNT_FIELD[kind], 1 if on else -1)
        db.add(ReactionEvent(user_id=user.id, imagination_id=item.id, type=kind, on=on))
        if on and kind in ("thunder", "wave"):  # 북마크는 알리지 않는다
            notify(db, user_id=item.author_id, actor_id=user.id, type=kind, imagination_id=item.id)
    db.commit()
    db.refresh(item)
    return ReactionOut(my=my_states(db, user, [item.id])[item.id], counts=counts_of(item))


def _my_blends(db: Session, user: User, cursor: str | None) -> FeedOut:
    q = select(Imagination).where(
        Imagination.author_id == user.id,
        Imagination.kind == "blend",
        Imagination.status == "visible",
    )
    if cursor:
        t, i = decode_cursor(cursor)
        q = q.where(
            or_(Imagination.created_at < t, (Imagination.created_at == t) & (Imagination.id < i))
        )
    q = q.order_by(Imagination.created_at.desc(), Imagination.id.desc())
    rows = list(db.scalars(q.limit(LIBRARY_PAGE_SIZE + 1)).unique())
    has_more = len(rows) > LIBRARY_PAGE_SIZE
    rows = rows[:LIBRARY_PAGE_SIZE]
    next_cursor = encode_cursor(rows[-1].created_at, rows[-1].id) if has_more and rows else None
    return FeedOut(items=present(db, rows, user), next_cursor=next_cursor)


def library(db: Session, user: User, tab: LibraryTab, cursor: str | None) -> FeedOut:
    """서재 (F7). Thunder = 상상만, Wave · 북마크 = 상상 + 댓글, 최근 본 상상 = 최대 100개. 누른·본 순서.

    Wave 탭(2026-11-10 추가) — 프로필에서 Wave 탭을 빼고 서재로 옮겼다.

    Shake it 탭(2026-11-10 추가) = 내가 섞어 만든 혼합 글(kind=blend) 최신순. 실제 Shake it 은 Sprint 5 라
    지금은 빈 목록이고, Sprint 5 에서 shake_attempts 기록과 함께 채운다.
    """
    if tab == "shakes":
        return _my_blends(db, user, cursor)
    if tab == "recent":
        model, at = ImaginationView, ImaginationView.viewed_at
    else:
        model = {"bookmarks": Bookmark, "waves": Wave, "thunders": Thunder}[tab]
        at = model.created_at

    q = (
        select(Imagination, at)
        .join(model, model.imagination_id == Imagination.id)
        .where(model.user_id == user.id, Imagination.status == "visible")
    )
    if tab in ("thunders", "recent"):  # Thunder 는 욕망 지표라 상상만, Wave · 북마크는 댓글도
        q = q.where(Imagination.kind != "comment")
    if tab == "recent":  # 가장 최근 100개 안에서만 넘긴다
        top = (
            select(ImaginationView.imagination_id)
            .where(ImaginationView.user_id == user.id)
            .order_by(ImaginationView.viewed_at.desc())
            .limit(RECENT_MAX)
        )
        q = q.where(Imagination.id.in_(top))
    if cursor:
        t, i = decode_cursor(cursor)
        q = q.where(or_(at < t, (at == t) & (Imagination.id < i)))
    q = q.order_by(at.desc(), Imagination.id.desc()).limit(LIBRARY_PAGE_SIZE + 1)

    rows = db.execute(q).unique().all()
    has_more = len(rows) > LIBRARY_PAGE_SIZE
    rows = rows[:LIBRARY_PAGE_SIZE]
    next_cursor = encode_cursor(rows[-1][1], rows[-1][0].id) if has_more and rows else None
    return FeedOut(items=present(db, [r[0] for r in rows], user), next_cursor=next_cursor)
