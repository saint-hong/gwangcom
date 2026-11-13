"""analytics.frame — 기간 안의 상상 · 태그를 한 번에 읽어 두는 묶음.

대시보드의 지표 대부분은 "같은 상상에 무엇이 함께 붙었나"(분야 · 기술 · 욕망)를 세는 일이라,
기간(+ 비교 기간)의 상상과 태그를 한 번 읽고 파이썬에서 센다.
- 대상 = 대중 상상: kind original · quote, 보이는 글만 (원칙 3: 혼합 · 댓글 제외, 숨긴 글 제외)
- 태그 = 작성자가 지우지 않은 것 (removed_at 없음)
- Thunder 수 = 그 상상이 지금까지 받은 수 (욕망의 표시 지표)
프로토타입 규모(수천 개)를 가정한다. 커지면 집계 테이블 · Memgraph(Sprint 7)로 옮긴다.
"""

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domains.analytics.period import Period
from app.domains.imaginations.models import Imagination
from app.domains.tags.models import Domain, ImaginationTag, Tag

PUBLIC_KINDS = ("original", "quote")


@dataclass
class Post:
    id: int
    created_at: datetime
    kind: str
    author_id: int
    domain: str  # slug
    prompt_id: int | None
    ai_assisted: bool
    thunders: int
    waves: int
    quotes: int
    bookmarks: int
    comments: int
    title: str | None
    body: str
    techs: list[tuple[int, str]] = field(default_factory=list)  # (tag_id, label)
    desires: list[tuple[int, str]] = field(default_factory=list)

    @property
    def reactions(self) -> int:
        return self.thunders + self.waves + self.quotes + self.bookmarks + self.comments


@dataclass
class Frame:
    period: Period
    posts: list[Post]  # 이번 기간
    prev: list[Post]  # 비교 기간 (all 이면 빈 목록)
    domains: list[tuple[str, str]]  # (slug, name) 고정 8개 순서
    first_seen: dict[int, datetime]  # 기술 태그가 처음 나온 시각 (전체 기간 기준)


def first_post_at(db: Session) -> datetime | None:
    return db.scalar(
        select(func.min(Imagination.created_at)).where(
            Imagination.kind.in_(PUBLIC_KINDS), Imagination.status == "visible"
        )
    )


def load_posts(db: Session, start: datetime, end: datetime) -> list[Post]:
    rows = db.execute(
        select(
            Imagination.id,
            Imagination.created_at,
            Imagination.kind,
            Imagination.author_id,
            Domain.slug,
            Imagination.prompt_id,
            Imagination.ai_assisted,
            Imagination.thunder_count,
            Imagination.wave_count,
            Imagination.quote_count,
            Imagination.bookmark_count,
            Imagination.comment_count,
            Imagination.title,
            Imagination.body,
        )
        .join(Domain, Domain.id == Imagination.domain_id)
        .where(
            Imagination.kind.in_(PUBLIC_KINDS),
            Imagination.status == "visible",
            Imagination.created_at >= start,
            Imagination.created_at < end,
        )
        .order_by(Imagination.created_at)
    ).all()
    posts = {r[0]: Post(*r) for r in rows}
    if posts:
        tag_rows = db.execute(
            select(ImaginationTag.imagination_id, Tag.id, Tag.type, Tag.label)
            .join(Tag, Tag.id == ImaginationTag.tag_id)
            .where(
                ImaginationTag.imagination_id.in_(posts.keys()),
                ImaginationTag.removed_at.is_(None),
                Tag.type.in_(("tech", "desire")),
            )
            .order_by(ImaginationTag.imagination_id, Tag.id)
        ).all()
        for pid, tid, ttype, label in tag_rows:
            (posts[pid].techs if ttype == "tech" else posts[pid].desires).append((tid, label))
    return list(posts.values())


def load_frame(db: Session, period: Period) -> Frame:
    posts = load_posts(db, period.start_utc, period.end_utc)
    prev = load_posts(db, period.prev_start_utc, period.start_utc) if period.has_prev else []
    domains = [
        (slug, name)
        for slug, name in db.execute(select(Domain.slug, Domain.name).order_by(Domain.sort_order))
    ]
    first_rows = db.execute(
        select(ImaginationTag.tag_id, func.min(Imagination.created_at))
        .join(Imagination, Imagination.id == ImaginationTag.imagination_id)
        .join(Tag, Tag.id == ImaginationTag.tag_id)
        .where(
            Tag.type == "tech",
            ImaginationTag.removed_at.is_(None),
            Imagination.kind.in_(PUBLIC_KINDS),
            Imagination.status == "visible",
        )
        .group_by(ImaginationTag.tag_id)
    ).all()
    return Frame(period, posts, prev, domains, dict(first_rows))


def series(period: Period, times: list[datetime]) -> list[int]:
    """시각 목록 → 칸마다 개수."""
    out = [0] * len(period.buckets)
    for t in times:
        i = period.index_of(t)
        if i is not None:
            out[i] += 1
    return out


def count_by(items, key) -> dict:
    out: dict = defaultdict(int)
    for it in items:
        for k in key(it):
            out[k] += 1
    return out
