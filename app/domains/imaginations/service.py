"""상상 쓰기 · 인용 · 피드 · 상세 · 삭제 (기획안 v9 F2 · F3 · F6 · S4, v10 반영목록 2~3장)."""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import timedelta
from typing import Literal

from sqlalchemy import BigInteger, case, func, literal, or_, select, union_all, update
from sqlalchemy.dialects.postgresql import distinct_on
from sqlalchemy.orm import Session

from app.domains.imaginations import crud
from app.domains.imaginations.actions import build_actions
from app.domains.imaginations.models import Imagination
from app.domains.imaginations.schemas import (
    Counts,
    DomainRef,
    FeedOut,
    ImaginationOut,
    My,
    PromptRef,
    QuotedOut,
    TagOut,
)
from app.domains.policy.service import EffectivePolicy, get_effective_policy
from app.domains.reactions.models import Bookmark, Thunder, Wave
from app.domains.shake.models import ImaginationParent
from app.domains.tags.service import tech_tags_for
from app.domains.users.models import Follow, User
from app.domains.users.schemas import author_out
from app.infrastructure.storage.images import save_image
from app.shared.cursor import decode_cursor, decode_offset, encode_cursor, encode_offset
from app.shared.errors import AppError, bad_request, forbidden, not_found
from app.shared.time import now_utc

FEED_PAGE_SIZE = 20
TRENDING_DAYS = 7
TRENDING_LIMIT = 20
PUBLIC_KINDS = ("original", "quote")  # 인기 점수 대상: 사람이 쓴 상상 (혼합·댓글 제외, 원칙 3)


def score_expr():
    """인기 점수 (F12, 초기값) = Thunder + Wave×2 + 인용×3 + 댓글."""
    return (
        Imagination.thunder_count
        + Imagination.wave_count * 2
        + Imagination.quote_count * 3
        + Imagination.comment_count
    )


FeedTab = Literal["recommended", "latest", "following"]


@dataclass
class NewImagination:
    body: str
    domain: str
    title: str | None = None
    desire: str | None = None
    ai_assisted: bool = False
    shake_allowed: bool = True
    image: bytes | None = None
    prompt_id: int | None = None  # 이번 주 질문 (지금 답할 수 있는 것만, 6-C)


# ---------------------------------------------------------------- 응답 만들기


def _domain_ref(d) -> DomainRef | None:
    return DomainRef(slug=d.slug, name=d.name) if d is not None else None


def counts_of(item: Imagination) -> Counts:
    return Counts(
        thunders=item.thunder_count,
        waves=item.wave_count,
        comments=item.comment_count,
        quotes=item.quote_count,
        shakes=item.child_count,
    )


def my_states(db: Session, user: User | None, ids: Sequence[int]) -> dict[int, My]:
    """ids 중 내가 누른 Thunder · Wave · 북마크 (한 번에 세 번 조회)."""
    result = {i: My() for i in ids}
    if user is None or not ids:
        return result
    for model, field in ((Thunder, "thunder"), (Wave, "wave"), (Bookmark, "bookmark")):
        rows = db.scalars(
            select(model.imagination_id).where(
                model.user_id == user.id, model.imagination_id.in_(ids)
            )
        )
        for i in rows:
            setattr(result[i], field, True)
    return result


def _quoted_out(src: Imagination | None, quoted_id: int | None) -> QuotedOut:
    if src is None or src.status != "visible":
        return QuotedOut(id=quoted_id, deleted=True)
    return QuotedOut(
        id=src.id,
        kind=src.kind,  # type: ignore[arg-type]
        author=author_out(src.author),
        domain=_domain_ref(src.domain),
        display_title=src.display_title,
        body=src.body,
        image_url=src.image_url,
        created_at=src.created_at,
    )


def present(
    db: Session,
    items: Sequence[Imagination],
    user: User | None,
    policy: EffectivePolicy | None = None,
    waved_by: dict[int, User] | None = None,
) -> list[ImaginationOut]:
    """상상·댓글 목록을 응답 모양으로. actions · my · 인용 원본 · 답글 대상을 한 번에 채운다."""
    if not items:
        return []
    policy = policy or get_effective_policy(db, user)
    my = my_states(db, user, [i.id for i in items])
    tags = tech_tags_for(db, [i.id for i in items if i.kind != "comment"])
    # 혼합 글의 재료 (child → [position 0, 1] parent id)
    blend_ids = [i.id for i in items if i.kind == "blend"]
    source_ids: dict[int, list[int]] = {}
    if blend_ids:
        for row in db.scalars(
            select(ImaginationParent)
            .where(ImaginationParent.child_id.in_(blend_ids))
            .order_by(ImaginationParent.child_id, ImaginationParent.position)
        ):
            source_ids.setdefault(row.child_id, []).append(row.parent_id)
    ref_ids = (
        {i.quoted_id for i in items if i.quoted_id}
        | {i.parent_id for i in items if i.parent_id}
        | {p for ids in source_ids.values() for p in ids}
    )
    from app.domains.prompts.models import Prompt  # 순환 import 를 피해 여기서

    prompt_ids = {i.prompt_id for i in items if i.prompt_id}
    prompts = (
        {p.id: p.title for p in db.scalars(select(Prompt).where(Prompt.id.in_(prompt_ids)))}
        if prompt_ids
        else {}
    )
    refs = (
        {
            r.id: r
            for r in db.scalars(select(Imagination).where(Imagination.id.in_(ref_ids))).unique()
        }
        if ref_ids
        else {}
    )
    out = []
    for item in items:
        quoted = None
        if item.kind == "quote":
            quoted = _quoted_out(
                refs.get(item.quoted_id) if item.quoted_id else None, item.quoted_id
            )
        parent = refs.get(item.parent_id) if item.parent_id else None
        out.append(
            ImaginationOut(
                id=item.id,
                kind=item.kind,  # type: ignore[arg-type]
                author=author_out(item.author),
                domain=DomainRef(slug=item.domain.slug, name=item.domain.name),
                secondary_domain=_domain_ref(item.secondary_domain),
                title=item.title,
                display_title=item.display_title,
                body=item.body,
                desire=item.desire,
                image_url=item.image_url,
                ai_assisted=item.ai_assisted,
                shake_allowed=item.shake_allowed,
                counts=counts_of(item),
                created_at=item.created_at,
                actions=build_actions(item, user, policy, len(tags.get(item.id, []))),
                my=my[item.id],
                tags=[TagOut(name=t.name, label=t.label) for t in tags.get(item.id, [])],
                hidden=item.status == "hidden",
                quoted=quoted,
                sources=[_quoted_out(refs.get(p), p) for p in source_ids.get(item.id, [])]
                if item.kind == "blend"
                else None,
                parent_id=item.parent_id,
                root_id=item.root_id,
                reply_to=author_out(parent.author) if parent is not None else None,
                waved_by=author_out(waved_by[item.id])
                if waved_by and item.id in waved_by
                else None,
                prompt=PromptRef(id=item.prompt_id, title=prompts[item.prompt_id])
                if item.prompt_id in prompts
                else None,
            )
        )
    return out


def present_one(db: Session, item: Imagination, user: User | None) -> ImaginationOut:
    return present(db, [item], user)[0]


# ---------------------------------------------------------------- 입력 검사


def clean(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


def check_len(label: str, value: str | None, limit: int) -> None:
    if value is not None and len(value) > limit:
        raise bad_request(
            "too_long", f"{label}은(는) {limit}자까지 쓸 수 있어요. (지금 {len(value)}자)"
        )


def _check_can_post(policy: EffectivePolicy) -> None:
    if not policy.can("post"):
        raise forbidden("not_allowed", "지금은 상상을 올릴 수 없어요. 운영자에게 문의해 주세요.")
    if policy.posts_remaining <= 0:
        raise AppError(
            429, "daily_limit", f"오늘은 상상을 {policy.limit('post_daily')}개까지 올릴 수 있어요."
        )


def bump(db: Session, item_id: int, field: str, delta: int) -> None:
    """수 캐시를 DB 에서 바로 더하고 뺀다 (동시에 눌러도 맞도록). 0 아래로 내려가지 않는다."""
    col = getattr(Imagination, field)
    db.execute(
        update(Imagination)
        .where(Imagination.id == item_id)
        .values({field: func.greatest(col + delta, 0)})
    )


# ---------------------------------------------------------------- 쓰기


def create(db: Session, user: User, data: NewImagination) -> ImaginationOut:
    policy = get_effective_policy(db, user)
    _check_can_post(policy)

    title, body, desire = clean(data.title), clean(data.body), clean(data.desire)
    if body is None:
        raise bad_request("body_required", "상상 내용을 적어 주세요.")
    check_len("제목", title, policy.limit("title_chars"))
    check_len("상상", body, policy.limit("body_chars"))
    check_len("왜 원하나요", desire, policy.limit("desire_chars"))

    domain = crud.get_domain_by_slug(db, data.domain)
    if domain is None:
        raise bad_request("domain_required", "분야를 하나 골라 주세요.")

    from app.domains.prompts.service import (
        check_answerable,  # prompts 가 imaginations 모델을 쓰므로 여기서
    )

    prompt_id = check_answerable(db, data.prompt_id)
    image_url = save_image(data.image, policy.limit("image_mb")) if data.image else None

    item = Imagination(
        author_id=user.id,
        kind="original",
        title=title,
        body=body,
        desire=desire,
        image_url=image_url,
        domain_id=domain.id,
        ai_assisted=data.ai_assisted,
        shake_allowed=data.shake_allowed,
        prompt_id=prompt_id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    policy.posts_today += 1
    return present(db, [item], user, policy)[0]


def quote(db: Session, user: User, target_id: int, body: str) -> ImaginationOut:
    """인용하기 (F6, v10 반영목록 2장): 본문만, 분야는 원본을 따름, 하루 상상 쓰기 한도에 포함."""
    target = crud.get_visible(db, target_id)
    if target is None:
        raise not_found("인용할 상상을 찾을 수 없어요.")
    policy = get_effective_policy(db, user)
    if not policy.can("quote"):
        raise forbidden("not_allowed", "지금은 인용할 수 없어요.")
    _check_can_post(policy)
    text = clean(body)
    if text is None:
        raise bad_request("body_required", "인용하며 남길 글을 적어 주세요.")
    check_len("인용 글", text, policy.limit("quote_chars"))

    item = Imagination(
        author_id=user.id,
        kind="quote",
        body=text,
        domain_id=target.domain_id,
        quoted_id=target.id,
    )
    db.add(item)
    bump(db, target.id, "quote_count", 1)
    db.flush()
    from app.domains.notifications.service import notify  # 순환 import 를 피해 여기서

    notify(db, user_id=target.author_id, actor_id=user.id, type="quote", imagination_id=item.id)
    db.commit()
    db.refresh(item)
    policy.posts_today += 1
    return present(db, [item], user, policy)[0]


# ---------------------------------------------------------------- 읽기


def feed(
    db: Session,
    user: User | None,
    *,
    tab: FeedTab,
    domain: str | None,
    cursor: str | None,
) -> FeedOut:
    domain_id = None
    if domain:
        d = crud.get_domain_by_slug(db, domain)
        if d is None:
            raise bad_request("unknown_domain", "없는 분야예요.")
        domain_id = d.id

    if tab == "following":
        if user is None:
            return FeedOut(items=[], next_cursor=None)
        return _following(db, user, domain_id, cursor)
    if tab == "recommended":
        return _recommended(db, user, domain_id, cursor)

    after = decode_cursor(cursor) if cursor else None
    rows = crud.list_feed(db, domain_id=domain_id, after=after, limit=FEED_PAGE_SIZE)
    has_more = len(rows) > FEED_PAGE_SIZE
    rows = rows[:FEED_PAGE_SIZE]
    next_cursor = encode_cursor(rows[-1].created_at, rows[-1].id) if has_more and rows else None
    return FeedOut(items=present(db, rows, user), next_cursor=next_cursor)


def _domain_filter(q, domain_id: int | None):
    if domain_id is None:
        return q
    return q.where(
        or_(Imagination.domain_id == domain_id, Imagination.secondary_domain_id == domain_id)
    )


def _recommended(
    db: Session, user: User | None, domain_id: int | None, cursor: str | None
) -> FeedOut:
    """추천 탭 (F3 · F12): 최근 7일 상상을 인기 점수 순으로 먼저, 그다음 이전 상상 최신순."""
    since = now_utc() - timedelta(days=TRENDING_DAYS)
    recent = Imagination.created_at >= since
    q = select(Imagination).where(Imagination.status == "visible", Imagination.kind != "comment")
    q = _domain_filter(q, domain_id).order_by(
        case((recent, 0), else_=1),
        case((recent, score_expr()), else_=0).desc(),
        Imagination.created_at.desc(),
        Imagination.id.desc(),
    )
    offset = decode_offset(cursor) if cursor else 0
    rows = list(db.scalars(q.offset(offset).limit(FEED_PAGE_SIZE + 1)).unique())
    has_more = len(rows) > FEED_PAGE_SIZE
    rows = rows[:FEED_PAGE_SIZE]
    next_cursor = encode_offset(offset + len(rows)) if has_more else None
    return FeedOut(items=present(db, rows, user), next_cursor=next_cursor)


def _following(db: Session, user: User, domain_id: int | None, cursor: str | None) -> FeedOut:
    """팔로잉 탭 (F3): 내가 팔로우한 Dreamer 의 상상 + 그 사람들이 Wave 한 글 (시간 순).

    같은 글이 여러 번 나오면 가장 최근 것 하나만. Wave 로 들어온 글에는 waved_by 를 붙인다.
    """
    followees = select(Follow.followee_id).where(Follow.follower_id == user.id)
    posts = select(
        Imagination.id.label("iid"),
        Imagination.created_at.label("at"),
        literal(None, BigInteger).label("waver"),
    ).where(
        Imagination.author_id.in_(followees),
        Imagination.kind != "comment",
        Imagination.status == "visible",
    )
    waves = (
        select(Wave.imagination_id, Wave.created_at, Wave.user_id)
        .join(Imagination, Imagination.id == Wave.imagination_id)
        .where(Wave.user_id.in_(followees), Imagination.status == "visible")
    )
    if domain_id is not None:
        posts = _domain_filter(posts, domain_id)
        waves = _domain_filter(waves, domain_id)
    u = union_all(posts, waves).subquery()
    latest = (
        select(u.c.iid, u.c.at, u.c.waver)
        .ext(distinct_on(u.c.iid))
        .order_by(u.c.iid, u.c.at.desc())
        .subquery()
    )
    q = select(latest.c.iid, latest.c.at, latest.c.waver)
    if cursor:
        t, i = decode_cursor(cursor)
        q = q.where(or_(latest.c.at < t, (latest.c.at == t) & (latest.c.iid < i)))
    rows = db.execute(
        q.order_by(latest.c.at.desc(), latest.c.iid.desc()).limit(FEED_PAGE_SIZE + 1)
    ).all()
    has_more = len(rows) > FEED_PAGE_SIZE
    rows = rows[:FEED_PAGE_SIZE]

    ids = [r.iid for r in rows]
    items = {
        i.id: i for i in db.scalars(select(Imagination).where(Imagination.id.in_(ids))).unique()
    }
    wavers = {
        u.id: u
        for u in db.scalars(select(User).where(User.id.in_({r.waver for r in rows if r.waver})))
    }
    waved_by = {r.iid: wavers[r.waver] for r in rows if r.waver in wavers}
    ordered = [items[i] for i in ids if i in items]
    next_cursor = encode_cursor(rows[-1].at, rows[-1].iid) if has_more and rows else None
    return FeedOut(items=present(db, ordered, user, waved_by=waved_by), next_cursor=next_cursor)


def trending(db: Session, user: User | None, limit: int = TRENDING_LIMIT) -> FeedOut:
    """인기 상상 (F12 · S7): 최근 7일 안에 올라온 원본·인용을 인기 점수 순으로 1~20위."""
    since = now_utc() - timedelta(days=TRENDING_DAYS)
    q = (
        select(Imagination)
        .where(
            Imagination.status == "visible",
            Imagination.kind.in_(PUBLIC_KINDS),
            Imagination.created_at >= since,
        )
        .order_by(score_expr().desc(), Imagination.created_at.desc(), Imagination.id.desc())
        .limit(min(max(limit, 1), TRENDING_LIMIT))
    )
    rows = list(db.scalars(q).unique())
    return FeedOut(items=present(db, rows, user), next_cursor=None)


def detail(db: Session, user: User | None, imagination_id: int) -> ImaginationOut:
    """상세. 댓글 id 로 열면 댓글 자체를 돌려준다 (화면은 root_id 로 원글에 가서 그 댓글을 보여 준다)."""
    item = db.get(Imagination, imagination_id)
    # 운영자가 숨긴 글은 작성자 본인과 운영자에게만 보인다 (hidden=true 로 안내, v11 F19)
    can_see_hidden = (
        item is not None
        and item.status == "hidden"
        and user is not None
        and (user.id == item.author_id or user.is_admin)
    )
    if item is None or not (item.status == "visible" or can_see_hidden):
        raise not_found("상상을 찾을 수 없어요. 삭제됐거나 주소가 틀렸을 수 있어요.")
    if user is not None and item.kind != "comment" and item.status == "visible":
        crud.record_view(db, user_id=user.id, imagination_id=item.id)
        db.commit()
    return present_one(db, item, user)


def adjust_related_counts(db: Session, item: Imagination, delta: int) -> None:
    """글이 안 보이게 되거나(삭제 · 숨김, -1) 다시 보이면(+1) 다른 글의 집계 캐시를 맞춘다.

    인용 수 · 재료 글의 Shake 수(계보 연결은 남긴다) · 댓글 수.
    """
    if item.kind == "quote" and item.quoted_id:
        bump(db, item.quoted_id, "quote_count", delta)
    if item.kind == "blend":
        for p in db.scalars(
            select(ImaginationParent.parent_id).where(ImaginationParent.child_id == item.id)
        ):
            bump(db, p, "child_count", delta)
    if item.kind == "comment":
        if item.root_id:
            bump(db, item.root_id, "comment_count", delta)
        if item.parent_id and item.parent_id != item.root_id:
            bump(db, item.parent_id, "comment_count", delta)


def delete(db: Session, user: User, imagination_id: int) -> None:
    """작성자 삭제. 운영자가 숨긴 내 글도 지울 수 있다 (집계는 숨길 때 이미 뺐다)."""
    item = db.get(Imagination, imagination_id)
    if item is None or item.status not in ("visible", "hidden"):
        raise not_found("상상을 찾을 수 없어요.")
    if item.author_id != user.id:
        raise forbidden("not_allowed", "내가 쓴 글만 지울 수 있어요.")
    if item.status == "visible":
        adjust_related_counts(db, item, -1)
    item.status = "deleted"  # 데이터 시점 보존 — 실제로 지우지 않고 숨긴다
    db.commit()
