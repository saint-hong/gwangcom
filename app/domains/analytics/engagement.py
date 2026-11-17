"""analytics.engagement — 반응 순위 · 질문형 비율 · 활동 시간 패턴 · Shake it · AI 사용량."""

from collections import Counter, defaultdict
from dataclasses import replace
from datetime import datetime, timedelta
from math import erf, sqrt
from statistics import median

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domains.analytics.frame import PUBLIC_KINDS, load_posts, series
from app.domains.analytics.insights import events, period_out
from app.domains.analytics.period import Period
from app.domains.analytics.schemas import (
    AiFeatureRow,
    AiOut,
    EngagementOut,
    MaterialRow,
    PromptRow,
    ShakeOut,
    TopPost,
)
from app.domains.imaginations.models import Imagination
from app.domains.prompts.models import Prompt
from app.domains.reactions.models import Bookmark, ReactionEvent, Thunder, Wave
from app.domains.shake.models import ImaginationParent, ShakeAttempt
from app.domains.tags.models import Domain, ImaginationTag, Tag
from app.domains.users.models import User
from app.infrastructure.core.config import get_settings
from app.infrastructure.llm.models import LlmCall
from app.infrastructure.llm.router import calls_today, route
from app.shared.time import KST, now_utc

TOP = 30
# Thunder 분포 칸 (2026-11-16): 0 부터 실제 최댓값까지 하나씩(최소 0~5), 최댓값이 BIN_LAST 를 넘으면 마지막 칸 = "BIN_LAST+"
BIN_LAST = 15


def thunder_histogram(
    values: list[int],
) -> tuple[list[tuple[str, int]], list[float], float, float, float]:
    """받은 Thunder 수별 상상 수 + 같은 평균 · 표준편차의 정규분포라면 칸마다 있을 상상 수 + 평균 · 중앙값 · 표준편차.
    정수 k 칸 = k-0.5 ~ k+0.5 넓이 × 상상 수. 0 칸은 왼쪽 끝까지, 마지막 칸은 오른쪽 끝까지 포함한다.
    분포 모양을 보는 기준선일 뿐 판단이 아니다 (원칙 4)."""
    top = min(BIN_LAST, max([5, *values]))
    bins = [(str(k), k, k) for k in range(top)]
    bins.append(
        (f"{top}+" if top == BIN_LAST and max(values, default=0) > top else str(top), top, 10**9)
    )
    hist = [(label, sum(1 for v in values if lo <= v <= hi)) for label, lo, hi in bins]
    n = len(values)
    if n == 0:
        return hist, [0.0] * len(bins), 0.0, 0.0, 0.0
    mean = sum(values) / n
    sd = (sum((v - mean) ** 2 for v in values) / n) ** 0.5
    if sd == 0:
        exp = [float(n) if lo <= mean <= hi else 0.0 for _, lo, hi in bins]
    else:

        def cdf(x: float) -> float:
            return 0.5 * (1 + erf((x - mean) / (sd * sqrt(2))))

        exp = []
        for i, (_, lo, hi) in enumerate(bins):
            a = 0.0 if i == 0 else cdf(lo - 0.5)
            b = 1.0 if i == len(bins) - 1 else cdf(hi + 0.5)
            exp.append(round(n * (b - a), 2))
    return hist, exp, round(mean, 2), float(median(values)), round(sd, 2)


def _title(title: str | None, body: str) -> str:
    return title or (body[:40] + ("…" if len(body) > 40 else ""))


def _top_union(top: list[TopPost]) -> list[TopPost]:
    """반응 순위: 기준(합계 · Thunder · Wave · 북마크 · 인용)마다 상위 TOP 개를 모아 보낸다.
    화면에서 머리글로 기준을 바꿔 정렬해도 그 기준의 진짜 상위가 빠지지 않게 (2026-11-16)."""
    keep: dict[int, TopPost] = {}
    for key in ("total", "thunders", "waves", "bookmarks", "quotes"):
        for t in sorted(top, key=lambda t: (-getattr(t, key), -t.total, -t.id))[:TOP]:
            if getattr(t, key) > 0 or key == "total":
                keep[t.id] = t
    return sorted(keep.values(), key=lambda t: (-t.total, -t.thunders, -t.id))


def engagement(db: Session, p: Period) -> EngagementOut:
    start, end = p.start_utc, p.end_utc
    posts = load_posts(db, start, end)

    # 반응 순위: 이 기간에 받은 반응 (Thunder · Wave · 북마크 · 인용)
    got: dict[int, Counter] = defaultdict(Counter)
    for name, model in (("thunders", Thunder), ("waves", Wave), ("bookmarks", Bookmark)):
        rows = db.execute(
            select(model.imagination_id, func.count())
            .where(model.created_at >= start, model.created_at < end)
            .group_by(model.imagination_id)
        ).all()
        for iid, n in rows:
            got[iid][name] = n
    for iid, n in db.execute(
        select(Imagination.quoted_id, func.count())
        .where(
            Imagination.kind == "quote",
            Imagination.status == "visible",
            Imagination.created_at >= start,
            Imagination.created_at < end,
        )
        .group_by(Imagination.quoted_id)
    ).all():
        if iid is not None:
            got[iid]["quotes"] = n
    top: list[TopPost] = []
    desires_of: dict[int, list[str]] = defaultdict(list)
    if got:
        info = {
            r[0]: r
            for r in db.execute(
                select(
                    Imagination.id,
                    Imagination.title,
                    Imagination.body,
                    User.nickname,
                    Domain.slug,
                    Imagination.created_at,
                    Imagination.prompt_id,
                )
                .join(User, User.id == Imagination.author_id)
                .join(Domain, Domain.id == Imagination.domain_id)
                .where(
                    Imagination.id.in_(got.keys()),
                    Imagination.kind.in_(PUBLIC_KINDS),
                    Imagination.status == "visible",
                )
            ).all()
        }
        for iid, c in got.items():
            if iid not in info:
                continue
            _, title, body, nick, slug, at, prompt_id = info[iid]
            top.append(
                TopPost(
                    id=iid,
                    title=_title(title, body),
                    author=nick,
                    domain=slug,
                    created_at=at.astimezone(KST).date(),
                    thunders=c["thunders"],
                    waves=c["waves"],
                    bookmarks=c["bookmarks"],
                    quotes=c["quotes"],
                    total=sum(c.values()),
                    prompt=prompt_id is not None,
                )
            )
        top = _top_union(top)
        # 욕망 태그 (태그 id 순, 지운 태그 제외)
        for iid, label in db.execute(
            select(ImaginationTag.imagination_id, Tag.label)
            .join(Tag, Tag.id == ImaginationTag.tag_id)
            .where(
                ImaginationTag.imagination_id.in_([t.id for t in top]),
                ImaginationTag.removed_at.is_(None),
                Tag.type == "desire",
            )
            .order_by(ImaginationTag.imagination_id, Tag.id)
        ).all():
            desires_of[iid].append(label)
        for t in top:
            t.desires = desires_of.get(t.id, [])

    histogram, normal, t_mean, t_median, t_sd = thunder_histogram([x.thunders for x in posts])

    # 요일 × 시간 (한국 시간): 글 쓰기 · 반응 켜기
    punch_posts = [[0] * 24 for _ in range(7)]
    for at in db.scalars(
        select(Imagination.created_at).where(
            Imagination.status == "visible",
            Imagination.created_at >= start,
            Imagination.created_at < end,
        )
    ):
        k = at.astimezone(KST)
        punch_posts[k.weekday()][k.hour] += 1
    punch_reactions = [[0] * 24 for _ in range(7)]
    for at in db.scalars(
        select(ReactionEvent.created_at).where(
            ReactionEvent.on.is_(True),
            ReactionEvent.created_at >= start,
            ReactionEvent.created_at < end,
        )
    ):
        k = at.astimezone(KST)
        punch_reactions[k.weekday()][k.hour] += 1

    # 칸마다 활동한 Dreamer (글 · 반응)
    active: list[set[int]] = [set() for _ in p.buckets]
    for uid, at in db.execute(
        select(Imagination.author_id, Imagination.created_at).where(
            Imagination.created_at >= start, Imagination.created_at < end
        )
    ):
        i = p.index_of(at)
        if i is not None:
            active[i].add(uid)
    for uid, at in db.execute(
        select(ReactionEvent.user_id, ReactionEvent.created_at).where(
            ReactionEvent.created_at >= start, ReactionEvent.created_at < end
        )
    ):
        i = p.index_of(at)
        if i is not None:
            active[i].add(uid)

    # 질문형 vs 자유 상상 (원본만 — 인용은 질문에 답할 수 없다)
    originals = [x for x in posts if x.kind == "original"]
    answered = [x for x in originals if x.prompt_id is not None]
    free = [x for x in originals if x.prompt_id is None]
    by_prompt: dict[int, list] = defaultdict(list)
    for x in answered:
        by_prompt[x.prompt_id].append(x)  # type: ignore[index]
    prompt_rows = []
    for pr in db.scalars(
        select(Prompt)
        .where(Prompt.starts_at < end, (Prompt.ends_at.is_(None)) | (Prompt.ends_at >= start))
        .order_by(Prompt.starts_at.desc())
    ):
        xs = by_prompt.get(pr.id, [])
        prompt_rows.append(
            PromptRow(
                id=pr.id,
                title=pr.title,
                starts_at=pr.starts_at.astimezone(KST).date(),
                ends_at=pr.ends_at.astimezone(KST).date() if pr.ends_at else None,
                answers=len(xs),
                answerers=len({x.author_id for x in xs}),
                thunder_avg=round(sum(x.thunders for x in xs) / len(xs), 2) if xs else 0.0,
            )
        )

    return EngagementOut(
        period=period_out(p),
        top=top,
        histogram=histogram,
        histogram_normal=normal,
        thunder_mean=t_mean,
        thunder_median=t_median,
        thunder_sd=t_sd,
        punch_posts=punch_posts,
        punch_reactions=punch_reactions,
        active_users=[len(s) for s in active],
        prompt_series=series(p, [x.created_at for x in answered]),
        free_series=series(p, [x.created_at for x in free]),
        prompts=prompt_rows,
        free_thunder_avg=round(sum(x.thunders for x in free) / len(free), 2) if free else 0.0,
        events=events(db, p),
    )


# ---------------------------------------------------------------- Shake it (놀이 영역 — 대중 상상 지표와 따로)

SYNERGY_DAYS = 7  # 조합 시너지: 게시 후 같은 기간(최대 7일) 동안 받은 Thunder 로 비교


def _synergy(
    db: Session, blends: list, parents: dict, mat_info: dict
) -> tuple[float | None, int, int]:
    """조합 시너지 (2026-11-17 사용자 결정) — 혼합 글마다 자기 재료와 비교한 Thunder 차이의 평균.

    - 차이 = 혼합 글이 받은 Thunder − 재료 글(평균)이 받은 Thunder
    - 둘 다 "게시 후 같은 기간" 동안 받은 수: 기간 = min(7일, 혼합 글이 올라온 뒤 지난 시간).
      재료가 먼저 올라와 Thunder 를 받을 시간이 더 길었던 치우침을 없앤다
    - 비율이 아니라 차이: 재료 Thunder 0 으로 나누는 문제가 없고, 늘고 준 것이 공평하게 상쇄된다
    - 돌려줌: (평균 차이, 재료보다 많이 받은 혼합 글 수, 비교한 혼합 글 수)
    """
    now = now_utc()
    pairs = [(b, [m for m in parents.get(b.id, []) if m in mat_info]) for b in blends]
    pairs = [(b, mats) for b, mats in pairs if mats]
    if not pairs:
        return None, 0, 0
    ids = {b.id for b, _ in pairs} | {m for _, mats in pairs for m in mats}
    got: dict[int, list[datetime]] = defaultdict(list)
    for iid, at in db.execute(
        select(Thunder.imagination_id, Thunder.created_at).where(Thunder.imagination_id.in_(ids))
    ):
        got[iid].append(at)

    def within(iid: int, start: datetime, span: timedelta) -> int:
        return sum(1 for t in got[iid] if start <= t < start + span)

    diffs = []
    for b, mats in pairs:
        span = min(timedelta(days=SYNERGY_DAYS), now - b.created_at)
        mine = within(b.id, b.created_at, span)
        base = sum(within(m, mat_info[m][7], span) for m in mats) / len(mats)
        diffs.append(mine - base)
    return round(sum(diffs) / len(diffs), 2), sum(1 for d in diffs if d > 0), len(diffs)


def shake(db: Session, p: Period) -> ShakeOut:
    start, end = p.start_utc, p.end_utc
    attempts = dict(
        db.execute(
            select(ShakeAttempt.status, func.count())
            .where(ShakeAttempt.created_at >= start, ShakeAttempt.created_at < end)
            .group_by(ShakeAttempt.status)
        ).all()
    )
    ms = [
        m
        for m in db.scalars(
            select(ShakeAttempt.selection_ms).where(
                ShakeAttempt.created_at >= start,
                ShakeAttempt.created_at < end,
                ShakeAttempt.selection_ms.is_not(None),
            )
        )
    ]
    blends = db.execute(
        select(
            Imagination.id, Imagination.created_at, Imagination.status, Imagination.thunder_count
        ).where(
            Imagination.kind == "blend",
            Imagination.created_at >= start,
            Imagination.created_at < end,
        )
    ).all()
    visible = [b for b in blends if b.status == "visible"]
    ids = [b.id for b in visible]

    # 재료 · 계보
    parents: dict[int, list[int]] = defaultdict(list)
    for child, parent in db.execute(
        select(ImaginationParent.child_id, ImaginationParent.parent_id)
    ):
        parents[child].append(parent)
    depth_memo: dict[int, int] = {}

    def depth(i: int, seen: frozenset = frozenset()) -> int:
        if i in depth_memo:
            return depth_memo[i]
        if i not in parents or i in seen:
            return 0
        d = 1 + max(depth(x, seen | {i}) for x in parents[i])
        depth_memo[i] = d
        return d

    depths = Counter(depth(i) for i in ids)
    material_ids = [m for i in ids for m in parents.get(i, [])]
    mat_info = {
        r[0]: r
        for r in db.execute(
            select(
                Imagination.id,
                Imagination.title,
                Imagination.body,
                Imagination.thunder_count,
                Domain.name,
                Domain.slug,
                User.nickname,
                Imagination.created_at,
            )
            .join(Domain, Domain.id == Imagination.domain_id)
            .join(User, User.id == Imagination.author_id)
            .where(Imagination.id.in_(set(material_ids) or {0}))
        ).all()
    }
    used = Counter(material_ids)
    # 재료 상상 표 (2026-11-17): 분야 · 작성자 · 게시일 · Thunder(지금까지) 칸
    materials = [
        MaterialRow(
            id=mid,
            title=_title(mat_info[mid][1], mat_info[mid][2]),
            domain=mat_info[mid][5],
            author=mat_info[mid][6],
            created_at=mat_info[mid][7].astimezone(KST).date(),
            uses=n,
            thunders=mat_info[mid][3],
        )
        for mid, n in used.most_common(20)
        if mid in mat_info
    ]
    pair_counter: Counter[tuple[str, str]] = Counter()
    for i in ids:
        doms = sorted(mat_info[m][4] for m in parents.get(i, []) if m in mat_info)
        if len(doms) == 2:
            pair_counter[(doms[0], doms[1])] += 1
    mat_thunders = [mat_info[m][3] for m in material_ids if m in mat_info]
    synergy_diff, synergy_beat, synergy_n = _synergy(db, visible, parents, mat_info)
    return ShakeOut(
        period=period_out(p),
        attempts=attempts,
        series=series(p, [b.created_at for b in visible]),
        blends=len(visible),
        deleted=sum(1 for b in blends if b.status == "deleted"),
        blend_thunder_avg=round(sum(b.thunder_count for b in visible) / len(visible), 2)
        if visible
        else 0.0,
        material_thunder_avg=round(sum(mat_thunders) / len(mat_thunders), 2)
        if mat_thunders
        else 0.0,
        domain_pairs=[(a, b, n) for (a, b), n in pair_counter.most_common(20)],
        materials=materials,
        depths=sorted(depths.items()),
        synergy_diff=synergy_diff,
        synergy_beat=synergy_beat,
        synergy_n=synergy_n,
        selection_ms_median=int(median(ms)) if ms else None,
    )


# ---------------------------------------------------------------- AI 사용량

FEATURES = [
    "tagging",
    "shake",
    "similar_rerank",
    "user_summary",
    "reaction_summary",
    "note_summary",
    "note_draft",
    "embedding",
]


def ai(db: Session, p: Period) -> AiOut:
    start, end = p.start_utc, p.end_utc
    s = get_settings()
    rows = db.execute(
        select(
            LlmCall.feature,
            LlmCall.status,
            LlmCall.input_tokens,
            LlmCall.output_tokens,
            LlmCall.est_cost_usd,
            LlmCall.latency_ms,
            LlmCall.created_at,
            LlmCall.provider,
            LlmCall.model,
        ).where(LlmCall.created_at >= start, LlmCall.created_at < end)
    ).all()
    agg: dict[str, dict] = {}
    by_feature_times: dict[str, list] = defaultdict(list)
    cost = [0.0] * len(p.buckets)
    for feat, status, inp, out, c, lat, at, prov, model in rows:
        a = agg.setdefault(
            feat,
            {
                "calls": 0,
                "failed": 0,
                "in": 0,
                "out": 0,
                "cost": 0.0,
                "lat": 0,
                "prov": prov,
                "model": model,
            },
        )
        a["calls"] += 1
        a["failed"] += status != "success"
        a["in"] += inp
        a["out"] += out
        a["cost"] += float(c)
        a["lat"] += lat
        by_feature_times[feat].append(at)
        i = p.index_of(at)
        if i is not None:
            cost[i] += float(c)
    # 서비스 기능은 호출이 없어도 지금 설정을 보여 준다 (note_draft 는 6-E 부터). 그 밖(eval_*)은 호출이 있을 때만
    names = [f for f in FEATURES if f in agg or f != "note_draft"] + sorted(
        f for f in agg if f not in FEATURES
    )
    features = []
    for f in names:
        a = agg.get(f)
        if f == "embedding":
            prov, model = s.embedding_provider, s.embedding_model
        elif f in (
            "tagging",
            "shake",
            "note_draft",
            "similar_rerank",
            "user_summary",
            "reaction_summary",
            "note_summary",
        ):
            prov, model = route(f)  # type: ignore[arg-type]
        else:
            prov, model = (a["prov"], a["model"]) if a else ("", "")
        features.append(
            AiFeatureRow(
                feature=f,
                provider=prov,
                model=model,
                calls=a["calls"] if a else 0,
                failed=a["failed"] if a else 0,
                input_tokens=a["in"] if a else 0,
                output_tokens=a["out"] if a else 0,
                cost_usd=round(a["cost"], 4) if a else 0.0,
                latency_ms_avg=int(a["lat"] / a["calls"]) if a and a["calls"] else 0,
            )
        )
    # 기능별 호출 흐름은 긴 기간도 하루 칸으로 (2026-11-17 사용자 요청: 90일에서도 모든 날짜, 화면은 좌우 스크롤)
    daily = replace(
        p,
        unit="day",
        buckets=tuple(p.start + timedelta(days=i) for i in range(p.days)),
    )
    return AiOut(
        period=period_out(p),
        features=features,
        series={f: series(p, by_feature_times[f]) for f in names},
        daily_buckets=list(daily.buckets),
        daily_series={f: series(daily, by_feature_times[f]) for f in names},
        cost_series=[round(c, 4) for c in cost],
        today_calls=calls_today(db),
        daily_limit=s.llm_daily_call_limit,
    )
