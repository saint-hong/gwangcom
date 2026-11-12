"""이번 주 질문 서비스 (Sprint 6-C, 기획안 v11 F13 · A3).

- 지금 질문: 켜져 있고 기간 안인 것 중 가장 늦게 시작한 것 → 오른쪽 컬럼 블록 · 글쓰기 위 질문 카드
- 질문에서 들어와 쓴 상상은 prompt_id 가 붙는다 (지금 답할 수 있는 질문만 — 끝난 질문 주소로 와도 붙이지 않음)
- 답한 상상 = 보이는 원본 상상 (인용 · 혼합 · 댓글은 질문에 답하지 않는다)
"""

from datetime import datetime

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.orm import Session

from app.domains.imaginations.models import Imagination
from app.domains.prompts.models import Prompt
from app.domains.prompts.schemas import AdminPromptOut, AdminPromptsOut, PromptOut
from app.domains.users.models import User
from app.shared.errors import bad_request, not_found
from app.shared.time import now_utc

PAGE_SIZES = (20, 50, 100)


def is_open(p: Prompt, now: datetime | None = None) -> bool:
    now = now or now_utc()
    return p.is_active and p.starts_at <= now and (p.ends_at is None or p.ends_at > now)


def status_of(p: Prompt, now: datetime | None = None) -> str:
    now = now or now_utc()
    if not p.is_active:
        return "off"
    if p.starts_at > now:
        return "scheduled"
    if p.ends_at is not None and p.ends_at <= now:
        return "ended"
    return "open"


def _answers_sub():
    return (
        select(Imagination.prompt_id, func.count().label("n"))
        .where(
            Imagination.prompt_id.is_not(None),
            Imagination.status == "visible",
            Imagination.kind == "original",
        )
        .group_by(Imagination.prompt_id)
        .subquery()
    )


def _answer_count(db: Session, prompt_id: int) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(Imagination)
            .where(
                Imagination.prompt_id == prompt_id,
                Imagination.status == "visible",
                Imagination.kind == "original",
            )
        )
        or 0
    )


def _out(db: Session, p: Prompt) -> PromptOut:
    return PromptOut(
        id=p.id,
        title=p.title,
        body=p.body,
        starts_at=p.starts_at,
        ends_at=p.ends_at,
        open=is_open(p),
        answer_count=_answer_count(db, p.id),
    )


def current(db: Session) -> PromptOut | None:
    now = now_utc()
    p = db.scalar(
        select(Prompt)
        .where(
            Prompt.is_active.is_(True),
            Prompt.starts_at <= now,
            or_(Prompt.ends_at.is_(None), Prompt.ends_at > now),
        )
        .order_by(Prompt.starts_at.desc(), Prompt.id.desc())
        .limit(1)
    )
    return _out(db, p) if p else None


def get_public(db: Session, prompt_id: int) -> PromptOut:
    """글쓰기 화면에서 ?prompt= 로 들어올 때. 꺼진 · 예정 질문은 보이지 않는다 (끝난 질문은 open=false 로)."""
    p = db.get(Prompt, prompt_id)
    if p is None or not p.is_active or p.starts_at > now_utc():
        raise not_found("질문을 찾을 수 없어요.")
    return _out(db, p)


def check_answerable(db: Session, prompt_id: int | None) -> int | None:
    """상상 쓰기 때: 지금 답할 수 있는 질문이면 그 id, 아니면 400."""
    if prompt_id is None:
        return None
    p = db.get(Prompt, prompt_id)
    if p is None or not is_open(p):
        raise bad_request("prompt_closed", "이 질문은 지금 답할 수 없어요. 질문 없이 올려 주세요.")
    return p.id


# ---------------------------------------------------------------- 운영자 A3


def _admin_row(p: Prompt, answers: int, creator: str | None) -> AdminPromptOut:
    return AdminPromptOut(
        id=p.id,
        title=p.title,
        body=p.body,
        starts_at=p.starts_at,
        ends_at=p.ends_at,
        is_active=p.is_active,
        status=status_of(p),  # type: ignore[arg-type]
        answer_count=answers,
        created_by=creator,
        created_at=p.created_at,
    )


def admin_list(
    db: Session,
    *,
    status: str = "all",
    q: str | None = None,
    sort: str = "starts",
    order: str = "desc",
    page: int = 1,
    size: int = 20,
) -> AdminPromptsOut:
    if size not in PAGE_SIZES:
        raise bad_request("invalid_size", "한 페이지에 20 · 50 · 100개씩 볼 수 있어요.")
    now = now_utc()
    answers = _answers_sub()
    n = func.coalesce(answers.c.n, 0)
    status_expr = case(
        (Prompt.is_active.is_(False), 3),
        (Prompt.starts_at > now, 1),
        (and_(Prompt.ends_at.is_not(None), Prompt.ends_at <= now), 2),
        else_=0,
    )  # 0 진행 중 · 1 예정 · 2 끝 · 3 꺼짐
    query = (
        select(Prompt, n, User.nickname)
        .outerjoin(answers, answers.c.prompt_id == Prompt.id)
        .outerjoin(User, User.id == Prompt.created_by)
    )
    if status != "all":
        query = query.where(
            status_expr == {"open": 0, "scheduled": 1, "ended": 2, "off": 3}[status]
        )
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.where(or_(Prompt.title.ilike(like), Prompt.body.ilike(like)))
    col = {
        "id": Prompt.id,
        "title": Prompt.title,
        "starts": Prompt.starts_at,
        "ends": Prompt.ends_at,
        "status": status_expr,
        "answers": n,
        "created": Prompt.created_at,
    }[sort]
    ordered = col.asc().nulls_last() if order == "asc" else col.desc().nulls_last()
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    page = min(max(1, page), max(1, -(-total // size)))
    rows = db.execute(
        query.order_by(ordered, Prompt.id.desc()).offset((page - 1) * size).limit(size)
    ).all()
    return AdminPromptsOut(
        items=[_admin_row(p, a, c) for p, a, c in rows], total=total, page=page, size=size
    )


def _check_period(starts_at: datetime, ends_at: datetime | None) -> None:
    if ends_at is not None and ends_at <= starts_at:
        raise bad_request("invalid_period", "끝나는 때는 시작보다 뒤로 정해 주세요.")


def _admin_one(db: Session, p: Prompt) -> AdminPromptOut:
    creator = (
        db.scalar(select(User.nickname).where(User.id == p.created_by)) if p.created_by else None
    )
    return _admin_row(p, _answer_count(db, p.id), creator)


def create(db: Session, admin: User, data) -> AdminPromptOut:
    _check_period(data.starts_at, data.ends_at)
    p = Prompt(
        title=data.title.strip(),
        body=(data.body or "").strip() or None,
        starts_at=data.starts_at,
        ends_at=data.ends_at,
        is_active=data.is_active,
        created_by=admin.id,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return _admin_one(db, p)


def update(db: Session, prompt_id: int, data, fields: set[str]) -> AdminPromptOut:
    p = db.get(Prompt, prompt_id)
    if p is None:
        raise not_found("질문을 찾을 수 없어요.")
    if "title" in fields and data.title is not None:
        p.title = data.title.strip()
    if "body" in fields:
        p.body = (data.body or "").strip() or None
    if "starts_at" in fields and data.starts_at is not None:
        p.starts_at = data.starts_at
    if "ends_at" in fields:
        p.ends_at = data.ends_at  # null = 끝나는 때 없음
    if "is_active" in fields and data.is_active is not None:
        p.is_active = data.is_active
    _check_period(p.starts_at, p.ends_at)
    db.commit()
    db.refresh(p)
    return _admin_one(db, p)


def delete(db: Session, prompt_id: int) -> None:
    """답한 상상이 있으면 지우지 않는다 (질문형 · 자유 상상 구분이 사라지므로) → 끄기를 쓴다."""
    p = db.get(Prompt, prompt_id)
    if p is None:
        raise not_found("질문을 찾을 수 없어요.")
    if _answer_count(db, p.id) or db.scalar(
        select(func.count()).select_from(Imagination).where(Imagination.prompt_id == p.id)
    ):
        raise bad_request("has_answers", "답한 상상이 있는 질문은 지울 수 없어요. 꺼 두세요.")
    db.delete(p)
    db.commit()
