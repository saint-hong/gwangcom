"""analytics.insights — 개요 · 기술 흐름 · 교차(분야 × 기술 × 욕망) 계산.

모든 신호(새로 등장 · 떠오름 · 꾸준함 · 식는 중)는 아래 규칙으로만 정한다. AI 가 판단하지 않는다 (원칙 4).
"""

from collections import Counter, defaultdict
from itertools import combinations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domains.analytics.frame import Frame, Post, load_frame, series
from app.domains.analytics.period import Period
from app.domains.analytics.schemas import (
    CrossOut,
    DesireRow,
    DomainRow,
    EventMark,
    Kpi,
    MatrixCell,
    NetEdge,
    NetNode,
    OverviewOut,
    PairRow,
    PeriodOut,
    SankeyLink,
    SankeyNode,
    TechOut,
    TechSignal,
)
from app.domains.imaginations.models import Imagination
from app.domains.prompts.models import Prompt
from app.domains.reactions.models import Thunder, Wave
from app.domains.users.models import User
from app.shared.time import KST

# 비교는 "비중"(그 기술이 붙은 상상 ÷ 그 기간 전체 상상)으로 한다 (2026-11-13 샘플 16주로 확인):
# 개수로 비교하면 서비스가 커지는 동안 모든 기술이 "떠오름"이 된다.
RISING = 1.5  # 비중이 이전 기간의 1.5배 이상 (그리고 3개 이상) → 떠오름
COOLING = 0.67  # 비중이 이전 기간의 2/3 미만 → 식는 중
RISING_MIN = 3
NEW_DAYS = 7  # 전체 기간에서는 최근 7일 안에 처음 나온 기술을 "새로 등장"으로


def period_out(p: Period) -> PeriodOut:
    return PeriodOut(
        key=p.key,
        start=p.start,
        end=p.end,
        unit=p.unit,
        buckets=list(p.buckets),
        has_prev=p.has_prev,
    )


def events(db: Session, p: Period) -> list[EventMark]:
    rows = db.execute(
        select(Prompt.starts_at, Prompt.title).where(
            Prompt.is_active.is_(True),
            Prompt.starts_at >= p.start_utc,
            Prompt.starts_at < p.end_utc,
        )
    ).all()
    return [
        EventMark(date=at.astimezone(KST).date(), label=f"질문 시작: {title}", kind="prompt")
        for at, title in rows
    ]


def _times(db: Session, col, *where) -> list:
    return list(db.scalars(select(col).where(*where)))


def _share_growth(cur: int, total: int, prev: int | None, prev_total: int) -> float | None:
    """비중 증감: (이번 비중 - 이전 비중) / 이전 비중. 이전에 없었으면 None."""
    if not prev or not total or not prev_total:
        return None
    return round((cur / total) / (prev / prev_total) - 1, 3)


# ---------------------------------------------------------------- 기술 흐름


def tech_signals(f: Frame, limit: int = 60) -> list[TechSignal]:
    p = f.period
    labels: dict[int, str] = {}
    posts_of: dict[int, list[Post]] = defaultdict(list)
    for post in f.posts:
        for tid, label in post.techs:
            labels[tid] = label
            posts_of[tid].append(post)
    prev_count: Counter[int] = Counter(tid for post in f.prev for tid, _ in post.techs)
    total, prev_total = len(f.posts), len(f.prev)

    out: list[TechSignal] = []
    for tid, posts in posts_of.items():
        count = len(posts)
        prev = prev_count.get(tid, 0) if p.has_prev else None
        first = f.first_seen.get(tid, posts[0].created_at)
        first_day = first.astimezone(KST).date()
        share_growth = _share_growth(count, total, prev, prev_total)
        if p.has_prev:
            if first_day >= p.start:
                signal = "new"
            elif share_growth is not None and share_growth + 1 >= RISING and count >= RISING_MIN:
                signal = "rising"
            elif share_growth is not None and share_growth + 1 < COOLING:
                signal = "cooling"
            else:
                signal = "steady"
        else:
            signal = "new" if (p.end - first_day).days < NEW_DAYS else "steady"
        thunders = sum(x.thunders for x in posts)
        domain = Counter(x.domain for x in posts).most_common(1)[0][0]
        desires = Counter(label for x in posts for _, label in x.desires)
        out.append(
            TechSignal(
                tag_id=tid,
                label=labels[tid],
                count=count,
                prev=prev,
                growth=share_growth,
                thunders=thunders,
                thunder_avg=round(thunders / count, 2),
                authors=len({x.author_id for x in posts}),
                first_seen=first_day,
                signal=signal,  # type: ignore[arg-type]
                domain=domain,
                series=series(p, [x.created_at for x in posts]),
                desires=[d for d, _ in desires.most_common(3)],
            )
        )
    out.sort(key=lambda t: (-t.count, -t.thunders, t.label))
    return out[:limit]


def tech(db: Session, period: Period) -> TechOut:
    f = load_frame(db, period)
    return TechOut(
        period=period_out(period),
        techs=tech_signals(f),
        total_posts=len(f.posts),
        events=events(db, period),
    )


# ---------------------------------------------------------------- 개요


def _rising_first(signals: list[TechSignal], limit: int = 8) -> list[TechSignal]:
    """개요 카드: 새로 등장(많이 나온 순 3개까지) → 떠오름(비중이 많이 는 순) → 꾸준함 → 식는 중."""
    new = sorted((t for t in signals if t.signal == "new"), key=lambda t: (-t.count, -t.thunders))[
        :3
    ]
    order = {"rising": 0, "steady": 1, "cooling": 2, "new": 3}
    rest = sorted(
        (t for t in signals if t not in new),
        key=lambda t: (order[t.signal], -(t.growth or 0), -t.count),
    )
    return (new + rest)[:limit]


def overview(db: Session, period: Period) -> OverviewOut:
    f = load_frame(db, period)
    p = period
    start, end = p.start_utc, p.end_utc
    prev_start = p.prev_start_utc

    def window(col, *where):
        cur = _times(db, col, col >= start, col < end, *where)
        prev = len(_times(db, col, col >= prev_start, col < start, *where)) if p.has_prev else None
        return cur, prev

    thunders, thunders_prev = window(Thunder.created_at)
    waves, waves_prev = window(Wave.created_at)
    comment_where = (Imagination.kind == "comment", Imagination.status == "visible")
    comments, comments_prev = window(Imagination.created_at, *comment_where)
    blend_where = (Imagination.kind == "blend", Imagination.status == "visible")
    blends, _ = window(Imagination.created_at, *blend_where)
    new_users, new_users_prev = window(User.created_at)

    def active(s, e) -> int:
        q = [
            select(Imagination.author_id).where(
                Imagination.created_at >= s, Imagination.created_at < e
            ),
            select(Thunder.user_id).where(Thunder.created_at >= s, Thunder.created_at < e),
            select(Wave.user_id).where(Wave.created_at >= s, Wave.created_at < e),
        ]
        ids: set[int] = set()
        for stmt in q:
            ids.update(db.scalars(stmt))
        return len(ids)

    signals = tech_signals(f)
    new_tech = sum(1 for at in f.first_seen.values() if start <= at < end)
    prev_first = (
        sum(1 for at in f.first_seen.values() if prev_start <= at < start) if p.has_prev else None
    )

    kpis = [
        Kpi(
            key="posts",
            label="올라온 상상",
            value=len(f.posts),
            prev=len(f.prev) if p.has_prev else None,
            series=series(p, [x.created_at for x in f.posts]),
        ),
        Kpi(
            key="active",
            label="활동한 Dreamer",
            value=active(start, end),
            prev=active(prev_start, start) if p.has_prev else None,
            unit="명",
            series=[],
        ),
        Kpi(
            key="thunders",
            label="Thunder",
            value=len(thunders),
            prev=thunders_prev,
            series=series(p, thunders),
        ),
        Kpi(key="waves", label="Wave", value=len(waves), prev=waves_prev, series=series(p, waves)),
        Kpi(
            key="comments",
            label="댓글",
            value=len(comments),
            prev=comments_prev,
            series=series(p, comments),
        ),
        Kpi(
            key="new_tech",
            label="새로 등장한 기술",
            value=new_tech,
            prev=prev_first,
            unit="개",
            series=series(p, [at for at in f.first_seen.values()]),
        ),
        Kpi(
            key="new_users",
            label="새 Dreamer",
            value=len(new_users),
            prev=new_users_prev,
            unit="명",
            series=series(p, new_users),
        ),
    ]

    by_domain = defaultdict(list)
    for x in f.posts:
        by_domain[x.domain].append(x.created_at)
    prev_domain = Counter(x.domain for x in f.prev)
    domains = [
        DomainRow(
            slug=slug,
            name=name,
            count=len(by_domain[slug]),
            prev=prev_domain.get(slug, 0) if p.has_prev else None,
            series=series(p, by_domain[slug]),
        )
        for slug, name in f.domains
    ]
    tagged = sum(1 for x in f.posts if x.techs)
    return OverviewOut(
        period=period_out(p),
        kpis=kpis,
        domains=domains,
        activity={
            "posts": series(p, [x.created_at for x in f.posts]),
            "thunders": series(p, thunders),
            "waves": series(p, waves),
            "comments": series(p, comments),
            "blends": series(p, blends),
        },
        events=events(db, p),
        signals=_rising_first(signals, limit=60),
        tagged_ratio=round(tagged / len(f.posts), 3) if f.posts else 0.0,
    )


# ---------------------------------------------------------------- 교차: 분야 × 기술 × 욕망

# 화면 그래프 설정으로 고를 수 있는 최대값 (기본 표시 수는 화면이 정함, 2026-11-13)
SANKEY_TECH = 20
SANKEY_DESIRE = 15
NET_TECH = 40
NET_DESIRE = 20
NET_EDGES = 600
MATRIX = 15


def cross(db: Session, period: Period) -> CrossOut:
    f = load_frame(db, period)
    names = dict(f.domains)
    tech_count = Counter(label for x in f.posts for _, label in set(x.techs))
    desire_count = Counter(label for x in f.posts for _, label in set(x.desires))
    tech_thunder: Counter[str] = Counter()
    desire_thunder: Counter[str] = Counter()
    for x in f.posts:
        for _, label in set(x.techs):
            tech_thunder[label] += x.thunders
        for _, label in set(x.desires):
            desire_thunder[label] += x.thunders

    # 생키: 분야 → 기술 → 욕망 (같은 상상에 함께 나온 수)
    top_t = [t for t, _ in tech_count.most_common(SANKEY_TECH)]
    top_d = [d for d, _ in desire_count.most_common(SANKEY_DESIRE)]
    dt: Counter[tuple[str, str]] = Counter()
    td: Counter[tuple[str, str]] = Counter()
    for x in f.posts:
        techs = {label for _, label in x.techs if label in top_t}
        desires = {label for _, label in x.desires if label in top_d}
        for t in techs:
            dt[(x.domain, t)] += 1
            for d in desires:
                td[(t, d)] += 1
    links = [SankeyLink(source=f"d:{a}", target=f"t:{b}", value=v) for (a, b), v in dt.items()]
    links += [SankeyLink(source=f"t:{a}", target=f"x:{b}", value=v) for (a, b), v in td.items()]
    used = {lk.source for lk in links} | {lk.target for lk in links}
    dom_val = Counter()
    for (a, _), v in dt.items():
        dom_val[a] += v
    nodes = [
        SankeyNode(id=f"d:{slug}", label=names[slug], column=0, value=dom_val[slug])
        for slug, _ in f.domains
        if f"d:{slug}" in used
    ]
    nodes += [
        SankeyNode(id=f"t:{t}", label=t, column=1, value=tech_count[t])
        for t in top_t
        if f"t:{t}" in used
    ]
    nodes += [
        SankeyNode(id=f"x:{d}", label=d, column=2, value=desire_count[d])
        for d in top_d
        if f"x:{d}" in used
    ]

    # 네트워크: 기술 · 욕망 태그가 같은 상상에 함께 나오면 연결
    net_t = {t for t, _ in tech_count.most_common(NET_TECH)}
    net_d = {d for d, _ in desire_count.most_common(NET_DESIRE)}
    edges: Counter[tuple[str, str]] = Counter()
    for x in f.posts:
        ids = sorted(
            {f"t:{label}" for _, label in x.techs if label in net_t}
            | {f"x:{label}" for _, label in x.desires if label in net_d}
        )
        for a, b in combinations(ids, 2):
            edges[(a, b)] += 1
    net_edges = [
        NetEdge(source=a, target=b, weight=w) for (a, b), w in edges.most_common(NET_EDGES)
    ]
    net_nodes = [
        NetNode(id=f"t:{t}", label=t, type="tech", count=tech_count[t], thunders=tech_thunder[t])
        for t in net_t
    ] + [
        NetNode(
            id=f"x:{d}", label=d, type="desire", count=desire_count[d], thunders=desire_thunder[d]
        )
        for d in net_d
    ]
    net_nodes.sort(key=lambda n: -n.count)

    # 욕망 × 기술 표
    rows = [d for d, _ in desire_count.most_common(MATRIX)]
    cols = [t for t, _ in tech_count.most_common(MATRIX)]
    cell: dict[tuple[str, str], list[int]] = defaultdict(lambda: [0, 0])
    for x in f.posts:
        for _, d in set(x.desires):
            for _, t in set(x.techs):
                c = cell[(d, t)]
                c[0] += 1
                c[1] += x.thunders
    matrix = [
        [MatrixCell(count=cell[(d, t)][0], thunders=cell[(d, t)][1]) for t in cols] for d in rows
    ]

    # 기술 조합 (같은 상상에 함께 붙은 기술 쌍)
    def pair_counts(posts: list[Post]) -> tuple[Counter, Counter]:
        n: Counter[tuple[str, str]] = Counter()
        th: Counter[tuple[str, str]] = Counter()
        for x in posts:
            for a, b in combinations(sorted({label for _, label in x.techs}), 2):
                n[(a, b)] += 1
                th[(a, b)] += x.thunders
        return n, th

    cur_pairs, pair_th = pair_counts(f.posts)
    prev_pairs, _ = pair_counts(f.prev)
    pairs = [
        PairRow(
            a=a,
            b=b,
            count=n,
            prev=prev_pairs.get((a, b), 0) if period.has_prev else None,
            thunders=pair_th[(a, b)],
        )
        for (a, b), n in sorted(cur_pairs.items(), key=lambda kv: (-kv[1], -pair_th[kv[0]]))[:20]
    ]

    prev_desire = Counter(label for x in f.prev for _, label in set(x.desires))
    desire_techs: dict[str, Counter] = defaultdict(Counter)
    for x in f.posts:
        for _, d in set(x.desires):
            for _, t in set(x.techs):
                desire_techs[d][t] += 1
    desires = [
        DesireRow(
            label=d,
            count=n,
            prev=prev_desire.get(d, 0) if period.has_prev else None,
            thunders=desire_thunder[d],
            thunder_avg=round(desire_thunder[d] / n, 2),
            techs=[t for t, _ in desire_techs[d].most_common(3)],
        )
        for d, n in desire_count.most_common(30)
    ]

    return CrossOut(
        period=period_out(period),
        sankey_nodes=nodes,
        sankey_links=links,
        net_nodes=net_nodes,
        net_edges=net_edges,
        matrix_rows=rows,
        matrix_cols=cols,
        matrix=matrix,
        pairs=pairs,
        desires=desires,
    )
