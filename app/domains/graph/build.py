"""PostgreSQL → Memgraph 복사 (기획안 v12 F22 · 7장 Memgraph 그래프 구조, Sprint 7).

원본은 늘 PostgreSQL 이다. Memgraph 는 탐색기에서 연결을 따라가기 위한 복사본이라 언제든 지우고 다시 만들 수 있다.

  노드  (:Imagination {id, kind, title, excerpt, domain, domain2, author_id, author, created, thunders, waves,
                       tsne_x, tsne_y, umap_x, umap_y,   의미 지도 좌표 0~1 (2026-11-20, 임베딩이 있는 글 · 혼합 글은 재료 가운데)
                       synergy})                         혼합 글: 조합 시너지 (재료보다 더 받은 Thunder, 대시보드와 같은 규칙)
        (:User {id, nickname})
        (:Tag {key, name, label, type, cluster, cluster_label})   key = "tech:드론" · "desire:…", 욕망은 뜻이 가까운 묶음
  연결  (User)-[:WROTE]->(Imagination)
        (User)-[:WAVED {via, at}]->(Imagination)      Wave (via = 이 사람의 Wave 를 보고 함, 2026-11-20 확산 경로)
        (User)-[:THUNDERED {at}]->(Imagination)       Thunder (확산 경로에서 공명 세기)
        (Imagination)-[:HAS_TAG]->(Tag)               작성자가 지운 태그는 뺀다
        (Imagination)-[:BLENDED_INTO {position}]->(Imagination)   Shake it 재료 → 혼합 글
        (Imagination)-[:QUOTES]->(Imagination)        인용 글 → 원본
        (Imagination)-[:SIMILAR_TO {score, reason, rank, method}]->(Imagination)   비슷한 상상 (similar_links)

- 대상: 보이는 원본 · 인용 · 혼합 (댓글 · 숨긴 글 · 지운 글은 넣지 않는다)
- created 는 초 단위 숫자 (기간 거르기용). 반응 수는 반영 시점 값이다 (화면 상세는 PostgreSQL 에서 다시 읽는다)
- full_build: 모두 지우고 다시 만든다 (여러 번 실행해도 같은 결과). 의미 지도 좌표 · 욕망 묶음 · 시너지도 이때 계산한다
- Wave · Thunder 연결은 다시 만들 때 반영한다 (반응마다 반영하지 않음)
- sync_imagination: 글 하나를 반영한다 (새 글 · 태그 편집 · 삭제 · 숨김 뒤, 백그라운드). 실패해도 서비스에는 영향 없음
"""

import logging
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domains.analytics.engagement import blend_synergies
from app.domains.graph import semantic
from app.domains.graph.models import GraphSyncLog, TagEmbedding
from app.domains.imaginations.models import Imagination
from app.domains.reactions.models import Thunder, Wave
from app.domains.shake.models import ImaginationParent
from app.domains.similar.models import ImaginationEmbedding, SimilarLink, SimilarSet
from app.domains.tags.models import ImaginationTag, Tag
from app.domains.tags.service import ACTIVE
from app.domains.users.models import User
from app.infrastructure import graph
from app.infrastructure.core.database import get_sessionmaker

log = logging.getLogger(__name__)

GRAPH_KINDS = ("original", "quote", "blend")
BATCH = 500
EXCERPT = 120


@dataclass
class Snapshot:
    """PostgreSQL 에서 읽은 그래프 재료 (Memgraph 에 쓰기 전)."""

    items: list[dict[str, Any]] = field(default_factory=list)
    users: list[dict[str, Any]] = field(default_factory=list)
    tags: list[dict[str, Any]] = field(default_factory=list)
    has_tag: list[dict[str, Any]] = field(default_factory=list)
    blended: list[dict[str, Any]] = field(default_factory=list)
    quotes: list[dict[str, Any]] = field(default_factory=list)
    similar: list[dict[str, Any]] = field(default_factory=list)
    waves: list[dict[str, Any]] = field(default_factory=list)
    thunders: list[dict[str, Any]] = field(default_factory=list)

    @property
    def node_count(self) -> int:
        return len(self.items) + len(self.users) + len(self.tags)

    @property
    def edge_count(self) -> int:
        return (
            len(self.items)  # WROTE
            + len(self.has_tag)
            + len(self.blended)
            + len(self.quotes)
            + len(self.similar)
            + len(self.waves)
            + len(self.thunders)
        )


def tag_key(type_: str, name: str) -> str:
    return f"{type_}:{name}"


def _item_row(i: Imagination) -> dict[str, Any]:
    body = " ".join(i.body.split())
    return {
        "id": i.id,
        "kind": i.kind,
        "title": i.display_title,
        "excerpt": body[:EXCERPT] + ("…" if len(body) > EXCERPT else ""),
        "domain": i.domain.slug if i.domain else None,
        "domain2": i.secondary_domain.slug if i.secondary_domain else None,
        "author_id": i.author_id,
        "author": i.author.nickname,
        "created": int(i.created_at.timestamp()),
        "thunders": i.thunder_count,
        "waves": i.wave_count,
        "tsne_x": None,
        "tsne_y": None,
        "umap_x": None,
        "umap_y": None,
        "synergy": None,
    }


def collect(db: Session, only_id: int | None = None) -> Snapshot:
    """그래프 재료를 모은다. only_id 를 주면 그 상상 하나와 그 상상에서 나가는 연결만."""
    snap = Snapshot()
    q = select(Imagination).where(
        Imagination.status == "visible", Imagination.kind.in_(GRAPH_KINDS)
    )
    if only_id is not None:
        q = q.where(Imagination.id == only_id)
    items = list(db.scalars(q.order_by(Imagination.id)).unique())
    if not items:
        return snap
    ids = {i.id for i in items}
    visible = (
        ids
        if only_id is None
        else set(
            db.scalars(
                select(Imagination.id).where(
                    Imagination.status == "visible", Imagination.kind.in_(GRAPH_KINDS)
                )
            )
        )
    )
    snap.items = [_item_row(i) for i in items]
    users = {i.author_id: i.author.nickname for i in items}

    tags: dict[str, dict[str, Any]] = {}
    for item_id, t in db.execute(
        select(ImaginationTag.imagination_id, Tag)
        .join(Tag, Tag.id == ImaginationTag.tag_id)
        .where(ACTIVE, ImaginationTag.imagination_id.in_(ids))
    ):
        key = tag_key(t.type, t.name)
        tags[key] = {
            "key": key,
            "id": t.id,
            "name": t.name,
            "label": t.label,
            "type": t.type,
            "cluster": None,
            "cluster_label": None,
        }
        snap.has_tag.append({"item": item_id, "key": key})
    snap.tags = list(tags.values())

    # 혼합 글의 재료 (재료 → 혼합 글). 글 하나만 반영할 때는 그 글이 혼합 글인 경우의 재료 연결
    for row in db.scalars(select(ImaginationParent).where(ImaginationParent.child_id.in_(ids))):
        if row.parent_id in visible:
            snap.blended.append(
                {"parent": row.parent_id, "child": row.child_id, "position": row.position}
            )
    for i in items:
        if i.kind == "quote" and i.quoted_id in visible:
            snap.quotes.append({"item": i.id, "quoted": i.quoted_id})

    for link, method in db.execute(
        select(SimilarLink, SimilarSet.method)
        .join(SimilarSet, SimilarSet.imagination_id == SimilarLink.imagination_id)
        .where(SimilarLink.imagination_id.in_(ids))
    ):
        if link.similar_id in visible:
            snap.similar.append(
                {
                    "a": link.imagination_id,
                    "b": link.similar_id,
                    "score": round(float(link.score), 4),
                    "reason": link.reason,
                    "rank": link.rank,
                    "method": method,
                }
            )

    # Wave · Thunder (확산 경로 · 공명, 2026-11-20)
    for w in db.scalars(select(Wave).where(Wave.imagination_id.in_(ids))):
        snap.waves.append(
            {
                "user": w.user_id,
                "item": w.imagination_id,
                "via": w.via_user_id,
                "at": int(w.created_at.timestamp()),
            }
        )
    for t in db.scalars(select(Thunder).where(Thunder.imagination_id.in_(ids))):
        snap.thunders.append(
            {"user": t.user_id, "item": t.imagination_id, "at": int(t.created_at.timestamp())}
        )
    reactors = {r["user"] for r in snap.waves + snap.thunders} - set(users)
    if reactors:
        users.update(
            dict(db.execute(select(User.id, User.nickname).where(User.id.in_(reactors))).all())
        )
    snap.users = [{"id": uid, "nickname": nick} for uid, nick in sorted(users.items())]

    if only_id is None:
        _add_desire_clusters(db, snap)
        _add_map_coords(db, snap)
        _add_synergy(db, snap, items)
    return snap


def _add_desire_clusters(db: Session, snap: Snapshot) -> None:
    """욕망 태그를 뜻이 가까운 묶음으로 (tag_embeddings 가 있는 태그만, 나머지는 혼자 한 묶음)."""
    used: dict[str, int] = defaultdict(int)
    for r in snap.has_tag:
        used[r["key"]] += 1
    desires = [t for t in snap.tags if t["type"] == "desire"]
    vectors = {
        name: list(vec)
        for name, vec in db.execute(
            select(Tag.name, TagEmbedding.embedding)
            .join(TagEmbedding, TagEmbedding.tag_id == Tag.id)
            .where(Tag.id.in_([t["id"] for t in desires]))
        )
    }
    clusters = semantic.desire_clusters(
        [(t["name"], t["label"], used[t["key"]]) for t in desires], vectors
    )
    for t in snap.tags:
        if t["type"] == "desire":
            t["cluster"], t["cluster_label"] = clusters[t["name"]]


def _add_map_coords(db: Session, snap: Snapshot) -> None:
    """의미 지도 좌표 (t-SNE · UMAP). 임베딩이 있는 원본 · 인용만 계산하고, 혼합 글은 재료 좌표의 가운데에 둔다."""
    by_id = {r["id"]: r for r in snap.items}
    rows = db.execute(
        select(ImaginationEmbedding.imagination_id, ImaginationEmbedding.embedding)
        .where(ImaginationEmbedding.imagination_id.in_(list(by_id)))
        .order_by(ImaginationEmbedding.imagination_id)
    ).all()
    ids = [r[0] for r in rows]
    vectors = [list(r[1]) for r in rows]
    for method in semantic.METHODS:
        xy = semantic.project(vectors, method)
        if xy is None:
            continue
        for iid, (x, y) in zip(ids, xy, strict=True):
            by_id[iid][f"{method}_x"], by_id[iid][f"{method}_y"] = x, y
        parents: dict[int, list[int]] = defaultdict(list)
        for b in snap.blended:
            parents[b["child"]].append(b["parent"])
        for child in sorted(parents):  # 재료가 먼저 올라오므로 id 순서면 재료 좌표가 먼저 정해진다
            pts = [
                (by_id[p][f"{method}_x"], by_id[p][f"{method}_y"])
                for p in parents[child]
                if p in by_id and by_id[p][f"{method}_x"] is not None
            ]
            if pts and child in by_id:
                by_id[child][f"{method}_x"] = round(sum(p[0] for p in pts) / len(pts), 5)
                by_id[child][f"{method}_y"] = round(sum(p[1] for p in pts) / len(pts), 5)


def _add_synergy(db: Session, snap: Snapshot, items: list[Imagination]) -> None:
    """혼합 글마다 조합 시너지 (대시보드 Shake it 탭과 같은 규칙)."""
    created = {i.id: i.created_at for i in items}
    parents: dict[int, list[int]] = defaultdict(list)
    for b in snap.blended:
        parents[b["child"]].append(b["parent"])
    diffs = blend_synergies(
        db,
        [
            (c, created[c], [(p, created[p]) for p in ps if p in created])
            for c, ps in parents.items()
            if c in created
        ],
    )
    for r in snap.items:
        if r["id"] in diffs:
            r["synergy"] = round(diffs[r["id"]], 2)


# ---------------------------------------------------------------- Cypher

_ITEM_SET = (
    "SET n.kind = r.kind, n.title = r.title, n.excerpt = r.excerpt, n.domain = r.domain, "
    "n.domain2 = r.domain2, n.author_id = r.author_id, n.author = r.author, "
    "n.created = r.created, n.thunders = r.thunders, n.waves = r.waves, "
    # 글 하나 반영 때는 좌표 · 시너지를 계산하지 않으므로 있던 값을 지킨다
    "n.tsne_x = coalesce(r.tsne_x, n.tsne_x), n.tsne_y = coalesce(r.tsne_y, n.tsne_y), "
    "n.umap_x = coalesce(r.umap_x, n.umap_x), n.umap_y = coalesce(r.umap_y, n.umap_y), "
    "n.synergy = coalesce(r.synergy, n.synergy)"
)
_WRITE = [
    ("users", "UNWIND $rows AS r MERGE (u:User {id: r.id}) SET u.nickname = r.nickname"),
    (
        "tags",
        "UNWIND $rows AS r MERGE (t:Tag {key: r.key}) SET t.name = r.name, t.label = r.label, "
        "t.type = r.type, t.cluster = coalesce(r.cluster, t.cluster, 'dc:' + r.name), "
        "t.cluster_label = coalesce(r.cluster_label, t.cluster_label, r.label)",
    ),
    ("items", "UNWIND $rows AS r MERGE (n:Imagination {id: r.id}) " + _ITEM_SET),
    (
        "items",
        "UNWIND $rows AS r MATCH (u:User {id: r.author_id}), (n:Imagination {id: r.id}) "
        "MERGE (u)-[:WROTE]->(n)",
    ),
    (
        "has_tag",
        "UNWIND $rows AS r MATCH (n:Imagination {id: r.item}), (t:Tag {key: r.key}) "
        "MERGE (n)-[:HAS_TAG]->(t)",
    ),
    (
        "blended",
        "UNWIND $rows AS r MATCH (p:Imagination {id: r.parent}), (c:Imagination {id: r.child}) "
        "MERGE (p)-[e:BLENDED_INTO]->(c) SET e.position = r.position",
    ),
    (
        "quotes",
        "UNWIND $rows AS r MATCH (n:Imagination {id: r.item}), (o:Imagination {id: r.quoted}) "
        "MERGE (n)-[:QUOTES]->(o)",
    ),
    (
        "similar",
        "UNWIND $rows AS r MATCH (a:Imagination {id: r.a}), (b:Imagination {id: r.b}) "
        "MERGE (a)-[e:SIMILAR_TO]->(b) SET e.score = r.score, e.reason = r.reason, "
        "e.rank = r.rank, e.method = r.method",
    ),
    (
        "waves",
        "UNWIND $rows AS r MATCH (u:User {id: r.user}), (n:Imagination {id: r.item}) "
        "MERGE (u)-[e:WAVED]->(n) SET e.via = r.via, e.at = r.at",
    ),
    (
        "thunders",
        "UNWIND $rows AS r MATCH (u:User {id: r.user}), (n:Imagination {id: r.item}) "
        "MERGE (u)-[e:THUNDERED]->(n) SET e.at = r.at",
    ),
]
_INDEXES = [
    "CREATE INDEX ON :Imagination(id)",
    "CREATE INDEX ON :User(id)",
    "CREATE INDEX ON :Tag(key)",
]


def _write_statements(snap: Snapshot) -> list[tuple[str, dict[str, Any]]]:
    out = []
    for attr, query in _WRITE:
        rows = getattr(snap, attr)
        for i in range(0, len(rows), BATCH):
            out.append((query, {"rows": rows[i : i + BATCH]}))
    return out


def _log(db: Session, **kw: Any) -> None:
    db.add(GraphSyncLog(**kw))
    db.commit()


def full_build(db: Session) -> Snapshot:
    """Memgraph 를 모두 지우고 PostgreSQL 에서 다시 만든다. 실패하면 GraphUnavailable."""
    snap = collect(db)
    try:
        for q in _INDEXES:  # 이미 있으면 Memgraph 가 그냥 넘어간다
            graph.run(q)
        graph.run_many([("MATCH (n) DETACH DELETE n", {}), *_write_statements(snap)])
    except graph.GraphUnavailable as e:
        _log(db, kind="full_build", status="failed", error=str(e)[:500])
        raise
    _log(
        db,
        kind="full_build",
        status="success",
        nodes=snap.node_count,
        edges=snap.edge_count,
    )
    return snap


def sync_imagination(item_id: int) -> None:
    """글 하나를 Memgraph 에 반영한다 (백그라운드). 보이지 않는 글이면 지운다. 실패는 기록만 남긴다."""
    if not graph.enabled():
        return
    with get_sessionmaker()() as db:
        snap = collect(db, only_id=item_id)
        try:
            if not snap.items:
                graph.run("MATCH (n:Imagination {id: $id}) DETACH DELETE n", id=item_id)
                return
            graph.run_many(
                [
                    # 이 글에서 나가는 태그 · 비슷한 상상 연결은 새로 그린다
                    (
                        "MATCH (n:Imagination {id: $id})-[e:HAS_TAG|SIMILAR_TO]->() DELETE e",
                        {"id": item_id},
                    ),
                    *_write_statements(snap),
                ]
            )
        except graph.GraphUnavailable as e:
            _log(db, kind="event", target_id=item_id, status="failed", error=str(e)[:500])
        except Exception:  # noqa: BLE001 — 백그라운드 작업은 서비스에 영향을 주지 않는다
            log.exception("그래프 반영 실패: imagination %s", item_id)


def embed_desire_tags(db: Session, *, force: bool = False) -> int:
    """쓰이고 있는 욕망 태그 이름을 임베딩해 tag_embeddings 에 저장 (없는 것만, force 면 전부) — 욕망 묶음 재료.

    실제 제공자(gemini)면 비용이 든다 (태그 이름이 짧아 아주 적다). 호출은 llm_calls(embedding)에 남는다.
    """
    from sqlalchemy.dialects.postgresql import insert

    from app.domains.graph.explore import desire_tag_ids
    from app.domains.similar.service import embed_texts
    from app.infrastructure.embeddings import get_embedder

    model = get_embedder().model
    ids = desire_tag_ids(db)
    if not force:
        done = set(
            db.scalars(
                select(TagEmbedding.tag_id).where(
                    TagEmbedding.tag_id.in_(ids), TagEmbedding.model == model
                )
            )
        )
        ids = [i for i in ids if i not in done]
    tags = list(db.scalars(select(Tag).where(Tag.id.in_(ids)).order_by(Tag.id)))
    total = 0
    for k in range(0, len(tags), 100):
        chunk = tags[k : k + 100]
        vectors = embed_texts(db, [t.label for t in chunk])
        for t, vec in zip(chunk, vectors, strict=True):
            stmt = insert(TagEmbedding).values(tag_id=t.id, model=model, embedding=vec)
            db.execute(
                stmt.on_conflict_do_update(
                    index_elements=[TagEmbedding.tag_id],
                    set_={"model": stmt.excluded.model, "embedding": stmt.excluded.embedding},
                )
            )
        db.commit()
        total += len(chunk)
    return total
