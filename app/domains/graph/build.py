"""PostgreSQL → Memgraph 복사 (기획안 v12 F22 · 7장 Memgraph 그래프 구조, Sprint 7).

원본은 늘 PostgreSQL 이다. Memgraph 는 탐색기에서 연결을 따라가기 위한 복사본이라 언제든 지우고 다시 만들 수 있다.

  노드  (:Imagination {id, kind, title, excerpt, domain, domain2, author_id, author, created, thunders, waves})
        (:User {id, nickname})
        (:Tag {key, name, label, type})               key = "tech:드론" · "desire:…"
  연결  (User)-[:WROTE]->(Imagination)
        (Imagination)-[:HAS_TAG]->(Tag)               작성자가 지운 태그는 뺀다
        (Imagination)-[:BLENDED_INTO {position}]->(Imagination)   Shake it 재료 → 혼합 글
        (Imagination)-[:QUOTES]->(Imagination)        인용 글 → 원본
        (Imagination)-[:SIMILAR_TO {score, reason, rank, method}]->(Imagination)   비슷한 상상 (similar_links)

- 대상: 보이는 원본 · 인용 · 혼합 (댓글 · 숨긴 글 · 지운 글은 넣지 않는다)
- created 는 초 단위 숫자 (기간 거르기용). 반응 수는 반영 시점 값이다 (화면 상세는 PostgreSQL 에서 다시 읽는다)
- full_build: 모두 지우고 다시 만든다 (여러 번 실행해도 같은 결과)
- sync_imagination: 글 하나를 반영한다 (새 글 · 태그 편집 · 삭제 · 숨김 뒤, 백그라운드). 실패해도 서비스에는 영향 없음
"""

import logging
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domains.graph.models import GraphSyncLog
from app.domains.imaginations.models import Imagination
from app.domains.shake.models import ImaginationParent
from app.domains.similar.models import SimilarLink, SimilarSet
from app.domains.tags.models import ImaginationTag, Tag
from app.domains.tags.service import ACTIVE
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
    snap.users = [{"id": uid, "nickname": nick} for uid, nick in sorted(users.items())]

    tags: dict[str, dict[str, Any]] = {}
    for item_id, t in db.execute(
        select(ImaginationTag.imagination_id, Tag)
        .join(Tag, Tag.id == ImaginationTag.tag_id)
        .where(ACTIVE, ImaginationTag.imagination_id.in_(ids))
    ):
        key = tag_key(t.type, t.name)
        tags[key] = {"key": key, "name": t.name, "label": t.label, "type": t.type}
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
    return snap


# ---------------------------------------------------------------- Cypher

_ITEM_SET = (
    "SET n.kind = r.kind, n.title = r.title, n.excerpt = r.excerpt, n.domain = r.domain, "
    "n.domain2 = r.domain2, n.author_id = r.author_id, n.author = r.author, "
    "n.created = r.created, n.thunders = r.thunders, n.waves = r.waves"
)
_WRITE = [
    ("users", "UNWIND $rows AS r MERGE (u:User {id: r.id}) SET u.nickname = r.nickname"),
    (
        "tags",
        "UNWIND $rows AS r MERGE (t:Tag {key: r.key}) SET t.name = r.name, t.label = r.label, t.type = r.type",
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
