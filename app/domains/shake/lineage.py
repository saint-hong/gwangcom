"""상상 계보 (기획안 v10 F9 · S15, Sprint 5-C) — Shake it 으로 이어진 글들의 그물.

- 노드: 글 (원본 · 인용 · 혼합), 관계: 재료 글 → 혼합 글 (imagination_parents)
- 현재 글에서 위(조상 = 재료)로 up 단계, 아래(자손 = 혼합 글)로 down 단계. 기본 3 · 3, 노드 최대 100개
- 지워진 글도 자리는 남긴다 (deleted=true, 내용 없음) — 계보가 끊어지지 않게
"""

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domains.imaginations import crud
from app.domains.imaginations.models import Imagination
from app.domains.imaginations.schemas import DomainRef
from app.domains.shake.models import ImaginationParent
from app.domains.users.schemas import AuthorOut, author_out
from app.shared.errors import not_found

MAX_DEPTH = 5
MAX_NODES = 100


class LineageNode(BaseModel):
    id: int
    depth: int  # 0 = 현재 글, 음수 = 조상(재료), 양수 = 자손(혼합 글)
    kind: str | None = None
    deleted: bool = False
    display_title: str | None = None
    author: AuthorOut | None = None
    domain: DomainRef | None = None


class LineageEdge(BaseModel):
    source: int  # 재료 글
    target: int  # 혼합 글
    position: int  # 0 = 상대 글, 1 = 섞은 사람의 글


class LineageOut(BaseModel):
    center_id: int
    nodes: list[LineageNode]
    edges: list[LineageEdge]
    truncated: bool  # 노드가 너무 많아 잘랐으면 true ("더 보기")


def lineage(db: Session, item_id: int, up: int = 3, down: int = 3) -> LineageOut:
    center = crud.get_visible(db, item_id)
    if center is None:
        raise not_found("상상을 찾을 수 없어요.")
    up, down = max(0, min(up, MAX_DEPTH)), max(0, min(down, MAX_DEPTH))

    depth: dict[int, int] = {center.id: 0}
    edges: dict[tuple[int, int], int] = {}
    truncated = False

    def walk(direction: int, steps: int) -> None:
        nonlocal truncated
        frontier = {center.id}
        for level in range(1, steps + 1):
            if not frontier:
                return
            col = ImaginationParent.child_id if direction < 0 else ImaginationParent.parent_id
            rows = db.scalars(select(ImaginationParent).where(col.in_(frontier))).all()
            nxt: set[int] = set()
            for r in rows:
                other = r.parent_id if direction < 0 else r.child_id
                if other not in depth:
                    if len(depth) >= MAX_NODES:
                        truncated = True
                        continue
                    depth[other] = direction * level
                    nxt.add(other)
                edges[(r.parent_id, r.child_id)] = r.position
            frontier = nxt

    walk(-1, up)
    walk(1, down)

    items = {
        i.id: i for i in db.scalars(select(Imagination).where(Imagination.id.in_(depth))).unique()
    }
    nodes = []
    for nid, d in sorted(depth.items(), key=lambda kv: (kv[1], kv[0])):
        it = items.get(nid)
        if it is None or it.status != "visible":
            nodes.append(LineageNode(id=nid, depth=d, deleted=True))
            continue
        nodes.append(
            LineageNode(
                id=nid,
                depth=d,
                kind=it.kind,
                display_title=it.display_title,
                author=author_out(it.author),
                domain=DomainRef(slug=it.domain.slug, name=it.domain.name),
            )
        )
    return LineageOut(
        center_id=center.id,
        nodes=nodes,
        edges=[
            LineageEdge(source=p, target=c, position=pos)
            for (p, c), pos in edges.items()
            if p in depth and c in depth
        ],
        truncated=truncated,
    )
