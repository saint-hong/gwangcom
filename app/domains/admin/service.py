"""운영자 서비스 — 게시물 관리 · 숨김 (Sprint 6-A, 기획안 v11 F19 · A4).

숨긴 글(status=hidden)은 피드 · 목록 · 집계에서 빠진다 (보이는 글만 읽는 기존 조회가 그대로 거른다).
작성자 본인과 운영자에게만 상세가 열리고 "운영자가 숨긴 상상이에요"로 보인다. 다시 보이게 할 수 있다.
숨기거나 되돌릴 때 다른 글의 집계 캐시(인용 수 · Shake 수 · 댓글 수)도 맞춘다.
"""

from typing import Literal

from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from app.domains.admin.models import ModerationLog
from app.domains.admin.schemas import AdminItemOut, AdminItemsOut, ModerationOut
from app.domains.imaginations.models import Imagination
from app.domains.imaginations.schemas import DomainRef, ImaginationOut
from app.domains.imaginations.service import adjust_related_counts, counts_of, present_one
from app.domains.users.models import User
from app.domains.users.schemas import author_out
from app.shared.errors import bad_request, not_found

PAGE_SIZES = (20, 50, 100)  # 한 페이지에 볼 수 (기본 20, 2026-11-12 사용자 요청)
StatusFilter = Literal["all", "visible", "hidden"]
KindFilter = Literal["all", "original", "quote", "blend", "comment"]
# 표 정렬 (2026-11-12 사용자 요청: 칸마다 정렬). 같은 값이면 최신순(id 큰 것 먼저)으로 잇는다
SortKey = Literal[
    "id",
    "kind",
    "author",
    "content",
    "thunders",
    "waves",
    "comments",
    "reactions",
    "created",
    "status",
]
SortOrder = Literal["asc", "desc"]


def _sort_column(key: str):
    """정렬 기준 → SQL 식. 종류는 원본 → 인용 → Shake it → 댓글, 상태는 보임 → 숨김 순서를 오름차순으로 본다."""
    if key == "kind":
        return case(
            {"original": 0, "quote": 1, "blend": 2, "comment": 3}, value=Imagination.kind, else_=9
        )
    if key == "status":
        return case({"visible": 0, "hidden": 1}, value=Imagination.status, else_=9)
    if key == "author":
        return User.nickname
    if key == "content":  # 화면에 보이는 제목(제목이 없으면 본문)
        return func.coalesce(Imagination.title, Imagination.body)
    if key == "reactions":  # 반응 합계 = Thunder + Wave + 댓글 (표에 보이는 세 수)
        return Imagination.thunder_count + Imagination.wave_count + Imagination.comment_count
    return {
        "id": Imagination.id,
        "thunders": Imagination.thunder_count,
        "waves": Imagination.wave_count,
        "comments": Imagination.comment_count,
        "created": Imagination.created_at,
    }[key]


def _last_logs(db: Session, ids: list[int]) -> dict[int, ModerationOut]:
    if not ids:
        return {}
    out: dict[int, ModerationOut] = {}
    rows = db.execute(
        select(ModerationLog, User.nickname)
        .outerjoin(User, User.id == ModerationLog.admin_id)
        .where(ModerationLog.imagination_id.in_(ids))
        .order_by(
            ModerationLog.imagination_id, ModerationLog.created_at.desc(), ModerationLog.id.desc()
        )
    )
    for log, nickname in rows:
        out.setdefault(
            log.imagination_id,
            ModerationOut(action=log.action, admin=nickname, reason=log.reason, at=log.created_at),  # type: ignore[arg-type]
        )
    return out


def _row(item: Imagination, log: ModerationOut | None) -> AdminItemOut:
    return AdminItemOut(
        id=item.id,
        kind=item.kind,  # type: ignore[arg-type]
        status=item.status,  # type: ignore[arg-type]
        author=author_out(item.author),
        domain=DomainRef(slug=item.domain.slug, name=item.domain.name),
        display_title=item.display_title,
        body=item.body,
        root_id=item.root_id,
        counts=counts_of(item),
        created_at=item.created_at,
        last_moderation=log,
    )


def list_items(
    db: Session,
    *,
    status: StatusFilter = "all",
    kind: KindFilter = "all",
    q: str | None = None,
    page: int = 1,
    size: int = PAGE_SIZES[0],
    sort: str = "created",
    order: str = "desc",
    prompt_id: int | None = None,
) -> AdminItemsOut:
    """A4 목록: 기본 최신순, 지운 글(deleted)은 빼고. q = 제목 · 본문 · 작성자 닉네임에서 찾는다."""
    query = (
        select(Imagination)
        .join(User, User.id == Imagination.author_id)
        .where(Imagination.status.in_(("visible", "hidden") if status == "all" else (status,)))
    )
    if kind != "all":
        query = query.where(Imagination.kind == kind)
    if prompt_id is not None:  # 이 질문에 답한 상상 (A3 에서 펼칠 때)
        query = query.where(Imagination.prompt_id == prompt_id)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.where(
            or_(
                Imagination.title.ilike(like),
                Imagination.body.ilike(like),
                User.nickname.ilike(like),
            )
        )
    col = _sort_column(sort)
    ordered = col.asc() if order == "asc" else col.desc()
    if size not in PAGE_SIZES:
        raise bad_request("invalid_size", "한 페이지에 20 · 50 · 100개씩 볼 수 있어요.")
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    last = max(1, -(-total // size))
    page = min(max(1, page), last)  # 범위를 넘으면 마지막 페이지
    rows = list(
        db.scalars(
            query.order_by(ordered, Imagination.id.desc()).offset((page - 1) * size).limit(size)
        ).unique()
    )
    logs = _last_logs(db, [r.id for r in rows])
    return AdminItemsOut(
        items=[_row(r, logs.get(r.id)) for r in rows], total=total, page=page, size=size
    )


def moderate(
    db: Session, admin: User, imagination_id: int, status: str, reason: str | None
) -> AdminItemOut:
    """숨기기(hidden) · 다시 보이기(visible). 같은 상태로 바꾸면 아무것도 하지 않고 지금 상태를 돌려준다."""
    item = db.get(Imagination, imagination_id)
    if item is None or item.status == "deleted":
        raise not_found("상상을 찾을 수 없어요. 작성자가 지웠을 수 있어요.")
    if status not in ("visible", "hidden"):
        raise bad_request("invalid_status", "숨기기 또는 다시 보이기만 할 수 있어요.")
    if item.status != status:
        adjust_related_counts(db, item, -1 if status == "hidden" else 1)
        item.status = status
        db.add(
            ModerationLog(
                admin_id=admin.id,
                imagination_id=item.id,
                action="hide" if status == "hidden" else "unhide",
                reason=(reason or "").strip() or None,
            )
        )
        db.commit()
        db.refresh(item)
    return _row(item, _last_logs(db, [item.id]).get(item.id))


def item_detail(db: Session, admin: User, imagination_id: int) -> ImaginationOut:
    """A4 줄을 펼쳤을 때: 분야 · 주제 · 왜 원하나요 · 재료를 담은 상상 응답 (숨긴 글도).

    상세 화면(GET /api/imaginations/{id})과 달리 조회 기록을 남기지 않는다 — 운영자가 훑어본 것이
    "최근 본 상상" · 관심 신호 데이터에 섞이지 않게.
    """
    item = db.get(Imagination, imagination_id)
    if item is None or item.status == "deleted":
        raise not_found("상상을 찾을 수 없어요. 작성자가 지웠을 수 있어요.")
    return present_one(db, item, admin)
