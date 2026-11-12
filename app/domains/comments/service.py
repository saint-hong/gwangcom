"""댓글 · 답글 (기획안 v9 F5 → v10 반영목록 3장: X 구조, 댓글 = 게시글).

- 상상에 달면 댓글, 댓글에 달면 답글. 답글은 지금 1단계까지라 답글에 달아도 같은 댓글 줄로 모은다.
- 맨 위 댓글은 최신순만(정렬 선택 없음), 답글은 대화처럼 오래된 순.
- 답글이 남아 있는 삭제된 댓글은 자리를 남긴다 ("삭제된 댓글이에요").
"""

from sqlalchemy import exists, or_, select
from sqlalchemy.orm import Session, aliased

from app.domains.imaginations import crud as imagination_crud
from app.domains.imaginations.models import Imagination
from app.domains.imaginations.schemas import CommentsOut, CommentThreadOut, ImaginationOut
from app.domains.imaginations.service import bump, check_len, clean, present
from app.domains.notifications.service import notify
from app.domains.policy.service import get_effective_policy
from app.domains.users.models import User
from app.shared.cursor import decode_cursor, encode_cursor
from app.shared.errors import bad_request, forbidden, not_found

COMMENTS_PAGE_SIZE = 20


def create(db: Session, user: User, target_id: int, body: str) -> ImaginationOut:
    target = imagination_crud.get_visible(db, target_id)
    if target is None:
        raise not_found("댓글을 달 글을 찾을 수 없어요. 삭제됐을 수 있어요.")
    policy = get_effective_policy(db, user)
    if not policy.can("comment"):
        raise forbidden("not_allowed", "지금은 댓글을 쓸 수 없어요.")
    text = clean(body)
    if text is None:
        raise bad_request("body_required", "댓글 내용을 적어 주세요.")
    check_len("댓글", text, policy.limit("comment_chars"))

    if target.kind == "comment":
        root_id = target.root_id
        # 답글은 1단계까지: 답글에 달면 그 답글이 속한 맨 위 댓글 아래로 모은다
        parent_id = target.id if target.parent_id == target.root_id else target.parent_id
    else:
        root_id = parent_id = target.id

    item = Imagination(
        author_id=user.id,
        kind="comment",
        body=text,
        domain_id=target.domain_id,
        parent_id=parent_id,
        root_id=root_id,
    )
    db.add(item)
    bump(db, root_id, "comment_count", 1)
    if parent_id != root_id:
        bump(db, parent_id, "comment_count", 1)
    db.flush()
    # 알림: 답글이면 단 대상(댓글) 작성자에게 reply, 상상 작성자에게는 comment (같은 사람이면 한 번)
    root_author = target.author_id if target.kind != "comment" else _author_of(db, root_id)
    if target.kind == "comment":
        notify(db, user_id=target.author_id, actor_id=user.id, type="reply", imagination_id=item.id)
    if root_author != target.author_id or target.kind != "comment":
        notify(db, user_id=root_author, actor_id=user.id, type="comment", imagination_id=item.id)
    db.commit()
    db.refresh(item)
    return present(db, [item], user, policy)[0]


def _author_of(db: Session, item_id: int) -> int:
    return db.scalar(select(Imagination.author_id).where(Imagination.id == item_id))


def list_threads(
    db: Session, user: User | None, imagination_id: int, cursor: str | None
) -> CommentsOut:
    root = imagination_crud.get_visible(db, imagination_id)
    if root is None or root.kind == "comment":
        raise not_found("상상을 찾을 수 없어요.")

    reply = aliased(Imagination)
    has_visible_reply = exists().where(reply.parent_id == Imagination.id, reply.status == "visible")
    q = select(Imagination).where(
        Imagination.kind == "comment",
        Imagination.root_id == root.id,
        Imagination.parent_id == root.id,
        or_(
            Imagination.status == "visible",
            (Imagination.status == "deleted") & has_visible_reply,
        ),
    )
    if cursor:
        t, i = decode_cursor(cursor)
        q = q.where(
            or_(Imagination.created_at < t, (Imagination.created_at == t) & (Imagination.id < i))
        )
    q = q.order_by(Imagination.created_at.desc(), Imagination.id.desc()).limit(
        COMMENTS_PAGE_SIZE + 1
    )
    tops = list(db.scalars(q).unique())
    has_more = len(tops) > COMMENTS_PAGE_SIZE
    tops = tops[:COMMENTS_PAGE_SIZE]

    replies: list[Imagination] = []
    if tops:
        replies = list(
            db.scalars(
                select(Imagination)
                .where(
                    Imagination.parent_id.in_([t.id for t in tops]),
                    Imagination.status == "visible",
                )
                .order_by(Imagination.created_at, Imagination.id)
            ).unique()
        )

    policy = get_effective_policy(db, user)
    visible_tops = [t for t in tops if t.status == "visible"]
    out = {o.id: o for o in present(db, visible_tops + replies, user, policy)}
    threads = [
        CommentThreadOut(
            id=t.id,
            comment=out.get(t.id) if t.status == "visible" else None,
            replies=[out[r.id] for r in replies if r.parent_id == t.id],
        )
        for t in tops
    ]
    next_cursor = encode_cursor(tops[-1].created_at, tops[-1].id) if has_more and tops else None
    return CommentsOut(items=threads, next_cursor=next_cursor)
