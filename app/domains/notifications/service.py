"""알림 (기획안 v9 F15, v10 반영목록 7장 — X 알림 구조).

- 만들기: 반응·댓글·인용·팔로우가 일어난 곳(service)에서 notify() 를 부른다. 나에게는 보내지 않는다.
  Thunder · Wave · 팔로우는 껐다 켜도 같은 알림을 또 만들지 않는다.
- 보기: [전체 | 댓글] 탭, 최신순, 20개씩. 대상 글이 지워진 알림은 보이지 않는다.
- 실시간 푸시 없이 화면이 60초마다 안 읽은 수를 묻는다.
"""

from typing import Literal

from sqlalchemy import exists, func, or_, select, update
from sqlalchemy.orm import Session

from app.domains.imaginations.models import Imagination
from app.domains.imaginations.service import present
from app.domains.notifications.models import Notification
from app.domains.notifications.schemas import NotificationOut, NotificationsOut
from app.domains.users.models import User
from app.domains.users.schemas import author_out
from app.shared.cursor import decode_cursor, encode_cursor
from app.shared.time import now_utc

NotificationTab = Literal["all", "comments"]
PAGE_SIZE = 20
ONCE_TYPES = {"thunder", "wave", "follow"}  # 껐다 켜도 한 번만
COMMENT_TYPES = ("comment", "reply")


def notify(
    db: Session, *, user_id: int, actor_id: int, type: str, imagination_id: int | None = None
) -> None:
    """알림 하나를 쌓는다 (commit 은 부른 쪽에서)."""
    if user_id == actor_id:
        return
    if type in ONCE_TYPES:
        same = select(Notification.id).where(
            Notification.user_id == user_id,
            Notification.actor_id == actor_id,
            Notification.type == type,
            Notification.imagination_id.is_(None)
            if imagination_id is None
            else Notification.imagination_id == imagination_id,
        )
        if db.scalar(same.limit(1)) is not None:
            return
    db.add(
        Notification(user_id=user_id, actor_id=actor_id, type=type, imagination_id=imagination_id)
    )


def _visible_target():
    """대상 글이 없거나(팔로우) 아직 보이는 알림만."""
    return or_(
        Notification.imagination_id.is_(None),
        exists().where(
            Imagination.id == Notification.imagination_id, Imagination.status == "visible"
        ),
    )


def list_for(db: Session, user: User, tab: NotificationTab, cursor: str | None) -> NotificationsOut:
    q = select(Notification).where(Notification.user_id == user.id, _visible_target())
    if tab == "comments":
        q = q.where(Notification.type.in_(COMMENT_TYPES))
    if cursor:
        t, i = decode_cursor(cursor)
        q = q.where(
            or_(Notification.created_at < t, (Notification.created_at == t) & (Notification.id < i))
        )
    rows = list(
        db.scalars(
            q.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(PAGE_SIZE + 1)
        )
    )
    has_more = len(rows) > PAGE_SIZE
    rows = rows[:PAGE_SIZE]

    actors = {
        u.id: u
        for u in db.scalars(
            select(User).where(User.id.in_({r.actor_id for r in rows if r.actor_id}))
        )
    }
    item_ids = {r.imagination_id for r in rows if r.imagination_id}
    items = (
        {
            o.id: o
            for o in present(
                db,
                list(db.scalars(select(Imagination).where(Imagination.id.in_(item_ids))).unique()),
                user,
            )
        }
        if item_ids
        else {}
    )
    out = [
        NotificationOut(
            id=r.id,
            type=r.type,  # type: ignore[arg-type]
            actor=author_out(actors[r.actor_id]) if r.actor_id in actors else None,
            item=items.get(r.imagination_id) if r.imagination_id else None,
            read=r.read_at is not None,
            created_at=r.created_at,
        )
        for r in rows
    ]
    next_cursor = encode_cursor(rows[-1].created_at, rows[-1].id) if has_more and rows else None
    return NotificationsOut(items=out, next_cursor=next_cursor)


def unread_count(db: Session, user: User) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(Notification)
            .where(
                Notification.user_id == user.id, Notification.read_at.is_(None), _visible_target()
            )
        )
        or 0
    )


def mark_all_read(db: Session, user: User) -> None:
    db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
        .values(read_at=now_utc())
    )
    db.commit()
