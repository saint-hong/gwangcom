"""Observe Note 서비스 — 공개 목록 · 상세, 운영자 만들기 · 고치기 · 지우기 · 이미지 올리기 (Sprint 6-E)."""

from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy import update as sql_update
from sqlalchemy.orm import Session

from app.domains.notes.models import Note, NoteReaction
from app.domains.notes.schemas import (
    AdminNotesOut,
    NoteActions,
    NoteActionState,
    NoteAuthor,
    NoteCard,
    NoteCounts,
    NoteIn,
    NoteListOut,
    NoteMy,
    NoteOut,
    NotePatch,
    NoteReactionOut,
    NoteSummaryIn,
    NoteSummaryOut,
)
from app.domains.users.models import User
from app.infrastructure.llm import router as llm
from app.infrastructure.llm.prompts import render
from app.infrastructure.llm.providers.base import LlmError, LlmLimited
from app.infrastructure.storage.images import save_image
from app.shared.cursor import decode_cursor, encode_cursor
from app.shared.errors import not_found, unauthorized
from app.shared.time import now_utc

PAGE_SIZE = 20
IMAGE_MB = 10  # 운영자 노트 이미지 (사용자 이용 한도가 아니라 policy 모듈 밖)
EDIT_GRACE = timedelta(minutes=1)  # 발행 직후 저장은 "수정됨"으로 보지 않음


def _clean(text: str | None) -> str | None:
    """줄마다 한 항목 — 빈 줄 · 앞뒤 공백 · 글머리(- · •) 정리. 비면 None (화면에 안 보임)."""
    lines = [ln.strip().lstrip("-•*").strip() for ln in (text or "").splitlines()]
    lines = [ln for ln in lines if ln]
    return "\n".join(lines) or None


KINDS = ("thunder", "wave", "bookmark")
COUNT_KEY = {"thunder": "thunders", "wave": "waves", "bookmark": "bookmarks"}


class _Stats:
    """노트 여러 개의 반응 수 · 내가 누른 것 (한 번에 읽음)."""

    def __init__(self, db: Session, ids: list[int], viewer: User | None) -> None:
        self.viewer = viewer
        self.counts: dict[int, dict[str, int]] = {i: {} for i in ids}
        self.mine: dict[int, set[str]] = {i: set() for i in ids}
        if not ids:
            return
        for nid, kind, n in db.execute(
            select(NoteReaction.note_id, NoteReaction.kind, func.count())
            .where(NoteReaction.note_id.in_(ids))
            .group_by(NoteReaction.note_id, NoteReaction.kind)
        ):
            self.counts[nid][kind] = n
        if viewer is not None:
            for nid, kind in db.execute(
                select(NoteReaction.note_id, NoteReaction.kind).where(
                    NoteReaction.note_id.in_(ids), NoteReaction.user_id == viewer.id
                )
            ):
                self.mine[nid].add(kind)

    def counts_of(self, nid: int) -> NoteCounts:
        c = self.counts.get(nid, {})
        return NoteCounts(**{COUNT_KEY[k]: c.get(k, 0) for k in KINDS})

    def my_of(self, nid: int) -> NoteMy:
        m = self.mine.get(nid, set())
        return NoteMy(**{k: k in m for k in KINDS})

    def actions(self) -> NoteActions:
        state = (
            NoteActionState(allowed=True)
            if self.viewer is not None
            else NoteActionState(allowed=False, reason="login_required")
        )
        return NoteActions(thunder=state, wave=state, bookmark=state)


def _card(n: Note, st: _Stats | None = None) -> NoteCard:
    edited = bool(n.published_at and n.updated_at - n.published_at > EDIT_GRACE)
    return NoteCard(
        id=n.id,
        number=n.number,
        title=n.title,
        lead=n.lead,
        status=n.status,  # type: ignore[arg-type]
        published_at=n.published_at,
        created_at=n.created_at,
        updated_at=n.updated_at,
        edited=edited,
        cover_url=n.cover_url,
        view_count=n.view_count,
        counts=st.counts_of(n.id) if st else NoteCounts(),
        my=st.my_of(n.id) if st else NoteMy(),
        actions=st.actions() if st else None,
    )


def _out(db: Session, n: Note, viewer: User | None = None) -> NoteOut:
    a = db.get(User, n.author_id) if n.author_id else None
    author = NoteAuthor(id=a.id, nickname=a.nickname, avatar_url=a.avatar_url) if a else None
    return NoteOut(
        **_card(n, _Stats(db, [n.id], viewer)).model_dump(),
        body_md=n.body_md,
        summary=n.summary,
        sources=n.sources,
        author=author,
    )


def _get(db: Session, note_id: int) -> Note:
    n = db.get(Note, note_id)
    if n is None:
        raise not_found("Observe Note 를 찾을 수 없어요.")
    return n


def _publish(db: Session, n: Note) -> None:
    """발행: 처음이면 번호(#N)를 매긴다. 발행 취소 뒤 다시 발행해도 번호 · 첫 발행일은 그대로."""
    if n.number is None:
        n.number = (db.scalar(select(func.max(Note.number))) or 0) + 1
    if n.published_at is None:
        n.published_at = now_utc()
    n.status = "published"


# ---------------------------------------------------------------- 공개


def public_list(
    db: Session, cursor: str | None, viewer: User | None = None, size: int = PAGE_SIZE
) -> NoteListOut:
    """발행한 노트, 최신 발행 순 (커서). 홈 피드 사이에 끼울 노트도 이걸로 받는다 (size 최대 50)."""
    q = select(Note).where(Note.status == "published")
    if cursor:
        at, nid = decode_cursor(cursor)
        q = q.where((Note.published_at < at) | ((Note.published_at == at) & (Note.id < nid)))
    rows = db.scalars(q.order_by(Note.published_at.desc(), Note.id.desc()).limit(size + 1)).all()
    more = len(rows) > size
    rows = rows[:size]
    nxt = encode_cursor(rows[-1].published_at, rows[-1].id) if more and rows else None
    st = _Stats(db, [n.id for n in rows], viewer)
    return NoteListOut(items=[_card(n, st) for n in rows], next_cursor=nxt)


def public_get(db: Session, note_id: int, viewer: User | None) -> NoteOut:
    """상세: 발행한 노트는 누구나, 임시 저장 글은 운영자만 (미리 보기)."""
    n = _get(db, note_id)
    if n.status != "published" and not (viewer and viewer.is_admin):
        raise not_found("Observe Note 를 찾을 수 없어요.")
    if n.status == "published" and not (viewer and viewer.is_admin):
        # 조회수: 운영자가 아닌 사람이 열 때마다 1 (updated_at 은 건드리지 않음 — "수정됨"과 섞이지 않게)
        db.execute(
            sql_update(Note)
            .where(Note.id == n.id)
            .values(view_count=Note.view_count + 1, updated_at=Note.updated_at)
        )
        db.commit()
        db.refresh(n)
    return _out(db, n, viewer)


# ---------------------------------------------------------------- 운영자


def admin_list(db: Session, page: int, size: int) -> AdminNotesOut:
    """모든 노트 (임시 저장 포함), 최근에 고친 순."""
    total = db.scalar(select(func.count()).select_from(Note)) or 0
    rows = db.scalars(
        select(Note)
        .order_by(Note.updated_at.desc(), Note.id.desc())
        .offset((page - 1) * size)
        .limit(size)
    ).all()
    st = _Stats(db, [n.id for n in rows], None)
    return AdminNotesOut(items=[_card(n, st) for n in rows], total=total, page=page, size=size)


def admin_get(db: Session, note_id: int) -> NoteOut:
    return _out(db, _get(db, note_id))


def create(db: Session, admin: User, data: NoteIn) -> NoteOut:
    n = Note(
        author_id=admin.id,
        title=data.title.strip(),
        lead=(data.lead or "").strip() or None,
        body_md=data.body_md,
        cover_url=data.cover_url or None,
        summary=_clean(data.summary),
        sources=_clean(data.sources),
        status="draft",
    )
    db.add(n)
    db.flush()
    if data.status == "published":
        _publish(db, n)
    db.commit()
    db.refresh(n)
    return _out(db, n)


def update(db: Session, note_id: int, data: NotePatch) -> NoteOut:
    n = _get(db, note_id)
    if data.title is not None:
        n.title = data.title.strip()
    if "lead" in data.model_fields_set:
        n.lead = (data.lead or "").strip() or None
    if data.body_md is not None:
        n.body_md = data.body_md
    if "cover_url" in data.model_fields_set:
        n.cover_url = data.cover_url or None
    if "summary" in data.model_fields_set:
        n.summary = _clean(data.summary)
    if "sources" in data.model_fields_set:
        n.sources = _clean(data.sources)
    if data.status == "published" and n.status != "published":
        _publish(db, n)
    elif data.status == "draft":
        n.status = "draft"  # 발행 취소: 목록에서 빠지고 운영자에게만 보임
    n.updated_at = now_utc()
    db.commit()
    db.refresh(n)
    return _out(db, n)


def delete(db: Session, note_id: int) -> None:
    """지우기 (발행한 글도). 번호는 다시 쓰지 않는다 — 비는 번호가 생길 수 있음."""
    db.delete(_get(db, note_id))
    db.commit()


def upload_image(data: bytes) -> str:
    return save_image(data, IMAGE_MB)


# ---------------------------------------------------------------- AI 요약 초안

SUMMARY_SCHEMA = {
    "type": "object",
    "properties": {"items": {"type": "array", "items": {"type": "string"}}},
    "required": ["items"],
    "additionalProperties": False,
}


def ai_summary(db: Session, admin: User, data: NoteSummaryIn) -> NoteSummaryOut:
    """AI 요약 초안 (note_summary). 저장하지 않는다 — 운영자가 고쳐서 노트와 함께 저장 (2026-11-17 사용자 결정:
    읽는 사람이 누를 때마다 만들면 내용이 달라질 수 있어서 운영자가 확정한 요약 하나를 보여 준다)."""
    system, prompt = render(
        "note_summary",
        title=data.title,
        lead=data.lead or "(없음)",
        body=data.body_md[:20_000],
    )
    try:
        res = llm.generate_json(
            db,
            "note_summary",
            system=system,
            user=prompt,
            schema=SUMMARY_SCHEMA,
            max_tokens=1000,
            user_id=admin.id,
        )
    except LlmLimited as err:
        db.rollback()
        return NoteSummaryOut(summary=None, error=str(err))
    except LlmError:
        db.rollback()
        return NoteSummaryOut(
            summary=None, error="지금은 AI 요약을 만들지 못했어요. 잠시 뒤 다시 해 주세요."
        )
    items = [str(x) for x in res.data.get("items", []) if str(x).strip()]
    text = _clean("\n".join(items))
    return NoteSummaryOut(summary=text, error=None if text else "AI 가 요약을 만들지 못했어요.")


# ---------------------------------------------------------------- 반응 (Thunder · Wave · 북마크, 2026-11-17)


def react(
    db: Session,
    user: User | None,
    note_id: int,
    kind: str,
    on: bool,
    via_user_id: int | None = None,
) -> NoteReactionOut:
    """누르기 · 취소. 발행한 노트에만. 같은 것을 두 번 눌러도 하나 (멱등).
    Wave 는 via_user_id(이 사람의 Wave 를 보고 Wave 함)를 확산 경로로 남긴다 — 상상 Wave 와 같은 규칙."""
    if user is None:
        raise unauthorized()
    n = _get(db, note_id)
    if n.status != "published":
        raise not_found("Observe Note 를 찾을 수 없어요.")
    key = (user.id, n.id, kind)
    row = db.get(NoteReaction, key)
    if on and row is None:
        via = via_user_id if kind == "wave" and via_user_id and via_user_id != user.id else None
        if via is not None and db.get(User, via) is None:
            via = None
        db.add(NoteReaction(user_id=user.id, note_id=n.id, kind=kind, via_user_id=via))
    elif not on and row is not None:
        db.delete(row)
    db.commit()
    st = _Stats(db, [n.id], user)
    return NoteReactionOut(my=st.my_of(n.id), counts=st.counts_of(n.id))


def reacted_between(
    db: Session, user: User, kind: str, lo: datetime | None, hi: datetime | None
) -> list[tuple[datetime, NoteCard]]:
    """내 서재 Thunder · Wave · 북마크 탭에 섞을 노트 반응 (2026-11-17 사용자 결정: 탭을 따로 두지 않고 함께).
    상상 북마크 한 페이지가 덮는 시간 구간 [lo, hi) 안에 누른 것만 — 페이지가 넘어가도 겹치거나 빠지지 않게."""
    q = (
        select(Note, NoteReaction.created_at)
        .join(NoteReaction, NoteReaction.note_id == Note.id)
        .where(
            NoteReaction.user_id == user.id,
            NoteReaction.kind == kind,
            Note.status == "published",
        )
    )
    if lo is not None:
        q = q.where(NoteReaction.created_at >= lo)
    if hi is not None:
        q = q.where(NoteReaction.created_at < hi)
    rows = db.execute(q.order_by(NoteReaction.created_at.desc())).all()
    st = _Stats(db, [r[0].id for r in rows], user)
    return [(at, _card(n, st)) for n, at in rows]


def place_after(rows: list[tuple[int, datetime]], at: datetime) -> int | None:
    """시간 순(최신 먼저) 목록에서 at 이 들어갈 자리: at 보다 늦거나 같은 마지막 항목의 id 바로 뒤 (없으면 맨 앞)."""
    after = None
    for item_id, t in rows:
        if t >= at:
            after = item_id
    return after


def waved_between(
    db: Session, viewer: User, lo: datetime | None, hi: datetime | None
) -> list[tuple[datetime, NoteCard, User]]:
    """팔로잉 피드에 섞을 노트 Wave (2026-11-17 사용자 결정): 내가 팔로우한 사람이 Wave 한 노트, 시간 구간 [lo, hi).
    같은 노트를 여러 사람이 Wave 했으면 가장 최근 한 번만 (상상 Wave 와 같은 규칙)."""
    from app.domains.users.models import Follow

    followees = select(Follow.followee_id).where(Follow.follower_id == viewer.id)
    q = (
        select(Note, NoteReaction.created_at, NoteReaction.user_id)
        .join(NoteReaction, NoteReaction.note_id == Note.id)
        .where(
            NoteReaction.kind == "wave",
            NoteReaction.user_id.in_(followees),
            Note.status == "published",
        )
    )
    if lo is not None:
        q = q.where(NoteReaction.created_at >= lo)
    if hi is not None:
        q = q.where(NoteReaction.created_at < hi)
    latest: dict[int, tuple[Note, datetime, int]] = {}
    for n, at, uid in db.execute(q.order_by(NoteReaction.created_at.desc())).all():
        latest.setdefault(n.id, (n, at, uid))
    wavers = {
        u.id: u
        for u in db.scalars(select(User).where(User.id.in_({v[2] for v in latest.values()})))
    }
    st = _Stats(db, list(latest), viewer)
    return [(at, _card(n, st), wavers[uid]) for n, at, uid in latest.values() if uid in wavers]
