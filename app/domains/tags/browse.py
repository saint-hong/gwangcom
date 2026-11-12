"""태그 화면용 서비스 (Sprint 5-D, 기획안 v10 F2 · F12 · S8 · S9).

- 작성자 기술 태그 편집 (최대 limit.tag_count, 지운 태그는 removed_at 으로 남김)
- 주제 둘러보기: 분야마다 많이 등장한 기술 태그
- 태그별 상상: 그 기술 태그가 붙은 상상 최신순

imaginations.service(present)를 쓰므로 tags.service 와 나눠 둔다 (imaginations.service 가 tags.service 를 쓴다).
화면에는 기술 태그만 보인다. 욕망 태그는 분석용 (2026-11-12 사용자 결정).
"""

from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.domains.imaginations import crud
from app.domains.imaginations.models import Imagination
from app.domains.imaginations.schemas import ImaginationOut, TagOut
from app.domains.imaginations.service import FEED_PAGE_SIZE, present, present_one
from app.domains.policy.service import get_effective_policy
from app.domains.tags.models import Domain, ImaginationTag, Tag
from app.domains.tags.service import ACTIVE, TAGGED_KINDS, get_or_create, to_label, to_name
from app.domains.users.models import User
from app.shared.cursor import decode_cursor, encode_cursor
from app.shared.errors import bad_request, forbidden, not_found
from app.shared.time import now_utc

# 주제 둘러보기에서 세는 글: 사람이 쓴 원본 · 인용만 (혼합 글은 "대중 상상" 지표에서 뺀다, 제품 원칙 3)
TOPIC_KINDS = ("original", "quote")
# 분야마다 보여 줄 태그 수 상한 (지금은 다양한 태그를 다 보여 주는 게 우선, 2026-11-12 사용자 결정)
TOPIC_TAGS_MAX = 100
# 오른쪽 컬럼 "추천 주제": 전체에서 많이 나온 주제(기술 태그) 수 (2026-11-12 사용자 결정)
POPULAR_MAX = 10


# ---------------------------------------------------------------- 응답 모양


class TopicTag(BaseModel):
    name: str
    label: str
    count: int  # 이 분야에서 이 태그가 붙은 상상 수 (원본 · 인용)


class TopicDomain(BaseModel):
    slug: str
    name: str
    tags: list[TopicTag]


class TopicsOut(BaseModel):
    popular: list[TopicTag]  # 분야 상관없이 많이 나온 주제 (한 글을 한 번만 센다)
    domains: list[TopicDomain]


class TagInfo(TagOut):
    count: int  # 이 태그가 붙은 상상 수 (혼합 포함, 피드에 나오는 글 수)


class TagFeedOut(BaseModel):
    tag: TagInfo
    items: list[ImaginationOut]
    next_cursor: str | None


# ---------------------------------------------------------------- 작성자 태그 편집


def set_tech_tags(db: Session, user: User, imagination_id: int, raw: list[str]) -> ImaginationOut:
    """기술 태그 목록을 통째로 바꾼다 (PUT). 바뀐 상상을 돌려준다.

    - 내 글(원본 · 인용 · 혼합)만. 댓글은 태그가 없다
    - 정규화 규칙은 AI 태그와 같다 (같은 이름이면 한 번만)
    - 빠진 태그: 행을 지우지 않고 removed_at 을 채운다 (AI 가 붙인 것도, 내가 붙인 것도)
    - 새 태그: source=user. 예전에 지운 태그를 다시 넣으면 removed_at 만 비운다 (처음 source 유지)
    """
    item = crud.get_visible(db, imagination_id)
    if item is None:
        raise not_found("상상을 찾을 수 없어요.")
    if item.author_id != user.id or item.kind not in TAGGED_KINDS:
        raise forbidden("not_allowed", "내 상상의 태그만 바꿀 수 있어요.")

    limit = get_effective_policy(db, user).limit("tag_count")
    wanted: dict[str, str] = {}  # name → label (입력 순서 유지)
    for value in raw:
        label = to_label(value, "tech")
        if label is None:
            raise bad_request("invalid_tag", "태그는 1~20자로 써 주세요.")
        wanted.setdefault(to_name(label), label)
    if len(wanted) > limit:
        raise bad_request("too_many_tags", f"태그는 {limit}개까지 붙일 수 있어요.")

    rows = {
        r.tag.name: r
        for r in db.scalars(
            select(ImaginationTag)
            .join(Tag, Tag.id == ImaginationTag.tag_id)
            .where(ImaginationTag.imagination_id == item.id, Tag.type == "tech")
        ).unique()
    }
    now = now_utc()
    for name, row in rows.items():
        if name in wanted:
            row.removed_at = None  # 남기거나 되살린다
        elif row.removed_at is None:
            row.removed_at = now  # 지운 기록을 남긴다
    for name, label in wanted.items():
        if name in rows:
            continue
        tag = get_or_create(db, label, "tech")
        if tag is not None:
            db.add(ImaginationTag(imagination_id=item.id, tag_id=tag.id, source="user"))
    db.commit()
    db.refresh(item)
    return present_one(db, item, user)


# ---------------------------------------------------------------- 주제 둘러보기 (S8)


def topics(db: Session) -> TopicsOut:
    """분야마다 많이 등장한 기술 태그 (원본 · 인용, 전체 기간, 많은 순 → 가나다순) + 전체 인기 주제.

    용어 (2026-11-12): 분야 = 고정 8개, 주제 = 기술 태그.

    분야는 글의 첫 분야와 두 번째 분야 모두로 센다 (홈 분야 탭과 같은 기준).
    """
    tagged = (
        select(Imagination.id, Imagination.domain_id, Imagination.secondary_domain_id)
        .where(Imagination.status == "visible", Imagination.kind.in_(TOPIC_KINDS))
        .subquery()
    )
    rows = db.execute(
        select(Domain.id, Tag.name, Tag.label, func.count(func.distinct(tagged.c.id)))
        .select_from(ImaginationTag)
        .join(Tag, Tag.id == ImaginationTag.tag_id)
        .join(tagged, tagged.c.id == ImaginationTag.imagination_id)
        .join(
            Domain,
            or_(Domain.id == tagged.c.domain_id, Domain.id == tagged.c.secondary_domain_id),
        )
        .where(ACTIVE, Tag.type == "tech")
        .group_by(Domain.id, Tag.id)
    ).all()
    by_domain: dict[int, list[TopicTag]] = {}
    for domain_id, name, label, count in rows:
        by_domain.setdefault(domain_id, []).append(TopicTag(name=name, label=label, count=count))
    out = []
    for d in db.scalars(select(Domain).order_by(Domain.sort_order)):
        tags = sorted(by_domain.get(d.id, []), key=lambda t: (-t.count, t.label))
        out.append(TopicDomain(slug=d.slug, name=d.name, tags=tags[:TOPIC_TAGS_MAX]))
    # 분야별 수를 더하면 분야가 2개인 글이 두 번 세어지므로 따로 센다
    n = func.count(func.distinct(tagged.c.id))
    popular = [
        TopicTag(name=name, label=label, count=count)
        for name, label, count in db.execute(
            select(Tag.name, Tag.label, n)
            .select_from(ImaginationTag)
            .join(Tag, Tag.id == ImaginationTag.tag_id)
            .join(tagged, tagged.c.id == ImaginationTag.imagination_id)
            .where(ACTIVE, Tag.type == "tech")
            .group_by(Tag.id)
            .order_by(n.desc(), Tag.label)
            .limit(POPULAR_MAX)
        )
    ]
    return TopicsOut(popular=popular, domains=out)


# ---------------------------------------------------------------- 태그별 상상 (S9)


def tag_feed(db: Session, user: User | None, name: str, cursor: str | None) -> TagFeedOut:
    """기술 태그가 붙은 상상 최신순 (원본 · 인용 · 혼합 모두, 2026-11-12 사용자 결정)."""
    tag = db.scalar(select(Tag).where(Tag.name == to_name(name), Tag.type == "tech"))
    if tag is None:
        raise not_found("없는 태그예요.")
    has_tag = (
        select(ImaginationTag.imagination_id)
        .where(ImaginationTag.tag_id == tag.id, ACTIVE)
        .scalar_subquery()
    )
    base = select(Imagination).where(
        Imagination.status == "visible",
        Imagination.kind.in_(TAGGED_KINDS),
        Imagination.id.in_(has_tag),
    )
    count = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    q = base
    if cursor:
        t, i = decode_cursor(cursor)
        q = q.where(
            or_(Imagination.created_at < t, (Imagination.created_at == t) & (Imagination.id < i))
        )
    rows = list(
        db.scalars(
            q.order_by(Imagination.created_at.desc(), Imagination.id.desc()).limit(
                FEED_PAGE_SIZE + 1
            )
        ).unique()
    )
    has_more = len(rows) > FEED_PAGE_SIZE
    rows = rows[:FEED_PAGE_SIZE]
    next_cursor = encode_cursor(rows[-1].created_at, rows[-1].id) if has_more and rows else None
    return TagFeedOut(
        tag=TagInfo(name=tag.name, label=tag.label, count=count),
        items=present(db, rows, user),
        next_cursor=next_cursor,
    )
