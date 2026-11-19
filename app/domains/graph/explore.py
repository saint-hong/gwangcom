"""상상 네트워크 탐색기 질의 (기획안 v12 F22, Sprint 7-B — 2026-11-19 사용자 결정).

목적: 사람들의 상상에서 **비슷한 경향**을 찾는다. 대시보드와 연결되면서도 다르게 —
  · 대시보드는 AI 가 붙인 태그를 **세어** 전체 경향을 본다 (숫자 · 순위 · 군집)
  · 탐색기는 상상의 **내용**이 비슷한 것끼리 묶고(비슷한 상상 = 임베딩 + AI 리랭킹), 실제 상상 · Dreamer 로 **따라 들어간다**

보기 두 개
  ① 경향 다발: 서로 다른 Dreamer 가 쓴 비슷한 상상을 묶고 다발마다 이름 · 크기 · 흐름 · 신호를 계산 (2026-11-19 사용자: 연결보다 경향 자체를)
  ② 파고들기: 점 하나(상상 · 주제 · 욕망 · Dreamer)와 바로 이어진 점들 → 점을 누르면 한 단계 더

탐색기는 계산 규칙으로만 묶고 이름 붙인다 (원칙 4). 다발 이름 = 핵심 주제 × 핵심 욕망(가장 많이 붙은 태그), 해석은 운영자.
혼합 글(Shake it)은 기본으로 빼고, 운영자가 켜면 넣는다 (원칙 3).
"""

from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domains.analytics.clusters import cluster_name, louvain
from app.domains.analytics.insights import COOLING, RISING, RISING_MIN
from app.domains.analytics.period import Period
from app.domains.graph.build import GRAPH_KINDS
from app.domains.graph.models import GraphSyncLog
from app.domains.graph.schemas import (
    Bundle,
    BundlesOut,
    BundleTag,
    ExpandOut,
    GEdge,
    GNode,
    GraphStatusOut,
    GroupMember,
    LastBuild,
    SearchHit,
)
from app.domains.imaginations.models import Imagination
from app.domains.search.service import ESC, _like, _text_ids, clean_query
from app.domains.similar.models import ImaginationEmbedding, SimilarSet
from app.domains.similar.service import KINDS as SIMILAR_KINDS
from app.domains.tags.models import ImaginationTag, Tag
from app.domains.tags.service import ACTIVE, to_name
from app.domains.users.models import User
from app.infrastructure import graph
from app.shared.errors import bad_request, not_found

ITEMS_MAX = 24  # 주제 · Dreamer 에서 펼칠 상상 수
SIMILAR_MAX = 10
CO_TECH_MAX = 8
CO_DESIRE_MAX = 6
GROUP_MIN = 3  # 묶음이 되려면 상상 3개 이상
GROUP_DREAMERS_MIN = 2  # 서로 다른 Dreamer 2명 이상
BUNDLES_MAX = 60
BUNDLE_MIN_SCORE = 0.92  # 다발을 만들 때 쓰는 비슷한 상상 연결 점수 (2026-11-19 실측: 0.92 이상이면 다발 크기 22 이하 · 주제 순도 0.96)
SEARCH_MAX = 5


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


def _where(v: str) -> str:
    """Cypher: 상상 점 v 가 거르기 조건에 맞는가."""
    return (
        f"{v}.created >= $since AND {v}.created < $until "
        f"AND ($domain IS NULL OR {v}.domain = $domain OR {v}.domain2 = $domain) "
        f"AND ($blend OR {v}.kind <> 'blend')"
    )


# ---------------------------------------------------------------- 점 만들기


def _item_node(r: dict) -> GNode:
    return GNode(
        id=f"i:{r['id']}",
        kind="imagination",
        label=r["title"],
        sub=r["author"],
        size=r.get("thunders") or 0,
        domain=r.get("domain"),
        blend=r.get("kind") == "blend",
    )


def _tag_node(t: dict, count: int | None = None) -> GNode:
    return GNode(
        id=f"t:{t['key']}",
        kind="tech" if t["type"] == "tech" else "desire",
        label=t["label"],
        sub=f"상상 {count}개" if count is not None else None,
        size=count or 1,
    )


def _user_node(u: dict, count: int | None = None) -> GNode:
    return GNode(
        id=f"u:{u['id']}",
        kind="dreamer",
        label=u["nickname"],
        sub=f"상상 {count}개" if count is not None else None,
        size=count or 1,
    )


_ITEM_PROPS = (
    "{id: {v}.id, kind: {v}.kind, title: {v}.title, author: {v}.author, "
    "thunders: {v}.thunders, domain: {v}.domain}"
)


def _props(v: str) -> str:
    return _ITEM_PROPS.replace("{v}", v)


# ---------------------------------------------------------------- 파고들기


def expand(node_id: str, f: Filter) -> ExpandOut:
    """점 하나와 바로 이어진 점들. node_id = "i:12" · "u:5" · "t:tech:드론" · "t:desire:…"."""
    kind, _, rest = node_id.partition(":")
    if kind == "i" and rest.isdigit():
        return _expand_item(int(rest), f)
    if kind == "u" and rest.isdigit():
        return _expand_user(int(rest), f)
    if kind == "t" and ":" in rest:
        return _expand_tag(rest, f)
    raise bad_request("invalid_node", "알 수 없는 점이에요.")


def _expand_item(item_id: int, f: Filter) -> ExpandOut:
    p = {"id": item_id, **f.params()}
    rows = graph.run(
        f"MATCH (u:User)-[:WROTE]->(i:Imagination {{id: $id}}) RETURN {_props('i')} AS i, "
        "{id: u.id, nickname: u.nickname} AS u",
        **p,
    )
    if not rows:
        raise not_found("그래프에 없는 상상이에요. 그래프를 다시 만들어 보세요.")
    center = _item_node(rows[0]["i"])
    nodes: dict[str, GNode] = {}
    edges: list[GEdge] = []
    author = _user_node(rows[0]["u"])
    nodes[author.id] = author
    edges.append(GEdge(source=author.id, target=center.id, kind="wrote"))

    for r in graph.run(
        "MATCH (:Imagination {id: $id})-[:HAS_TAG]->(t:Tag) "
        "RETURN {key: t.key, label: t.label, type: t.type} AS t",
        id=item_id,
    ):
        n = _tag_node(r["t"])
        nodes[n.id] = n
        edges.append(GEdge(source=center.id, target=n.id, kind="has_tag"))

    # 비슷한 상상: 양쪽 방향 모두 (A 가 B 를 골랐거나 B 가 A 를 골랐거나), 점수 높은 것 하나만
    best: dict[int, dict] = {}
    for r in graph.run(
        f"MATCH (:Imagination {{id: $id}})-[s:SIMILAR_TO]-(o:Imagination) WHERE {_where('o')} "
        f"RETURN {_props('o')} AS o, s.score AS score, s.reason AS reason "
        "ORDER BY score DESC",
        **p,
    ):
        oid = r["o"]["id"]
        if oid not in best:
            best[oid] = dict(r)  # 점수 높은 순으로 오므로 처음 것이 가장 높다
        elif r["reason"] and not best[oid]["reason"]:
            best[oid]["reason"] = r["reason"]
    for r in list(best.values())[:SIMILAR_MAX]:
        n = _item_node(r["o"])
        nodes[n.id] = n
        edges.append(
            GEdge(
                source=center.id,
                target=n.id,
                kind="similar",
                weight=r["score"] or 0,
                reason=r["reason"],
            )
        )

    # Shake it 재료 · 혼합 글, 인용
    for query, kind, outward in (
        ("MATCH (o:Imagination)-[:BLENDED_INTO]->(:Imagination {id: $id})", "blended", False),
        ("MATCH (:Imagination {id: $id})-[:BLENDED_INTO]->(o:Imagination)", "blended", True),
        ("MATCH (:Imagination {id: $id})-[:QUOTES]->(o:Imagination)", "quotes", True),
        ("MATCH (o:Imagination)-[:QUOTES]->(:Imagination {id: $id})", "quotes", False),
    ):
        for r in graph.run(f"{query} WHERE {_where('o')} RETURN {_props('o')} AS o", **p):
            n = _item_node(r["o"])
            nodes[n.id] = n
            src, dst = (center.id, n.id) if outward else (n.id, center.id)
            edges.append(GEdge(source=src, target=dst, kind=kind))
    return ExpandOut(center=center, nodes=list(nodes.values()), edges=edges)


def _expand_tag(key: str, f: Filter) -> ExpandOut:
    p = {"key": key, **f.params()}
    rows = graph.run(
        "MATCH (t:Tag {key: $key}) RETURN {key: t.key, label: t.label, type: t.type} AS t", **p
    )
    if not rows:
        raise not_found("그래프에 없는 주제예요.")
    total = graph.run(
        f"MATCH (i:Imagination)-[:HAS_TAG]->(:Tag {{key: $key}}) WHERE {_where('i')} "
        "RETURN count(DISTINCT i) AS n",
        **p,
    )[0]["n"]
    center = _tag_node(rows[0]["t"], total)
    nodes: dict[str, GNode] = {}
    edges: list[GEdge] = []
    # 이 주제가 붙은 상상 (Thunder 많은 순)
    for r in graph.run(
        f"MATCH (i:Imagination)-[:HAS_TAG]->(:Tag {{key: $key}}) WHERE {_where('i')} "
        f"RETURN {_props('i')} AS i ORDER BY i.thunders DESC, i.created DESC LIMIT {ITEMS_MAX}",
        **p,
    ):
        n = _item_node(r["i"])
        nodes[n.id] = n
        edges.append(GEdge(source=n.id, target=center.id, kind="has_tag"))
    # 같은 상상에 함께 붙은 주제 · 욕망 (함께 쓰인 횟수 = 선 굵기)
    for type_, cap in (("tech", CO_TECH_MAX), ("desire", CO_DESIRE_MAX)):
        for r in graph.run(
            f"MATCH (:Tag {{key: $key}})<-[:HAS_TAG]-(i:Imagination)-[:HAS_TAG]->(o:Tag) "
            f"WHERE o.key <> $key AND o.type = $type AND {_where('i')} "
            "RETURN {key: o.key, label: o.label, type: o.type} AS o, count(DISTINCT i) AS n "
            f"ORDER BY n DESC, o.label LIMIT {cap}",
            type=type_,
            **p,
        ):
            n = _tag_node(r["o"])
            n.sub = f"함께 {r['n']}번"
            n.size = r["n"]
            nodes[n.id] = n
            edges.append(GEdge(source=center.id, target=n.id, kind="with", weight=r["n"]))
    more = {"imagination": max(0, total - ITEMS_MAX)} if total > ITEMS_MAX else {}
    return ExpandOut(center=center, nodes=list(nodes.values()), edges=edges, more=more)


def _expand_user(user_id: int, f: Filter) -> ExpandOut:
    p = {"id": user_id, **f.params()}
    rows = graph.run("MATCH (u:User {id: $id}) RETURN {id: u.id, nickname: u.nickname} AS u", **p)
    if not rows:
        raise not_found("그래프에 없는 Dreamer 예요 (아직 상상을 쓰지 않았을 수 있어요).")
    total = graph.run(
        f"MATCH (:User {{id: $id}})-[:WROTE]->(i:Imagination) WHERE {_where('i')} "
        "RETURN count(i) AS n",
        **p,
    )[0]["n"]
    center = _user_node(rows[0]["u"], total)
    nodes: dict[str, GNode] = {}
    edges: list[GEdge] = []
    for r in graph.run(
        f"MATCH (:User {{id: $id}})-[:WROTE]->(i:Imagination) WHERE {_where('i')} "
        f"RETURN {_props('i')} AS i ORDER BY i.created DESC LIMIT {ITEMS_MAX}",
        **p,
    ):
        n = _item_node(r["i"])
        nodes[n.id] = n
        edges.append(GEdge(source=center.id, target=n.id, kind="wrote"))
    # 이 Dreamer 가 자주 상상하는 주제 · 욕망
    for type_, cap in (("tech", CO_TECH_MAX), ("desire", CO_DESIRE_MAX)):
        for r in graph.run(
            f"MATCH (:User {{id: $id}})-[:WROTE]->(i:Imagination)-[:HAS_TAG]->(t:Tag) "
            f"WHERE t.type = $type AND {_where('i')} "
            "RETURN {key: t.key, label: t.label, type: t.type} AS t, count(DISTINCT i) AS n "
            f"ORDER BY n DESC, t.label LIMIT {cap}",
            type=type_,
            **p,
        ):
            n = _tag_node(r["t"])
            n.sub = f"{r['n']}번 상상"
            n.size = r["n"]
            nodes[n.id] = n
            edges.append(GEdge(source=center.id, target=n.id, kind="uses", weight=r["n"]))
    more = {"imagination": max(0, total - ITEMS_MAX)} if total > ITEMS_MAX else {}
    return ExpandOut(center=center, nodes=list(nodes.values()), edges=edges, more=more)


# ---------------------------------------------------------------- 경향 다발 (비슷한 상상 묶음)


def _dt(sec: int) -> datetime:
    return datetime.fromtimestamp(sec, UTC)


def _signal(
    recent: int, earlier: int, r_total: int, e_total: int
) -> tuple[str, float | None, float]:
    """기간 앞 절반 → 뒤 절반의 비중 변화. 대시보드 기술 신호와 같은 기준 (1.5배 · 2/3, 3개 이상).

    → (신호, 비중 증감, 쏠림 0~1). 쏠림 = 뒤 절반 비중 ÷ (앞 + 뒤 비중), 0.5 = 그대로 · 1 = 뒤 절반에만.
    비중으로 보는 이유: 서비스가 커지는 동안 개수로 보면 모든 다발이 "늘어남"이 된다 (6-2 와 같은 이유).
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


def _bundle_name(
    techs: list[BundleTag], desires: list[BundleTag], size: int, fallback: str, two: bool = False
) -> str:
    """계산으로 붙인 이름 = 핵심 주제 × 핵심 욕망. 1위 주제가 다발의 절반이 안 되면(또는 two) 주제를 둘까지 (뜻 해석 없음, 원칙 4)."""
    if techs:
        tech = f"#{techs[0].label}"
        if (two or techs[0].count < size / 2) and len(techs) > 1:
            tech += f" · #{techs[1].label}"
    else:
        tech = fallback
    return f"{tech} × {desires[0].label}" if desires else tech


def bundles(f: Filter, p: Period) -> BundlesOut:
    """경향 다발 — 서로 다른 Dreamer 가 쓴 비슷한 상상을 묶고, 다발마다 특징 · 크기 · 흐름을 계산한다 (2026-11-19 사용자 결정).

    1) 기간 · 분야 안의 비슷한 상상 연결 중 **점수 BUNDLE_MIN_SCORE 이상 · 작성자가 다른 것만**
       (모든 연결을 쓰면 다발이 14~60개로 커져 서로 다른 상상이 섞였다 → 0.92 로 조임, 2026-11-19 사용자 결정)
    2) 점수를 무게로 Louvain (대시보드 교차 분석 군집과 같은 계산)
    3) 상상 3개 이상 · Dreamer 2명 이상인 다발만
    4) 다발마다: 이름(핵심 주제 × 핵심 욕망) · 구성(주제 · 욕망 · 분야) · 처음 · 마지막 · 칸별 흐름 ·
       신호(기간 앞 절반 → 뒤 절반 비중) · 대표 상상(다발 안에서 가장 많이 이어진 상상) · AI 연결 이유
    """
    params = {**f.params(), "min": BUNDLE_MIN_SCORE}
    rows = graph.run(
        "MATCH (a:Imagination)-[s:SIMILAR_TO]->(b:Imagination) "
        f"WHERE s.score >= $min AND a.author_id <> b.author_id AND {_where('a')} AND {_where('b')} "
        "RETURN a.id AS a, b.id AS b, s.score AS score, s.reason AS reason",
        **params,
    )
    weights: dict[tuple[str, str], float] = defaultdict(float)
    reasons: dict[tuple[int, int], tuple[float, str]] = {}
    for r in rows:
        a, b = sorted((r["a"], r["b"]))
        weights[(str(a), str(b))] = max(weights[(str(a), str(b))], r["score"] or 0)
        if r["reason"]:
            prev = reasons.get((a, b))
            if prev is None or (r["score"] or 0) > prev[0]:
                reasons[(a, b)] = (r["score"] or 0, r["reason"])
    labels = [b.isoformat() for b in p.buckets]
    ids = sorted({int(x) for pair in weights for x in pair})
    if not ids:
        return BundlesOut(bundles=[], linked=0, buckets=labels, unit=p.unit)

    comm = louvain(dict(weights), [str(i) for i in ids])
    members_of: dict[int, list[int]] = defaultdict(list)
    for node, k in comm.items():
        members_of[k].append(int(node))

    props = {
        r["i"]["id"]: r["i"]
        for r in graph.run(
            "MATCH (i:Imagination) WHERE i.id IN $ids RETURN {id: i.id, title: i.title, "
            "excerpt: i.excerpt, author: i.author, author_id: i.author_id, domain: i.domain, "
            "created: i.created, thunders: i.thunders} AS i",
            ids=ids,
        )
    }
    tags_of: dict[int, list[dict]] = defaultdict(list)
    for r in graph.run(
        "MATCH (i:Imagination)-[:HAS_TAG]->(t:Tag) WHERE i.id IN $ids "
        "RETURN i.id AS i, {name: t.name, label: t.label, type: t.type} AS t",
        ids=ids,
    ):
        tags_of[r["i"]].append(r["t"])

    # 기간 앞 절반 · 뒤 절반의 전체 상상 수 (비중의 분모)
    mid = f.since + (f.until - f.since) // 2
    halves = graph.run(
        f"MATCH (i:Imagination) WHERE {_where('i')} "
        "RETURN sum(CASE WHEN i.created < $mid THEN 1 ELSE 0 END) AS e, "
        "sum(CASE WHEN i.created >= $mid THEN 1 ELSE 0 END) AS r",
        mid=mid,
        **f.params(),
    )[0]
    e_total, r_total = halves["e"] or 0, halves["r"] or 0

    out: list[Bundle] = []
    for member_ids in members_of.values():
        member_ids = [i for i in member_ids if i in props]
        dreamers = {props[i]["author_id"] for i in member_ids}
        if len(member_ids) < GROUP_MIN or len(dreamers) < GROUP_DREAMERS_MIN:
            continue
        inside = set(member_ids)
        size = len(member_ids)
        tech: Counter[tuple[str, str]] = Counter()
        desire: Counter[tuple[str, str]] = Counter()
        domain: Counter[str] = Counter()
        for i in member_ids:
            for t in {(t["type"], t["name"], t["label"]) for t in tags_of[i]}:
                (tech if t[0] == "tech" else desire)[(t[1], t[2])] += 1
            if props[i]["domain"]:
                domain[props[i]["domain"]] += 1
        techs = [BundleTag(name=n, label=lb, count=c) for (n, lb), c in tech.most_common(5)]
        desires = [BundleTag(name=n, label=lb, count=c) for (n, lb), c in desire.most_common(3)]
        g_edges = [
            (a, b, w)
            for (sa, sb), w in weights.items()
            if (a := int(sa)) in inside and (b := int(sb)) in inside
        ]
        degree: Counter[int] = Counter()
        for a, b, _ in g_edges:
            degree[a] += 1
            degree[b] += 1
        created = [props[i]["created"] for i in member_ids]
        series = [0] * len(p.buckets)
        for c in created:
            k = p.index_of(_dt(c))
            if k is not None:
                series[k] += 1
        recent = sum(1 for c in created if c >= mid)
        signal, growth, trend = _signal(recent, size - recent, r_total, e_total)
        ordered = sorted(
            member_ids,
            key=lambda i: (-degree[i], -(props[i]["thunders"] or 0), props[i]["created"]),
        )
        members = [
            GroupMember(
                id=i,
                title=props[i]["title"],
                excerpt=props[i]["excerpt"] or "",
                author=props[i]["author"],
                author_id=props[i]["author_id"],
                domain=props[i]["domain"],
                created_at=_dt(props[i]["created"]),
                thunders=props[i]["thunders"] or 0,
            )
            for i in ordered
        ]
        out.append(
            Bundle(
                key="",
                name=_bundle_name(techs, desires, size, members[0].title[:20]),
                size=size,
                dreamers=len(dreamers),
                first_at=_dt(min(created)),
                last_at=_dt(max(created)),
                recent=recent,
                earlier=size - recent,
                share_growth=growth,
                trend=round(trend, 3),
                signal=signal,
                series=series,
                techs=techs,
                desires=desires,
                domains=[BundleTag(name=d, label=d, count=c) for d, c in domain.most_common()],
                reasons=list(
                    dict.fromkeys(
                        text
                        for (a, b), (_, text) in sorted(reasons.items(), key=lambda kv: -kv[1][0])
                        if a in inside and b in inside
                    )
                )[:3],
                members=members,
            )
        )
    out.sort(key=lambda g: (-g.dreamers, -g.size, g.first_at))
    out = out[:BUNDLES_MAX]
    # 이름(태그)이 같은 다발이 있을 수 있다 — 태그는 같아도 상상 내용이 다르다. 화면은 이름 아래 대표 상상으로 구분한다
    for k, g in enumerate(out):
        g.key = cluster_name(k)
    return BundlesOut(bundles=out, linked=len(ids), buckets=labels, unit=p.unit)


# ---------------------------------------------------------------- 시작점 찾기 (PostgreSQL)


def search(db: Session, raw: str) -> list[SearchHit]:
    """탐색 시작점 찾기 — 주제 · 욕망 · Dreamer · 상상 각 5개까지.

    홈 검색과 같은 글자 일치 규칙을 쓰되, 운영자 화면이라 욕망 태그도 찾는다. 검색 기록(search_logs)은 남기지 않는다
    (운영자가 찾은 말이 Dreamer 들의 검색 신호에 섞이지 않게).
    """
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
                    id=f"t:{type_}:{t.name}",
                    kind="tech" if type_ == "tech" else "desire",
                    label=t.label,
                    sub=f"상상 {count}개",
                )
            )
    like = _like(q.replace(" ", "").lstrip("@"))
    for u in db.scalars(
        select(User)
        .where(User.nickname.ilike(like, escape=ESC))
        .order_by(User.id)
        .limit(SEARCH_MAX)
    ):
        hits.append(
            SearchHit(id=f"u:{u.id}", kind="dreamer", label=u.nickname, sub=f"@{u.nickname}")
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
    )
