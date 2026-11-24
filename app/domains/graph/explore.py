"""상상 네트워크 탐색기 질의 (기획안 v12 F22 — 2026-11-20 사용자 결정으로 다시 짬, v13 5장).

목적 (사업 기획 통합 문서): 상상 하나하나가 아니라 **모인 상상**에서 방향 · 욕망의 벡터를 본다.
"상상이 기술을 밀어내는 압력장", "범용 기술들의 충돌", "형태 붕괴 신호"를 운영자가 직접 찾아 Observe Note 근거로 쓴다.
대시보드가 "무슨 신호가 떴나"(숫자 · 순위)라면, 탐색기는 "그 신호가 어떤 상상 · 사람 · 변형 · 확산으로 이뤄졌나"를 따라간다.

보기 네 개
  ① 융합과 충돌   기술 × 욕망 묶음 2부 그래프. 분야가 다른 기술이 같은 상상에 함께 나오면 "기술 충돌" 선
  ② 집단 압력 지도 상상 임베딩의 평면 지도(t-SNE · UMAP) + 압력장(서로 다른 Dreamer 의 비슷한 상상 덩어리)
  ③ 변이와 진화   Shake it 계보 숲 (재료 → 혼합 → 다시 혼합) + 조합 시너지 · 분야를 넘는 혼합
  ④ 전파와 공명   Wave 확산 경로 (작성자 → Wave → 그 Wave 를 보고 한 Wave …)

원칙 4: 모든 이름 · 숫자는 계산 규칙이다. "충돌" = 분야가 다른 두 기술이 상상 2개 이상에 함께 나옴,
"압력장" 이름 = 핵심 주제 × 핵심 욕망. 붕괴인지 아닌지의 해석은 운영자가 한다. AI 는 임베딩만 만든다.
원칙 3: 혼합 글은 ③ 을 빼고 기본으로 뺀다 (운영자가 켜면 넣는다).
"""

from collections import Counter, defaultdict
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domains.analytics.clusters import cluster_name, louvain
from app.domains.analytics.insights import COOLING, RISING, RISING_MIN
from app.domains.graph import semantic
from app.domains.graph.build import GRAPH_KINDS
from app.domains.graph.models import GraphSyncLog, TagEmbedding
from app.domains.graph.schemas import (
    CascadeNode,
    CascadeOut,
    CascadeSummary,
    FusionEdge,
    FusionNode,
    FusionOut,
    GraphStatusOut,
    Inspect,
    ItemCard,
    LastBuild,
    LineageNode,
    LineageOut,
    LineageTree,
    MapOut,
    MapPoint,
    MapZone,
    NodeLinks,
    SearchHit,
    TagCount,
    Trend,
)
from app.domains.imaginations.models import Imagination
from app.domains.search.service import ESC, _like, _text_ids, clean_query
from app.domains.similar.models import ImaginationEmbedding, SimilarSet
from app.domains.similar.service import KINDS as SIMILAR_KINDS
from app.domains.tags.models import ImaginationTag, Tag
from app.domains.tags.service import ACTIVE, to_name
from app.infrastructure import graph
from app.shared.errors import bad_request, not_found

EDGE_MIN = 2  # 선이 되려면 함께 쓰인 상상 2개 이상
TECHS_DEFAULT = 12
DESIRES_DEFAULT = 8
EXPAND_MAX = 6  # 펼치기(2단계 이웃)로 더하는 점
INSPECT_ITEMS = 30
ZONE_MIN = 3  # 압력장 = 상상 3개 이상
ZONE_DREAMERS_MIN = 2  # 서로 다른 Dreamer 2명 이상
ZONE_MIN_SCORE = (
    0.92  # 압력장을 만드는 비슷한 상상 연결 점수 (2026-11-19 실측 — 경향 다발과 같은 기준)
)
UNNAMED_SHARE = 0.5  # 1위 주제가 압력장의 절반 미만에만 붙음 = 주제는 제각각 (아직 이름 없는 경향)
UNNAMED_MIN = 4
LINEAGE_TREES = 12
CASCADES_MAX = 30
SEARCH_MAX = 5
EXCERPT = 160


@dataclass(frozen=True)
class Filter:
    """기간(초 단위) · 분야 · 혼합 글 포함 여부 — 상상 점에만 건다."""

    since: int
    until: int
    domain: str | None = None
    blend: bool = False

    def params(self) -> dict:
        return {
            "since": self.since,
            "until": self.until,
            "domain": self.domain,
            "blend": self.blend,
        }

    @property
    def mid(self) -> int:
        return self.since + (self.until - self.since) // 2


def _where(v: str) -> str:
    """Cypher: 상상 점 v 가 거르기 조건에 맞는가."""
    return (
        f"{v}.created >= $since AND {v}.created < $until "
        f"AND ($domain IS NULL OR {v}.domain = $domain OR {v}.domain2 = $domain) "
        f"AND ($blend OR {v}.kind <> 'blend')"
    )


def _dt(sec: int) -> datetime:
    return datetime.fromtimestamp(sec, UTC)


def _signal(
    recent: int, earlier: int, r_total: int, e_total: int
) -> tuple[str, float | None, float]:
    """기간 앞 절반 → 뒤 절반의 비중 변화. 대시보드 기술 신호와 같은 기준 (1.5배 · 2/3, 3개 이상).

    → (신호, 비중 증감, 쏠림 0~1). 비중으로 보는 이유: 서비스가 커지는 동안 개수로 보면 모두 "늘어남"이 된다.
    """
    rs = recent / r_total if r_total else 0.0
    es = earlier / e_total if e_total else 0.0
    trend = rs / (rs + es) if rs + es > 0 else 0.5
    if earlier == 0:
        return "new", None, 1.0
    growth = rs / es - 1 if es > 0 else None
    if growth is not None and growth + 1 >= RISING and recent >= RISING_MIN:
        return "rising", growth, trend
    if growth is not None and growth + 1 < COOLING:
        return "cooling", growth, trend
    return "steady", growth, trend


# ---------------------------------------------------------------- 재료 불러오기 (Memgraph)


@dataclass
class Loaded:
    """기간 · 분야 안의 상상과 태그 (한 번 불러와 보기마다 계산)."""

    f: Filter
    items: dict[int, dict[str, Any]] = field(default_factory=dict)
    tags: dict[int, list[dict[str, Any]]] = field(default_factory=dict)
    e_total: int = 0
    r_total: int = 0

    def trend(self, ids: set[int] | list[int]) -> Trend:
        mid = self.f.mid
        recent = sum(1 for i in ids if self.items[i]["created"] >= mid)
        earlier = len(ids) - recent
        signal, growth, _ = _signal(recent, earlier, self.r_total, self.e_total)
        return Trend(
            signal=signal,  # type: ignore[arg-type]
            growth=round(growth, 3) if growth is not None else None,
            recent=recent,
            earlier=earlier,
        )


_LOAD = (
    # Memgraph 는 map 을 묶음 기준으로 쓰면 줄마다 따로 묶는다 → 점(i)으로 먼저 묶는다
    "MATCH (i:Imagination) WHERE {where} "
    "OPTIONAL MATCH (i)-[:HAS_TAG]->(t:Tag) "
    "WITH i, collect({type: t.type, name: t.name, label: t.label, cluster: t.cluster, "
    "cluster_label: t.cluster_label}) AS tags "
    "RETURN {id: i.id, kind: i.kind, title: i.title, author: i.author, author_id: i.author_id, "
    "domain: i.domain, domain2: i.domain2, created: i.created, thunders: i.thunders, "
    "waves: i.waves, tsne_x: i.tsne_x, tsne_y: i.tsne_y, umap_x: i.umap_x, umap_y: i.umap_y} AS i, tags"
)


def load(f: Filter) -> Loaded:
    out = Loaded(f=f)
    for r in graph.run(_LOAD.replace("{where}", _where("i")), **f.params()):
        i = r["i"]
        out.items[i["id"]] = i
        tags = [t for t in r["tags"] if t and t.get("name")]
        for t in tags:
            if t["type"] == "desire" and not t.get("cluster"):
                t["cluster"], t["cluster_label"] = f"dc:{t['name']}", t["label"]
        out.tags[i["id"]] = tags
    mid = f.mid
    out.r_total = sum(1 for i in out.items.values() if i["created"] >= mid)
    out.e_total = len(out.items) - out.r_total
    return out


def _avg(values: list[int | float]) -> float:
    return round(sum(values) / len(values), 2) if values else 0.0


def _domains(items: list[dict]) -> list[TagCount]:
    c: Counter[str] = Counter()
    for i in items:
        for d in {i.get("domain"), i.get("domain2")} - {None}:
            c[d] += 1
    return [TagCount(name=d, label=d, count=n) for d, n in c.most_common()]


# ---------------------------------------------------------------- 원문 카드 (PostgreSQL)


def cards(db: Session, ids: list[int]) -> list[ItemCard]:
    """원문 상상 카드 — ids 순서대로 (반응 수는 지금 값). 숨김 · 삭제된 글은 빠진다."""
    if not ids:
        return []
    items = {
        i.id: i
        for i in db.scalars(
            select(Imagination).where(Imagination.id.in_(ids), Imagination.status == "visible")
        ).unique()
    }
    techs: dict[int, list[str]] = defaultdict(list)
    for iid, label in db.execute(
        select(ImaginationTag.imagination_id, Tag.label)
        .join(Tag, Tag.id == ImaginationTag.tag_id)
        .where(ACTIVE, Tag.type == "tech", ImaginationTag.imagination_id.in_(list(items)))
        .order_by(ImaginationTag.created_at)
    ):
        techs[iid].append(label)
    out = []
    for iid in ids:
        i = items.get(iid)
        if i is None:
            continue
        body = " ".join(i.body.split())
        out.append(
            ItemCard(
                id=i.id,
                kind=i.kind,
                title=i.display_title,
                excerpt=body[:EXCERPT] + ("…" if len(body) > EXCERPT else ""),
                desire=i.desire or None,
                author=i.author.nickname,
                author_id=i.author_id,
                domain=i.domain.slug if i.domain else None,
                domain2=i.secondary_domain.slug if i.secondary_domain else None,
                created_at=i.created_at,
                thunders=i.thunder_count,
                waves=i.wave_count,
                techs=techs[iid],
            )
        )
    return out


def _inspect(
    db: Session,
    L: Loaded,
    ids: set[int],
    title: str,
    kind: str,
    members: list[TagCount] | None = None,
    rank_pct: float | None = None,
) -> Inspect:
    rows = [L.items[i] for i in ids if i in L.items]
    order = sorted(ids, key=lambda i: (-(L.items[i]["thunders"] or 0), -L.items[i]["created"]))
    created = [r["created"] for r in rows]
    return Inspect(
        title=title,
        kind=kind,
        count=len(rows),
        thunder_avg=_avg([r["thunders"] or 0 for r in rows]),
        wave_avg=_avg([r["waves"] or 0 for r in rows]),
        dreamers=len({r["author_id"] for r in rows}),
        domains=_domains(rows),
        trend=L.trend(ids),
        rank_pct=rank_pct,
        first_at=_dt(min(created)) if created else None,
        last_at=_dt(max(created)) if created else None,
        members=members or [],
        items=cards(db, order[:INSPECT_ITEMS]),
    )


# ---------------------------------------------------------------- ① 융합과 충돌


@dataclass
class _Fusion:
    """태그별 상상 묶음 (기술 = 태그, 욕망 = 뜻이 가까운 묶음)."""

    tech: dict[str, set[int]]
    tech_label: dict[str, str]
    desire: dict[str, set[int]]
    desire_label: dict[str, str]
    desire_members: dict[str, Counter]
    clustered: bool


Clusters = dict[str, tuple[str, str]]  # 욕망 태그 name → (묶음 key, 묶음 이름)


def desire_cluster_map(db: Session, min_score: float) -> Clusters | None:
    """욕망 묶음을 기준값 min_score 로 지금 다시 계산 (화면 설정, 2026-11-20). 1 이상이면 묶지 않음.

    graph-build 때 저장한 묶음(기본 기준)과 다른 기준을 고를 때 쓴다. 태그 수가 적어 요청마다 계산해도 가볍다.
    """
    from app.domains.graph.models import TagEmbedding as TE

    used = dict(
        db.execute(
            select(Tag.name, func.count(func.distinct(ImaginationTag.imagination_id)))
            .join(ImaginationTag, ImaginationTag.tag_id == Tag.id)
            .where(ACTIVE, Tag.type == "desire")
            .group_by(Tag.name)
        ).all()
    )
    labels = dict(db.execute(select(Tag.name, Tag.label).where(Tag.type == "desire")).all())
    if min_score >= 1:
        return {n: (f"dc:{n}", labels[n]) for n in labels}
    vectors = {
        n: list(v)
        for n, v in db.execute(
            select(Tag.name, TE.embedding).join(TE, TE.tag_id == Tag.id).where(Tag.type == "desire")
        )
    }
    return semantic.desire_clusters(
        [(n, labels[n], used.get(n, 0)) for n in labels], vectors, min_score
    )


def _fusion_sets(L: Loaded, clusters: Clusters | None = None) -> _Fusion:
    tech: dict[str, set[int]] = defaultdict(set)
    tech_label: dict[str, str] = {}
    desire: dict[str, set[int]] = defaultdict(set)
    desire_label: dict[str, str] = {}
    members: dict[str, Counter] = defaultdict(Counter)
    clustered = False
    for iid, tags in L.tags.items():
        for t in tags:
            if t["type"] == "tech":
                tech[t["name"]].add(iid)
                tech_label[t["name"]] = t["label"]
            else:
                key, cl_label = (
                    clusters[t["name"]]
                    if clusters and t["name"] in clusters
                    else (t["cluster"], t["cluster_label"])
                )
                desire[key].add(iid)
                desire_label[key] = cl_label
                members[key][t["label"]] += 1
                clustered = clustered or key != f"dc:{t['name']}"
    return _Fusion(tech, tech_label, desire, desire_label, members, clustered)


def _node_id(kind: str, key: str) -> str:
    return f"t:{key}" if kind == "tech" else f"d:{key}"


def _main_domain(L: Loaded, ids: set[int]) -> str | None:
    c = Counter(L.items[i]["domain"] for i in ids if L.items[i]["domain"])
    return c.most_common(1)[0][0] if c else None


def _pairs(S: _Fusion, L: Loaded) -> dict[str, dict[tuple[str, str], set[int]]]:
    """모든 연결 후보 (함께 쓰인 상상 EDGE_MIN 개 이상) — 종류별. 순위(상위 몇 %)를 매길 때 쓴다."""
    out: dict[str, dict[tuple[str, str], set[int]]] = {
        "desire": {},
        "collision": {},
        "combo": {},
    }
    for t, ti in S.tech.items():
        for d, di in S.desire.items():
            both = ti & di
            if len(both) >= EDGE_MIN:
                out["desire"][(_node_id("tech", t), _node_id("desire", d))] = both
    techs = sorted(S.tech)
    dom = {t: _main_domain(L, S.tech[t]) for t in techs}
    for k, a in enumerate(techs):
        for b in techs[k + 1 :]:
            both = S.tech[a] & S.tech[b]
            if len(both) >= EDGE_MIN:
                kind = "collision" if dom[a] and dom[b] and dom[a] != dom[b] else "combo"
                out[kind][(_node_id("tech", a), _node_id("tech", b))] = both
    return out


def _rank_pct(pairs: dict[tuple[str, str], set[int]], key: tuple[str, str]) -> float:
    """같은 종류 연결 중 위에서 몇 % (1위 = 1/전체)."""
    sizes = sorted((len(v) for v in pairs.values()), reverse=True)
    mine = len(pairs[key])
    above = sum(1 for s in sizes if s > mine)
    return round((above + 1) / len(sizes), 3)


def _fusion_label(S: _Fusion, node_id: str) -> str:
    """화면에 쓰는 이름 — 기술은 "#이름", 욕망 묶음은 이름 그대로."""
    key = node_id[2:]
    if node_id.startswith("t:"):
        return f"#{S.tech_label.get(key, key)}"
    return S.desire_label.get(key, key)


def _fusion_node(S: _Fusion, L: Loaded, node_id: str, extra: bool = False) -> FusionNode:
    kind, key = ("tech", node_id[2:]) if node_id.startswith("t:") else ("desire", node_id[2:])
    ids = S.tech[key] if kind == "tech" else S.desire[key]
    return FusionNode(
        id=node_id,
        kind=kind,  # type: ignore[arg-type]
        label=S.tech_label[key] if kind == "tech" else S.desire_label[key],
        domain=_main_domain(L, ids) if kind == "tech" else None,
        count=len(ids),
        thunder_avg=_avg([L.items[i]["thunders"] or 0 for i in ids]),
        trend=L.trend(ids),
        members=[]
        if kind == "tech"
        else [
            TagCount(name=lb, label=lb, count=n) for lb, n in S.desire_members[key].most_common()
        ],
        extra=extra,
    )


def _ids_of(S: _Fusion, node_id: str) -> set[int]:
    if node_id.startswith("t:"):
        return S.tech.get(node_id[2:], set())
    if node_id.startswith("d:"):
        return S.desire.get(node_id[2:], set())
    raise bad_request("bad_node", "점 id 는 t:… · d:… 모양이에요.")


def resolve_focus(S: _Fusion, focus: str | None) -> str | None:
    """대시보드 · 찾기에서 온 시작점 → 점 id. "tech:드론" · "desire:시간절약"(묶음으로) · "t:…" · "d:…"."""
    if not focus:
        return None
    if focus.startswith(("t:", "d:")):
        return focus if _ids_of(S, focus) else None
    type_, _, name = focus.partition(":")
    name = to_name(name)
    if type_ == "tech":
        return f"t:{name}" if name in S.tech else None
    if type_ == "desire":
        for key, label in S.desire_label.items():
            if key == f"dc:{name}" or to_name(label) == name:
                return f"d:{key}"
        for key, members in S.desire_members.items():
            if any(to_name(m) == name for m in members):
                return f"d:{key}"
    return None


def fusion(
    f: Filter,
    techs: int = TECHS_DEFAULT,
    desires: int = DESIRES_DEFAULT,
    focus: str | None = None,
    clusters: Clusters | None = None,
) -> tuple[FusionOut, str | None]:
    """기술 × 욕망 2부 그래프. 상상이 많은 기술 techs 개 · 욕망 묶음 desires 개 + 그 사이 연결.

    선 종류
      desire    기술 — 욕망 묶음: 함께 쓰인 상상 수
      collision 기술 — 기술, 두 기술의 대표 분야가 다름 (범용 기술의 충돌 = 분야를 넘는 결합)
      combo     기술 — 기술, 같은 분야
    focus 가 있으면 그 점과 바로 이웃(2단계)까지 함께 넣는다 (대시보드 · 찾기에서 들어온 경우).
    """
    L = load(f)
    S = _fusion_sets(L, clusters)
    pairs = _pairs(S, L)
    top_t = sorted(S.tech, key=lambda k: (-len(S.tech[k]), S.tech_label[k]))
    top_d = sorted(S.desire, key=lambda k: (-len(S.desire[k]), S.desire_label[k]))
    chosen = [_node_id("tech", k) for k in top_t[:techs] if len(S.tech[k]) >= EDGE_MIN]
    chosen += [_node_id("desire", k) for k in top_d[:desires] if len(S.desire[k]) >= EDGE_MIN]
    focus_id = resolve_focus(S, focus)
    extra: list[str] = []
    if focus_id and focus_id not in chosen:
        extra.append(focus_id)
    if focus_id:
        extra += _neighbors(S, pairs, focus_id, set(chosen) | set(extra))
    nodes = [_fusion_node(S, L, n) for n in chosen] + [_fusion_node(S, L, n, True) for n in extra]
    shown = {n.id for n in nodes}
    extra_set = set(extra)
    edges = [
        FusionEdge(
            id=f"{a}|{b}",
            source=a,
            target=b,
            kind=kind,  # type: ignore[arg-type]
            weight=len(ids),
            trend=L.trend(ids),
            rank_pct=_rank_pct(pairs[kind], (a, b)),
            extra=a in extra_set or b in extra_set,
        )
        for kind, group in pairs.items()
        for (a, b), ids in group.items()
        if a in shown and b in shown
    ]
    return FusionOut(nodes=nodes, edges=edges, total=len(L.items), clustered=S.clustered), focus_id


def _neighbors(
    S: _Fusion, pairs: dict[str, dict[tuple[str, str], set[int]]], node_id: str, exclude: set[str]
) -> list[str]:
    """node_id 와 함께 많이 쓰인 (아직 안 보이는) 점 EXPAND_MAX 개."""
    scored: Counter[str] = Counter()
    for group in pairs.values():
        for (a, b), ids in group.items():
            if a == node_id and b not in exclude:
                scored[b] = max(scored[b], len(ids))
            elif b == node_id and a not in exclude:
                scored[a] = max(scored[a], len(ids))
    return [n for n, _ in sorted(scored.items(), key=lambda kv: (-kv[1], kv[0]))[:EXPAND_MAX]]


def fusion_expand(
    f: Filter, node_id: str, shown: list[str], clusters: Clusters | None = None
) -> FusionOut:
    """점 하나를 펼친다 (더블클릭) — 아직 안 보이는 2단계 이웃 EXPAND_MAX 개와 그 선."""
    L = load(f)
    S = _fusion_sets(L, clusters)
    if not _ids_of(S, node_id):
        raise not_found("이 기간 · 분야에는 그 점이 없어요.")
    pairs = _pairs(S, L)
    have = set(shown) | {node_id}
    new = [_fusion_node(S, L, n, True) for n in _neighbors(S, pairs, node_id, have)]
    every = have | {n.id for n in new}
    new_ids = {n.id for n in new}
    edges = [
        FusionEdge(
            id=f"{a}|{b}",
            source=a,
            target=b,
            kind=kind,  # type: ignore[arg-type]
            weight=len(ids),
            trend=L.trend(ids),
            rank_pct=_rank_pct(pairs[kind], (a, b)),
            extra=True,
        )
        for kind, group in pairs.items()
        for (a, b), ids in group.items()
        if (a in new_ids or b in new_ids) and a in every and b in every
    ]
    return FusionOut(nodes=new, edges=edges, total=len(L.items), clustered=S.clustered)


def _node_links(
    pairs: dict[str, dict[tuple[str, str], set[int]]],
    node_id: str,
    shown: list[str],
    label: Callable[[str], str] = lambda x: x,
) -> NodeLinks:
    """점 하나에 닿는 연결 수(종류별)와 지금 그림에 없는 이웃 수 + 이름(함께 나온 상상이 많은 순)."""
    other: dict[str, list[tuple[str, int]]] = {k: [] for k in pairs}
    near: dict[str, int] = {}
    for kind, group in pairs.items():
        for (a, b), ids in group.items():
            if node_id in (a, b):
                o = b if a == node_id else a
                other[kind].append((o, len(ids)))
                near[o] = max(near.get(o, 0), len(ids))

    def names(xs: list[tuple[str, int]]) -> list[str]:
        return [label(o) for o, _ in sorted(xs, key=lambda x: (-x[1], x[0]))]

    hidden = [(o, n) for o, n in near.items() if o not in set(shown)]
    return NodeLinks(
        collision=len(other["collision"]),
        desire=len(other["desire"]),
        combo=len(other["combo"]),
        hidden=len(hidden),
        collision_with=names(other["collision"]),
        desire_with=names(other["desire"]),
        combo_with=names(other["combo"]),
        hidden_with=names(hidden),
    )


def fusion_inspect(
    db: Session,
    f: Filter,
    a: str,
    b: str | None,
    clusters: Clusters | None = None,
    shown: list[str] | None = None,
) -> Inspect:
    """점 하나(그 태그의 상상) 또는 선 하나(두 점이 함께 쓰인 상상)의 수치 + 원문.

    점이면 연결 수(links)도 붙인다 — 숨은 이웃은 shown(지금 그림의 점)에 없는 이웃.
    """
    L = load(f)
    S = _fusion_sets(L, clusters)
    ia = _ids_of(S, a)
    if not ia:
        raise not_found("이 기간 · 분야에는 그 점이 없어요.")
    na = _fusion_node(S, L, a)
    if b is None:
        out = _inspect(db, L, ia, na.label, na.kind, na.members)
        out.links = _node_links(_pairs(S, L), a, shown or [], lambda x: _fusion_label(S, x))
        return out
    ib = _ids_of(S, b)
    both = ia & ib
    if not both:
        raise not_found("두 점이 함께 쓰인 상상이 없어요.")
    nb = _fusion_node(S, L, b)
    pairs = _pairs(S, L)
    rank = None
    kind = "desire" if "d:" in (a[:2], b[:2]) else "combo"
    for k, group in pairs.items():
        key = (a, b) if (a, b) in group else (b, a)
        if key in group:
            kind, rank = k, _rank_pct(group, key)
    return _inspect(db, L, both, f"{na.label} × {nb.label}", kind, na.members or nb.members, rank)


# ---------------------------------------------------------------- ② 집단 압력 지도


def _zones(f: Filter, L: Loaded) -> list[tuple[list[int], float]]:
    """압력장 = 서로 다른 Dreamer 의 비슷한 상상 (점수 ZONE_MIN_SCORE 이상) 을 Louvain 으로 묶음 → [(상상 id, 안쪽 점수 평균)]."""
    rows = graph.run(
        "MATCH (a:Imagination)-[s:SIMILAR_TO]->(b:Imagination) "
        f"WHERE s.score >= $min AND a.author_id <> b.author_id AND {_where('a')} AND {_where('b')} "
        "RETURN a.id AS a, b.id AS b, s.score AS score",
        min=ZONE_MIN_SCORE,
        **f.params(),
    )
    weights: dict[tuple[str, str], float] = {}
    for r in rows:
        a, b = sorted((r["a"], r["b"]))
        key = (str(a), str(b))
        weights[key] = max(weights.get(key, 0.0), r["score"] or 0.0)
    ids = sorted({int(x) for pair in weights for x in pair})
    if not ids:
        return []
    comm = louvain(weights, [str(i) for i in ids])
    groups: dict[int, list[int]] = defaultdict(list)
    for node, k in comm.items():
        if int(node) in L.items:
            groups[k].append(int(node))
    out = []
    for members in groups.values():
        inside = set(members)
        if len(members) < ZONE_MIN or len({L.items[i]["author_id"] for i in members}) < (
            ZONE_DREAMERS_MIN
        ):
            continue
        scores = [w for (a, b), w in weights.items() if int(a) in inside and int(b) in inside]
        out.append((members, round(sum(scores) / len(scores), 3) if scores else 0.0))
    return out


def _zone_name(techs: list[TagCount], desires: list[TagCount], size: int) -> str:
    """핵심 주제 × 핵심 욕망 (1위 주제가 절반이 안 되면 주제 둘까지) — 뜻 해석 없음 (원칙 4)."""
    if techs:
        tech = f"#{techs[0].label}"
        if techs[0].count < size / 2 and len(techs) > 1:
            tech += f" · #{techs[1].label}"
    else:
        tech = "주제 없음"
    return f"{tech} × {desires[0].label}" if desires else tech


def semantic_map(f: Filter, method: str) -> MapOut:
    if method not in ("tsne", "umap"):
        raise bad_request("bad_method", "좌표 계산 방법은 tsne · umap 중 하나예요.")
    L = load(f)
    available = [
        m for m in ("tsne", "umap") if any(i.get(f"{m}_x") is not None for i in L.items.values())
    ]
    zones: list[MapZone] = []
    zone_of: dict[int, str] = {}
    built = []
    for members, cohesion in _zones(f, L):
        size = len(members)
        tech: Counter[tuple[str, str]] = Counter()
        desire: Counter[tuple[str, str]] = Counter()
        for i in members:
            for t in {(t["type"], t["name"], t["label"]) for t in L.tags.get(i, [])}:
                (tech if t[0] == "tech" else desire)[(t[1], t[2])] += 1
        techs = [TagCount(name=n, label=lb, count=c) for (n, lb), c in tech.most_common(5)]
        desires = [TagCount(name=n, label=lb, count=c) for (n, lb), c in desire.most_common(3)]
        top_share = techs[0].count / size if techs else 0.0
        built.append(
            MapZone(
                key="",
                name=_zone_name(techs, desires, size),
                size=size,
                dreamers=len({L.items[i]["author_id"] for i in members}),
                cohesion=cohesion,
                diversity=round(1 - top_share, 3),
                unnamed=size >= UNNAMED_MIN and top_share < UNNAMED_SHARE,
                trend=L.trend(members),
                techs=techs,
                desires=desires,
                domains=_domains([L.items[i] for i in members]),
                item_ids=sorted(members, key=lambda i: -(L.items[i]["thunders"] or 0)),
            )
        )
    built.sort(key=lambda z: (-z.dreamers, -z.size, z.name))
    for k, z in enumerate(built):
        z.key = cluster_name(k)
        zones.append(z)
        for i in z.item_ids:
            zone_of[i] = z.key
    span = max(1, f.until - f.since)
    points = []
    unplaced = 0
    for i in L.items.values():
        x, y = i.get(f"{method}_x"), i.get(f"{method}_y")
        if x is None or y is None:
            unplaced += 1
            continue
        tags = [t["label"] for t in L.tags.get(i["id"], []) if t["type"] == "tech"]
        points.append(
            MapPoint(
                id=i["id"],
                x=x,
                y=y,
                kind=i["kind"],
                title=i["title"],
                author=i["author"],
                domain=i["domain"],
                thunders=i["thunders"] or 0,
                recency=round(min(1.0, max(0.0, (i["created"] - f.since) / span)), 3),
                tech=tags[0] if tags else None,
                zone=zone_of.get(i["id"]),
            )
        )
    return MapOut(
        method=method,  # type: ignore[arg-type]
        available=available,
        points=points,
        zones=zones,
        unplaced=unplaced,
    )


def items_inspect(db: Session, f: Filter, ids: list[int], title: str, kind: str) -> Inspect:
    """상상 묶음(압력장 · 계보 · 상상 하나)의 수치 + 원문."""
    L = load(f)
    missing = [i for i in ids if i not in L.items]
    if missing:  # 기간 밖 상상(계보의 오래된 재료 등)도 보여 준다
        wide = Filter(since=0, until=2**40, domain=None, blend=True)
        whole = load(wide)
        for i in missing:
            if i in whole.items:
                L.items[i] = whole.items[i]
                L.tags[i] = whole.tags.get(i, [])
    return _inspect(db, L, {i for i in ids if i in L.items}, title, kind)


# ---------------------------------------------------------------- ③ 변이와 진화


def lineage(
    f: Filter,
    cross_only: bool = False,
    min_synergy: float | None = None,
    trees: int = LINEAGE_TREES,
    only: set[int] | None = None,
    first: int | None = None,
) -> LineageOut:
    """Shake it 계보 숲 — 재료 → 혼합 글 (→ 그 혼합 글을 재료로 다시 혼합 …).

    계보(연결된 덩어리) 안에 기간 · 분야에 맞는 혼합 글이 하나라도 있으면 보여 준다.
    cross_only · min_synergy 에 맞는 혼합 글이 있는 계보만 남긴다 (조건에 맞는 혼합 글이 강조된다).
    순서: 가장 큰 시너지 → 혼합 글 수.
    시작점 찾기 (2026-11-20): only = 이 상상 중 하나라도 들어 있는 계보만 (기술 · 욕망 찾기),
    first = 이 상상이 들어 있는 계보를 거르기와 상관없이 맨 앞에 (상상 찾기)
    """
    rows = graph.run(
        "MATCH (p:Imagination)-[:BLENDED_INTO]->(c:Imagination) RETURN p.id AS p, c.id AS c"
    )
    if not rows:
        return LineageOut(nodes=[], edges=[], trees=[], blends_total=0)
    parents: dict[int, list[int]] = defaultdict(list)
    adj: dict[int, set[int]] = defaultdict(set)
    for r in rows:
        parents[r["c"]].append(r["p"])
        adj[r["p"]].add(r["c"])
        adj[r["c"]].add(r["p"])
    ids = sorted(adj)
    props = {
        r["i"]["id"]: r["i"]
        for r in graph.run(
            "MATCH (i:Imagination) WHERE i.id IN $ids RETURN {id: i.id, kind: i.kind, title: i.title, "
            "author: i.author, domain: i.domain, domain2: i.domain2, thunders: i.thunders, "
            "synergy: i.synergy, created: i.created} AS i",
            ids=ids,
        )
    }
    in_period = {
        r["id"]
        for r in graph.run(
            f"MATCH (i:Imagination) WHERE i.kind = 'blend' AND {_where('i')} RETURN i.id AS id",
            **{**f.params(), "blend": True},
        )
    }

    depth: dict[int, int] = {}

    def depth_of(i: int, seen: frozenset = frozenset()) -> int:
        if i in depth:
            return depth[i]
        ps = [p for p in parents.get(i, []) if p not in seen]
        depth[i] = 0 if not ps else 1 + max(depth_of(p, seen | {i}) for p in ps)
        return depth[i]

    def cross(i: int) -> bool:
        doms = {props[p]["domain"] for p in parents.get(i, []) if p in props} - {None}
        return len(doms) >= 2

    def matches(i: int) -> bool:
        if i not in in_period:
            return False
        if cross_only and not cross(i):
            return False
        syn = props[i].get("synergy")
        return min_synergy is None or (syn is not None and syn >= min_synergy)

    # 연결된 덩어리 = 계보 하나
    comp: dict[int, int] = {}
    for start in ids:
        if start in comp:
            continue
        stack = [start]
        comp[start] = start
        while stack:
            n = stack.pop()
            for m in adj[n]:
                if m not in comp:
                    comp[m] = start
                    stack.append(m)
    members: dict[int, list[int]] = defaultdict(list)
    for n, c in comp.items():
        if n in props:
            members[c].append(n)

    picked = []
    blends_total = 0
    for root, group in members.items():
        blends = [i for i in group if props[i]["kind"] == "blend"]
        hits = [i for i in blends if matches(i)]
        is_first = first is not None and first in group
        if only is not None and not (only & set(group)):
            continue
        blends_total += len(hits)
        if not hits and not is_first:
            continue
        syn = [props[i]["synergy"] for i in blends if props[i].get("synergy") is not None]
        picked.append((root, group, blends, hits, max(syn) if syn else None, is_first))
    picked.sort(key=lambda t: (not t[5], -(t[4] if t[4] is not None else -1e9), -len(t[2]), t[0]))

    nodes: list[LineageNode] = []
    edges: list[tuple[int, int]] = []
    out_trees: list[LineageTree] = []
    for k, (_root, group, blends, hits, best, _first) in enumerate(picked[:trees]):
        key = cluster_name(k)
        hit_set = set(hits)
        for i in sorted(group, key=lambda i: (depth_of(i), props[i]["created"])):
            p = props[i]
            nodes.append(
                LineageNode(
                    id=i,
                    kind=p["kind"],
                    title=p["title"],
                    author=p["author"],
                    domain=p["domain"],
                    domain2=p["domain2"],
                    thunders=p["thunders"] or 0,
                    synergy=p.get("synergy"),
                    depth=depth_of(i),
                    cross=p["kind"] == "blend" and cross(i),
                    tree=key,
                    created_at=_dt(p["created"]),
                    match=i in hit_set,
                )
            )
            edges += [(par, i) for par in parents.get(i, []) if par in props]
        out_trees.append(
            LineageTree(
                key=key,
                size=len(group),
                blends=len(blends),
                depth=max(depth_of(i) for i in group),
                best_synergy=best,
                cross_blends=sum(1 for i in blends if cross(i)),
                thunders=sum(props[i]["thunders"] or 0 for i in group),
            )
        )
    return LineageOut(nodes=nodes, edges=edges, trees=out_trees, blends_total=blends_total)


# ---------------------------------------------------------------- ④ 전파와 공명


def build_cascade(
    author_id: int, waves: list[tuple[int, int | None, int]]
) -> dict[int, tuple[int | None, int]]:
    """Wave 들 → 확산 나무 {사용자: (부모 사용자, 단계)}. waves = [(사용자, via, 시각)].

    부모 = via (via 가 작성자이거나 그보다 먼저 Wave 한 사람일 때), 아니면 작성자 (직접 보고 한 Wave).
    시각 순서로 놓으므로 고리가 생기지 않는다.
    """
    placed: dict[int, tuple[int | None, int]] = {author_id: (None, 0)}
    for user, via, _ in sorted(waves, key=lambda w: (w[2], w[0])):
        if user in placed:
            continue
        parent = via if via is not None and via in placed else author_id
        placed[user] = (parent, placed[parent][1] + 1)
    return placed


def _subtree(tree: dict[int, tuple[int | None, int]]) -> dict[int, set[int]]:
    """사용자마다 자기 아래 사람들."""
    children: dict[int, list[int]] = defaultdict(list)
    for u, (p, _) in tree.items():
        if p is not None:
            children[p].append(u)
    out: dict[int, set[int]] = {}

    def walk(u: int) -> set[int]:
        if u not in out:
            below: set[int] = set()
            for c in children[u]:
                below |= {c} | walk(c)
            out[u] = below
        return out[u]

    for u in tree:
        walk(u)
    return out


def cascades(
    f: Filter, limit: int = CASCADES_MAX, only: set[int] | None = None
) -> list[CascadeSummary]:
    """확산 경로 목록 — Wave 가 있는 상상 (깊이 → 다른 사람을 거친 Wave → Wave 수 순). only = 이 상상만 (시작점 찾기)."""
    rows = graph.run(
        "MATCH (u:User)-[w:WAVED]->(i:Imagination) "
        f"WHERE {_where('i')} "
        "WITH i, collect({user: u.id, via: w.via, at: w.at}) AS waves "
        "RETURN {id: i.id, title: i.title, author: i.author, author_id: i.author_id, domain: i.domain, "
        "created: i.created, thunders: i.thunders} AS i, waves",
        **f.params(),
    )
    out = []
    for r in rows:
        i = r["i"]
        waves = [(w["user"], w["via"], w["at"] or 0) for w in r["waves"]]
        tree = build_cascade(i["author_id"], waves)
        out.append(
            CascadeSummary(
                id=i["id"],
                title=i["title"],
                author=i["author"],
                domain=i["domain"],
                waves=len(waves),
                via_waves=sum(1 for _, (p, d) in tree.items() if d >= 2),
                depth=max(d for _, d in tree.values()),
                thunders=i["thunders"] or 0,
                created_at=_dt(i["created"]),
            )
        )
    if only is not None:
        out = [c for c in out if c.id in only]
    out.sort(key=lambda c: (-c.depth, -c.via_waves, -c.waves, -c.thunders))
    return out[:limit]


def find_ids(f: Filter, hit: str) -> list[int]:
    """시작점 찾기 결과(기술 · 욕망 태그) → 기간 · 분야 안에서 그 태그가 붙은 상상 id (2026-11-20).

    hit = "tech:드론" · "desire:시간절약" (비교용 이름). 욕망은 묶음이 아니라 그 태그 하나만.
    """
    type_, _, name = hit.partition(":")
    if type_ not in ("tech", "desire") or not name:
        raise bad_request("bad_hit", "찾기 결과는 tech:이름 · desire:이름 모양이에요.")
    name = to_name(name)
    L = load(f)
    return sorted(
        (
            i
            for i, tags in L.tags.items()
            if any(t["type"] == type_ and t["name"] == name for t in tags)
        ),
        key=lambda i: -(L.items[i]["thunders"] or 0),
    )


def cascade(db: Session, item_id: int) -> CascadeOut:
    """상상 하나의 확산 나무. 역할 = 작성자(origin) · 아래 2명 이상(hub) · 아래 1명(spreader) · 끝(leaf)."""
    head = graph.run(
        "MATCH (i:Imagination {id: $id}) RETURN i.author_id AS author_id, i.author AS author",
        id=item_id,
    )
    if not head:
        raise not_found("그래프에 없는 상상이에요.")
    author_id = head[0]["author_id"]
    rows = graph.run(
        "MATCH (u:User)-[w:WAVED]->(i:Imagination {id: $id}) "
        "RETURN u.id AS user, u.nickname AS nickname, w.via AS via, w.at AS at",
        id=item_id,
    )
    thunders = {
        r["user"]
        for r in graph.run(
            "MATCH (u:User)-[:THUNDERED]->(i:Imagination {id: $id}) RETURN u.id AS user", id=item_id
        )
    }
    shakers = {
        r["author_id"]
        for r in graph.run(
            "MATCH (i:Imagination {id: $id})-[:BLENDED_INTO]->(c:Imagination) RETURN c.author_id AS author_id",
            id=item_id,
        )
    }
    names = {author_id: head[0]["author"], **{r["user"]: r["nickname"] for r in rows}}
    at_of = {r["user"]: r["at"] for r in rows}
    tree = build_cascade(author_id, [(r["user"], r["via"], r["at"] or 0) for r in rows])
    below = _subtree(tree)
    total = len(tree) - 1
    nodes = []
    for u, (parent, depth) in sorted(
        tree.items(), key=lambda kv: (kv[1][1], at_of.get(kv[0]) or 0)
    ):
        n_below = len(below[u])
        role = (
            "origin"
            if parent is None
            else "hub"
            if n_below >= 2
            else "spreader"
            if n_below == 1
            else "leaf"
        )
        reach = ({u} | below[u]) & thunders if parent is not None else thunders
        nodes.append(
            CascadeNode(
                id=f"u:{u}",
                user_id=u,
                nickname=names.get(u, "?"),
                role=role,  # type: ignore[arg-type]
                depth=depth,
                parent=f"u:{parent}" if parent is not None else None,
                at=_dt(at_of[u]) if u in at_of and at_of[u] else None,
                downstream=n_below,
                share=round(n_below / total, 3) if total else 0.0,
                reached_thunders=len(reach),
                thundered=u in thunders,
                shaker=u in shakers,
            )
        )
    item = cards(db, [item_id])
    if not item:
        raise not_found("볼 수 없는 상상이에요.")
    return CascadeOut(
        item=item[0],
        nodes=nodes,
        total_waves=total,
        via_waves=sum(1 for _, (_, d) in tree.items() if d >= 2),
        depth=max(d for _, d in tree.values()),
        hubs=sum(1 for n in nodes if n.role == "hub"),
    )


# ---------------------------------------------------------------- 시작점 찾기 (PostgreSQL)


def search(db: Session, raw: str) -> list[SearchHit]:
    """탐색 시작점 찾기 — 기술 · 욕망 태그 · 상상 각 5개까지. 검색 기록(search_logs)은 남기지 않는다."""
    q = clean_query(raw)
    hits: list[SearchHit] = []
    n = func.count(func.distinct(ImaginationTag.imagination_id))
    for type_ in ("tech", "desire"):
        for t, count in db.execute(
            select(Tag, n)
            .join(ImaginationTag, ImaginationTag.tag_id == Tag.id)
            .join(Imagination, Imagination.id == ImaginationTag.imagination_id)
            .where(
                ACTIVE,
                Tag.type == type_,
                Tag.name.ilike(_like(to_name(q)), escape=ESC),
                Imagination.status == "visible",
                Imagination.kind.in_(GRAPH_KINDS),
            )
            .group_by(Tag.id)
            .order_by(n.desc(), Tag.label)
            .limit(SEARCH_MAX)
        ):
            hits.append(
                SearchHit(
                    id=f"{type_}:{t.name}",
                    kind=type_,  # type: ignore[arg-type]
                    label=t.label,
                    sub=f"상상 {count}개",
                )
            )
    item_ids = _text_ids(db, q)[:SEARCH_MAX]
    if item_ids:
        items = {
            i.id: i
            for i in db.scalars(select(Imagination).where(Imagination.id.in_(item_ids))).unique()
        }
        for i in item_ids:
            item = items[i]
            hits.append(
                SearchHit(
                    id=f"i:{i}",
                    kind="imagination",
                    label=item.display_title,
                    sub=item.author.nickname,
                )
            )
    return hits


# ---------------------------------------------------------------- 상태


def _last(db: Session, *conds) -> LastBuild | None:
    row = db.scalar(select(GraphSyncLog).where(*conds).order_by(GraphSyncLog.id.desc()).limit(1))
    if row is None:
        return None
    return LastBuild(
        at=row.created_at, status=row.status, nodes=row.nodes, edges=row.edges, error=row.error
    )


def desire_tag_ids(db: Session) -> list[int]:
    """쓰이고 있는(보이는 글에 붙은) 욕망 태그."""
    return list(
        db.scalars(
            select(Tag.id)
            .join(ImaginationTag, ImaginationTag.tag_id == Tag.id)
            .join(Imagination, Imagination.id == ImaginationTag.imagination_id)
            .where(
                ACTIVE,
                Tag.type == "desire",
                Imagination.status == "visible",
                Imagination.kind.in_(GRAPH_KINDS),
            )
            .distinct()
        )
    )


def status(db: Session) -> GraphStatusOut:
    nodes = edges = None
    connected = False
    if graph.enabled():
        try:
            nodes = graph.run("MATCH (n) RETURN count(n) AS n")[0]["n"]
            edges = graph.run("MATCH ()-[e]->() RETURN count(e) AS n")[0]["n"]
            connected = True
        except graph.GraphUnavailable:
            pass
    target = (
        db.scalar(
            select(func.count())
            .select_from(Imagination)
            .join(ImaginationEmbedding, ImaginationEmbedding.imagination_id == Imagination.id)
            .where(Imagination.status == "visible", Imagination.kind.in_(SIMILAR_KINDS))
        )
        or 0
    )
    by_method = dict(
        db.execute(select(SimilarSet.method, func.count()).group_by(SimilarSet.method)).all()
    )
    desires = desire_tag_ids(db)
    embedded = (
        db.scalar(
            select(func.count()).select_from(TagEmbedding).where(TagEmbedding.tag_id.in_(desires))
        )
        if desires
        else 0
    )
    return GraphStatusOut(
        enabled=graph.enabled(),
        connected=connected,
        nodes=nodes,
        edges=edges,
        last_build=_last(db, GraphSyncLog.kind == "full_build", GraphSyncLog.status == "success"),
        last_error=_last(db, GraphSyncLog.status == "failed"),
        similar_rerank=by_method.get("rerank", 0),
        similar_vector=by_method.get("vector", 0),
        similar_target=target,
        tag_embedded=embedded or 0,
        desire_tags=len(desires),
    )
