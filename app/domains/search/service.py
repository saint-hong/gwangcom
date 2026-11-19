"""홈 검색 (Sprint 7, 2026-11-19 사용자 결정) — 상상 · 주제 · Dreamer 를 찾는다.

- 상상: **글자 일치 + 뜻 검색**. 글자가 맞는 상상이 먼저, 그 뒤에 글자는 다르지만 뜻이 비슷한 상상
  · 글자 일치: 낱말마다 제목 · 본문 · 왜 원하나요 · 주제(기술 태그) 중 하나에 들어 있어야 한다 (낱말은 모두 만족)
  · 뜻 검색: 검색어를 임베딩해 pgvector 로 가까운 상상을 찾는다 (원본 · 인용만 임베딩이 있다)
    임베딩이 실패하거나 꺼져 있으면 글자 일치만 보여 준다
  · 대상: 보이는 원본 · 인용 · 혼합 (댓글 · 숨긴 글 제외)
- 주제: 기술 태그 이름이 검색어(전체 · 낱말)와 겹치는 것 (욕망 태그는 화면에 보이지 않으므로 찾지 않는다)
- Dreamer: 닉네임 · 소개에 검색어가 들어 있는 사람
- 검색 기록: 첫 페이지를 볼 때마다 search_logs 에 한 줄 (제품 원칙 2)
"""

import logging
import math
import re
import unicodedata
from collections import OrderedDict

from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from app.domains.imaginations.models import Imagination
from app.domains.imaginations.service import FEED_PAGE_SIZE, present
from app.domains.search.models import SearchLog
from app.domains.search.schemas import (
    SearchDreamersOut,
    SearchImaginationsOut,
    SearchTopic,
    SearchTopicsOut,
)
from app.domains.similar.models import ImaginationEmbedding
from app.domains.similar.service import KINDS as EMBED_KINDS
from app.domains.similar.service import embed_texts
from app.domains.tags.models import ImaginationTag, Tag
from app.domains.tags.service import ACTIVE, TAGGED_KINDS, to_name
from app.domains.users.models import Follow, User
from app.domains.users.schemas import FollowUserOut, author_out
from app.infrastructure.core.config import get_settings
from app.infrastructure.embeddings import get_embedder
from app.shared.cursor import decode_offset, encode_offset
from app.shared.errors import bad_request

log = logging.getLogger(__name__)

QUERY_MAX = 50  # 검색어 최대 글자 수
TERMS_MAX = 5  # 낱말은 앞에서부터 이만큼만 쓴다
TEXT_MAX = 200  # 글자 일치로 가져올 상상 수 상한
TOPICS_MAX = 50
RELATED_MAX = 10  # 관련 주제 수
RELATED_MARGIN = 0.02  # 관련 주제를 뽑을 때: 뜻 검색 1위 점수에서 이만큼 안쪽인 상상만 본다
RELATED_SHARE = 0.15  # 중심 상상의 이 비율 이상에 쓰인 주제만
SEARCH_KINDS = TAGGED_KINDS  # 원본 · 인용 · 혼합 (댓글 제외)
ESC = "\\"

# 검색어 벡터를 잠깐 기억해 둔다 (다음 페이지를 볼 때 임베딩을 다시 부르지 않게). 서버를 다시 켜면 비워진다
_VECTORS: OrderedDict[tuple[str, str], list[float]] = OrderedDict()
_VECTORS_MAX = 500


def clean_query(raw: str) -> str:
    """앞뒤 빈칸 · 겹친 빈칸 정리, 앞의 # 제거. 비었거나 너무 길면 400."""
    q = re.sub(r"\s+", " ", unicodedata.normalize("NFC", raw or "")).strip().lstrip("#").strip()
    if not q:
        raise bad_request("empty_query", "검색어를 입력해 주세요.")
    if len(q) > QUERY_MAX:
        raise bad_request("query_too_long", f"검색어는 {QUERY_MAX}자까지 쓸 수 있어요.")
    return q


def _like(term: str) -> str:
    """ILIKE 무늬. 검색어의 % · _ 는 글자 그대로 찾는다."""
    return "%" + term.replace(ESC, ESC * 2).replace("%", ESC + "%").replace("_", ESC + "_") + "%"


def _log(
    db: Session, user: User | None, q: str, tab: str, count: int, meaning_count: int = 0
) -> None:
    db.add(
        SearchLog(
            user_id=user.id if user else None,
            query=q,
            norm=to_name(q),
            tab=tab,
            result_count=count,
            meaning_count=meaning_count,
        )
    )
    db.commit()


# ---------------------------------------------------------------- 상상


def _text_ids(db: Session, q: str) -> list[int]:
    """글자 일치: 낱말마다 제목 · 본문 · 왜 원하나요 · 주제 중 하나에 들어 있는 상상 (최신순)."""
    conds = []
    for term in q.split()[:TERMS_MAX]:
        like = _like(term)
        has_tag = (
            select(ImaginationTag.imagination_id)
            .join(Tag, Tag.id == ImaginationTag.tag_id)
            .where(ACTIVE, Tag.type == "tech", Tag.name.ilike(_like(to_name(term)), escape=ESC))
        )
        conds.append(
            or_(
                Imagination.title.ilike(like, escape=ESC),
                Imagination.body.ilike(like, escape=ESC),
                Imagination.desire.ilike(like, escape=ESC),
                Imagination.id.in_(has_tag),
            )
        )
    return list(
        db.scalars(
            select(Imagination.id)
            .where(Imagination.status == "visible", Imagination.kind.in_(SEARCH_KINDS), *conds)
            .order_by(Imagination.created_at.desc(), Imagination.id.desc())
            .limit(TEXT_MAX)
        )
    )


def _query_vector(db: Session, q: str) -> list[float] | None:
    embedder = get_embedder()
    key = (embedder.model, q)
    if key in _VECTORS:
        _VECTORS.move_to_end(key)
        return _VECTORS[key]
    try:
        vec = embed_texts(db, [q])[0]
        db.commit()
    except Exception:  # noqa: BLE001 — 뜻 검색이 안 돼도 글자 일치 결과는 보여 준다
        db.rollback()
        log.exception("검색어 임베딩 실패")
        return None
    _VECTORS[key] = vec
    if len(_VECTORS) > _VECTORS_MAX:
        _VECTORS.popitem(last=False)
    return vec


def _meaning_scores(db: Session, q: str) -> dict[int, float]:
    """뜻 검색: 검색어와 가까운 상상 → {id: 점수}. 기준 점수 아래 · 1위와 먼 것은 버린다."""
    s = get_settings()
    if not s.search_meaning:
        return {}
    # 임베딩된 상상이 하나도 없으면(샘플 데이터만 넣은 직후 등) 검색어 임베딩을 부르지 않는다
    model = get_embedder().model
    if (
        db.scalar(
            select(ImaginationEmbedding.imagination_id)
            .where(ImaginationEmbedding.model == model)
            .limit(1)
        )
        is None
    ):
        return {}
    vec = _query_vector(db, q)
    if vec is None:
        return {}
    dist = ImaginationEmbedding.embedding.cosine_distance(vec)
    rows = db.execute(
        select(Imagination.id, dist.label("d"))
        .join(ImaginationEmbedding, ImaginationEmbedding.imagination_id == Imagination.id)
        .where(
            Imagination.status == "visible",
            Imagination.kind.in_(EMBED_KINDS),
            ImaginationEmbedding.model == model,
        )
        .order_by(dist)
        .limit(s.search_meaning_candidates)
    )
    scored = [(item_id, round(1 - float(d), 4)) for item_id, d in rows]
    if not scored:
        return {}
    # 점수가 0.7~0.9 에 몰려 천천히 떨어진다 → 기준 점수 이상이면서 1위와 가까운 것만 남긴다
    floor = max(s.search_min_score, scored[0][1] - s.search_score_margin)
    return {item_id: score for item_id, score in scored if score >= floor}


def rank(text_ids: list[int], scores: dict[int, float]) -> tuple[list[int], set[int]]:
    """보여 줄 순서와 "뜻으로만 찾은" 상상.

    글자가 맞는 상상이 먼저(그 안에서는 뜻 점수 높은 순, 같으면 최신순), 그 뒤에 뜻이 비슷한 상상(점수 높은 순).
    """
    order = {item_id: i for i, item_id in enumerate(text_ids)}
    text_sorted = sorted(text_ids, key=lambda i: (-scores.get(i, -1.0), order[i]))
    meaning_only = [i for i in sorted(scores, key=lambda i: -scores[i]) if i not in order]
    return text_sorted + meaning_only, set(meaning_only)


def imaginations(
    db: Session, user: User | None, raw: str, cursor: str | None
) -> SearchImaginationsOut:
    q = clean_query(raw)
    ids, meaning = rank(_text_ids(db, q), _meaning_scores(db, q))
    offset = decode_offset(cursor) if cursor else 0
    page_ids = ids[offset : offset + FEED_PAGE_SIZE]
    rows = (
        {
            i.id: i
            for i in db.scalars(select(Imagination).where(Imagination.id.in_(page_ids))).unique()
        }
        if page_ids
        else {}
    )
    items = [rows[i] for i in page_ids if i in rows]
    next_cursor = (
        encode_offset(offset + len(page_ids)) if offset + len(page_ids) < len(ids) else None
    )
    out = SearchImaginationsOut(
        query=q,
        total=len(ids),
        items=present(db, items, user),
        meaning_ids=[i.id for i in items if i.id in meaning],
        next_cursor=next_cursor,
    )
    if cursor is None:
        _log(db, user, q, "imaginations", len(ids), len(meaning))
    return out


# ---------------------------------------------------------------- 주제


def topics(db: Session, user: User | None, raw: str) -> SearchTopicsOut:
    """검색어와 이름이 겹치는 주제(기술 태그). 수는 태그별 상상 화면과 같게 센다.

    세 가지 중 하나면 찾는다 (2026-11-19 사용자: "배터리 휴대폰" → #고체 배터리 가 나와야 한다)
      ① 주제 이름에 검색어 전체가 들어 있다            "로봇" → #휴머노이드 로봇
      ② 주제 이름에 검색어의 낱말 하나가 들어 있다      "배터리 휴대폰" → #고체 배터리 (한 글자 낱말은 쓰지 않는다)
      ③ 검색어 안에 주제 이름이 통째로 들어 있다        "드론택시" → #드론
    순서: 이름이 검색어와 똑같은 주제 → 검색어 전체가 들어 있는 주제 → 맞는 낱말이 많은 주제 → 상상 많은 순
    """
    q = clean_query(raw)
    n = func.count(func.distinct(Imagination.id))
    name = to_name(q)
    whole = Tag.name.ilike(_like(name), escape=ESC)
    terms = [to_name(w) for w in q.split()[:TERMS_MAX]]
    terms = [w for w in dict.fromkeys(terms) if len(w) >= 2 and w != name]
    term_hits = [Tag.name.ilike(_like(w), escape=ESC) for w in terms]
    inside = (func.length(Tag.name) >= 2) & (func.strpos(name, Tag.name) > 0)
    hits = sum((case((c, 1), else_=0) for c in term_hits), start=case((inside, 1), else_=0))
    rows = db.execute(
        select(Tag.name, Tag.label, n)
        .join(ImaginationTag, ImaginationTag.tag_id == Tag.id)
        .join(Imagination, Imagination.id == ImaginationTag.imagination_id)
        .where(
            ACTIVE,
            Tag.type == "tech",
            or_(whole, inside, *term_hits),
            Imagination.status == "visible",
            Imagination.kind.in_(SEARCH_KINDS),
        )
        .group_by(Tag.id)
        .order_by(
            case((Tag.name == name, 0), (whole, 1), else_=2), hits.desc(), n.desc(), Tag.label
        )
        .limit(TOPICS_MAX)
    ).all()
    items = [SearchTopic(name=r[0], label=r[1], count=r[2]) for r in rows]
    related = _related_topics(db, q, {i.name for i in items})
    _log(db, user, q, "topics", len(items) + len(related))
    return SearchTopicsOut(query=q, total=len(items), items=items, related=related)


def _related_topics(db: Session, q: str, skip: set[str]) -> list[SearchTopic]:
    """상상 검색 결과에 많이 쓰인 주제 (2026-11-19 사용자 결정) — 이름은 안 맞아도 검색어와 가까운 주제.

    동떨어진 상상의 주제가 끼지 않게 두 번 거른다.
      ① 중심 상상만 본다: 글자가 맞는 상상 + 뜻 검색 1위와 아주 가까운 상상 (RELATED_MARGIN 안쪽)
      ② 그 상상들에 **여러 번** 쓰인 주제만: 2개 이상이면서 중심 상상의 RELATED_SHARE 이상 (중심 상상이 1~2개면 1개)
    많이 쓰인 순으로 RELATED_MAX 개. skip = 이미 이름으로 찾은 주제.
    """
    text_ids = _text_ids(db, q)
    scores = _meaning_scores(db, q)
    core = set(text_ids)
    if scores:
        near = max(scores.values()) - RELATED_MARGIN
        core |= {i for i, sc in scores.items() if sc >= near}
    if not core:
        return []
    need = 1 if len(core) <= 2 else max(2, math.ceil(len(core) * RELATED_SHARE))
    used = func.count(func.distinct(ImaginationTag.imagination_id))
    picked = db.execute(
        select(Tag.id, Tag.name, Tag.label, used)
        .join(ImaginationTag, ImaginationTag.tag_id == Tag.id)
        .where(ACTIVE, Tag.type == "tech", ImaginationTag.imagination_id.in_(core))
        .group_by(Tag.id)
        .having(used >= need)
        .order_by(used.desc(), Tag.label)
    ).all()
    picked = [r for r in picked if r[1] not in skip][:RELATED_MAX]
    if not picked:
        return []
    # 알약에 보이는 수는 다른 주제와 같게: 그 주제가 붙은 전체 상상 수
    n = func.count(func.distinct(Imagination.id))
    totals = dict(
        db.execute(
            select(ImaginationTag.tag_id, n)
            .join(Imagination, Imagination.id == ImaginationTag.imagination_id)
            .where(
                ACTIVE,
                ImaginationTag.tag_id.in_([r[0] for r in picked]),
                Imagination.status == "visible",
                Imagination.kind.in_(SEARCH_KINDS),
            )
            .group_by(ImaginationTag.tag_id)
        ).all()
    )
    return [SearchTopic(name=r[1], label=r[2], count=totals.get(r[0], r[3])) for r in picked]


# ---------------------------------------------------------------- Dreamer


def dreamers(db: Session, me: User | None, raw: str, cursor: str | None) -> SearchDreamersOut:
    """닉네임 · 소개에 검색어가 들어 있는 Dreamer. 닉네임이 맞는 사람이 먼저, 그다음 팔로워 많은 순."""
    q = clean_query(raw)
    like = _like(q)
    nick_like = _like(q.replace(" ", "").lstrip("@"))
    match = or_(User.nickname.ilike(nick_like, escape=ESC), User.bio.ilike(like, escape=ESC))
    total = db.scalar(select(func.count()).select_from(User).where(match)) or 0
    followers = (
        select(Follow.followee_id, func.count().label("n")).group_by(Follow.followee_id).subquery()
    )
    offset = decode_offset(cursor) if cursor else 0
    users = list(
        db.scalars(
            select(User)
            .outerjoin(followers, followers.c.followee_id == User.id)
            .where(match)
            .order_by(
                case((User.nickname.ilike(nick_like, escape=ESC), 0), else_=1),
                func.coalesce(followers.c.n, 0).desc(),
                User.id,
            )
            .offset(offset)
            .limit(FEED_PAGE_SIZE)
        )
    )
    ids = [u.id for u in users]
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
        for u in users
    ]
    next_cursor = encode_offset(offset + len(users)) if offset + len(users) < total else None
    if cursor is None:
        _log(db, me, q, "dreamers", total)
    return SearchDreamersOut(query=q, total=total, items=items, next_cursor=next_cursor)
