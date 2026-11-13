"""analytics.engagement — 반응 순위 · 질문형 비율 · 활동 시간 패턴 · Shake it · AI 사용량."""

from collections import Counter, defaultdict
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
    PromptRow,
    ShakeOut,
    TopPost,
)
from app.domains.imaginations.models import Imagination
from app.domains.prompts.models import Prompt
from app.domains.reactions.models import Bookmark, ReactionEvent, Thunder, Wave
from app.domains.shake.models import ImaginationParent, ShakeAttempt
from app.domains.tags.models import Domain
from app.domains.users.models import User
from app.infrastructure.core.config import get_settings
from app.infrastructure.llm.models import LlmCall
from app.infrastructure.llm.router import calls_today, route
from app.shared.time import KST

TOP = 30
BINS = [("0", 0, 0), ("1", 1, 1), ("2", 2, 2), ("3~4", 3, 4), ("5~9", 5, 9), ("10+", 10, 10**9)]


def _title(title: str | None, body: str) -> str:
    return title or (body[:40] + ("…" if len(body) > 40 else ""))


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
        top.sort(key=lambda t: (-t.total, -t.thunders, -t.id))

    histogram = [(label, sum(1 for x in posts if lo <= x.thunders <= hi)) for label, lo, hi in BINS]

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
        top=top[:TOP],
        histogram=histogram,
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
            )
            .join(Domain, Domain.id == Imagination.domain_id)
            .where(Imagination.id.in_(set(material_ids) or {0}))
        ).all()
    }
    used = Counter(material_ids)
    materials = [
        (mid, _title(mat_info[mid][1], mat_info[mid][2]), n)
        for mid, n in used.most_common(20)
        if mid in mat_info
    ]
    pair_counter: Counter[tuple[str, str]] = Counter()
    for i in ids:
        doms = sorted(mat_info[m][4] for m in parents.get(i, []) if m in mat_info)
        if len(doms) == 2:
            pair_counter[(doms[0], doms[1])] += 1
    mat_thunders = [mat_info[m][3] for m in material_ids if m in mat_info]
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
        selection_ms_median=int(median(ms)) if ms else None,
    )


# ---------------------------------------------------------------- AI 사용량

FEATURES = ["tagging", "shake", "similar_rerank", "user_summary", "note_draft", "embedding"]


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
        elif f in ("tagging", "shake", "note_draft", "similar_rerank", "user_summary"):
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
    return AiOut(
        period=period_out(p),
        features=features,
        series={f: series(p, by_feature_times[f]) for f in names},
        cost_series=[round(c, 4) for c in cost],
        today_calls=calls_today(db),
        daily_limit=s.llm_daily_call_limit,
    )
