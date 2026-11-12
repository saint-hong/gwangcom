"""비슷한 상상 = 2단계 검색 (기획안 v10 F23, v11 반영목록 5장 — 2026-11-11 사용자 결정).

1) pgvector 로 후보를 넓게 가져온다 (SIMILAR_CANDIDATES, 기본 20 — 다른 작성자 · 보이는 원본 · 인용)
2) LLM(similar_rerank)이 기준 상상과 후보를 함께 보고 정말 비슷한 것만 골라 순서 + 이유를 붙인다
3) similar_sets · similar_links 에 저장 → 상세 화면은 저장된 것을 보여 준다 (화면을 열 때마다 LLM 을 부르지 않음)

LLM 이 실패하거나 하루 한도에 걸리면 벡터 순서 위 5개를 저장한다 (method=vector, 이유 없음).
CLI similar-all 이 vector 로 저장된 것과 아직 계산하지 않은 것을 다시 계산한다.
"""

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.domains.imaginations.models import Imagination
from app.domains.similar.models import ImaginationEmbedding, SimilarLink, SimilarSet
from app.domains.similar.service import KINDS, Similar, find_similar
from app.infrastructure.core.config import get_settings
from app.infrastructure.embeddings import get_embedder
from app.infrastructure.llm import prompts, router
from app.infrastructure.llm.providers.base import LlmError

BODY_CHARS = 300  # 후보 본문은 이만큼만 보여 준다 (비용)
REASON_CHARS = 60
SCHEMA = {
    "type": "object",
    "properties": {
        "picks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"id": {"type": "integer"}, "reason": {"type": "string"}},
                "required": ["id", "reason"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["picks"],
    "additionalProperties": False,
}


def _describe(item: Imagination) -> str:
    lines = [
        f"분야: {item.domain.name}",
        f"제목: {item.display_title}",
        f"상상: {item.body[:BODY_CHARS]}",
    ]
    if item.desire:
        lines.append(f"왜 원하나요: {item.desire}")
    return "\n".join(lines)


def _save(db: Session, item: Imagination, method: str, model: str, n: int, picks) -> None:
    """picks = [(Similar, reason | None)] 순서대로. 이전 결과는 갈아 끼운다."""
    db.execute(delete(SimilarSet).where(SimilarSet.imagination_id == item.id))
    db.flush()
    db.add(SimilarSet(imagination_id=item.id, method=method, model=model, candidate_count=n))
    db.flush()
    for rank, (sim, reason) in enumerate(picks, start=1):
        db.add(
            SimilarLink(
                imagination_id=item.id,
                similar_id=sim.item.id,
                rank=rank,
                score=sim.score,
                reason=(reason or "").strip()[:REASON_CHARS] or None,
            )
        )
    db.commit()


def compute_similar(db: Session, item: Imagination) -> str | None:
    """한 상상의 비슷한 상상을 계산해 저장한다 → 'rerank' | 'vector' | None(대상 아님 · 임베딩 없음)."""
    if item.kind not in KINDS or item.status != "visible":
        return None
    if db.get(ImaginationEmbedding, item.id) is None:
        return None
    s = get_settings()
    cands: list[Similar] = find_similar(db, item.id, limit=s.similar_candidates)
    if not cands:
        _save(db, item, "rerank", router.route("similar_rerank")[1], 0, [])
        return "rerank"

    by_id = {c.item.id: c for c in cands}
    block = "\n\n".join(f"[{c.item.id}]\n{_describe(c.item)}" for c in cands)
    system, user = prompts.render(
        "similar_rerank", limit=str(s.similar_show), base=_describe(item), candidates=block
    )
    try:
        res = router.generate_json(
            db,
            "similar_rerank",
            system=system,
            user=user,
            schema=SCHEMA,
            max_tokens=2000,
            imagination_id=item.id,
        )
    except LlmError:  # 실패 · 거절 · 하루 한도 → 벡터 순서로 (나중에 similar-all 로 다시)
        db.rollback()
        picks = [(c, None) for c in cands[: s.similar_show]]
        _save(db, item, "vector", get_embedder().model, len(cands), picks)
        return "vector"

    picks, seen = [], set()
    for p in res.data.get("picks", []):
        sim = by_id.get(p.get("id"))
        if sim is None or sim.item.id in seen:  # 후보에 없는 번호는 버린다
            continue
        seen.add(sim.item.id)
        picks.append((sim, p.get("reason")))
        if len(picks) >= s.similar_show:
            break
    _save(db, item, "rerank", router.route("similar_rerank")[1], len(cands), picks)
    return "rerank"


def compute_all(db: Session, *, force: bool = False) -> dict[str, int]:
    """아직 계산하지 않았거나 벡터로만 저장된(force 면 전부) 원본 · 인용을 계산한다."""
    q = (
        select(Imagination)
        .join(ImaginationEmbedding, ImaginationEmbedding.imagination_id == Imagination.id)
        .where(Imagination.status == "visible", Imagination.kind.in_(KINDS))
    )
    if not force:
        done = select(SimilarSet.imagination_id).where(SimilarSet.method == "rerank")
        q = q.where(Imagination.id.not_in(done))
    counts = {"rerank": 0, "vector": 0}
    for item in db.scalars(q.order_by(Imagination.id)).unique():
        method = compute_similar(db, item)
        if method:
            counts[method] += 1
    return counts


# ---------------------------------------------------------------- 화면용 읽기


def similar_for(db: Session, item_id: int, user):
    """상세 화면 "비슷한 상상" (F23). 저장된 리랭킹 결과 → 없으면 벡터 → 임베딩도 없으면 같은 분야 · 태그."""
    from app.domains.imaginations import crud
    from app.domains.imaginations.service import present
    from app.domains.similar.schemas import SimilarItemOut, SimilarOut
    from app.shared.errors import not_found

    item = crud.get_visible(db, item_id)
    if item is None:
        raise not_found("상상을 찾을 수 없어요.")
    if item.kind not in KINDS:  # 혼합 · 댓글은 대상이 아니다
        return SimilarOut(items=[], method="none")
    show = get_settings().similar_show

    rows: list[tuple[Imagination, float | None, str | None]] = []
    method = "none"
    saved = db.get(SimilarSet, item.id)
    if saved is not None:
        method = saved.method
        for link, sim in db.execute(
            select(SimilarLink, Imagination)
            .join(Imagination, Imagination.id == SimilarLink.similar_id)
            .where(SimilarLink.imagination_id == item.id, Imagination.status == "visible")
            .order_by(SimilarLink.rank)
        ).unique():
            rows.append((sim, link.score, link.reason))
    elif db.get(ImaginationEmbedding, item.id) is not None:
        method = "vector"
        rows = [(s.item, s.score, None) for s in find_similar(db, item.id, limit=show)]
    else:
        method = "tags"
        rows = [(i, None, None) for i in _by_tags(db, item, show)]

    out = present(db, [r[0] for r in rows], user)
    return SimilarOut(
        items=[
            SimilarItemOut(item=o, score=r[1], reason=r[2]) for o, r in zip(out, rows, strict=True)
        ],
        method=method,  # type: ignore[arg-type]
    )


def _by_tags(db: Session, item: Imagination, limit: int) -> list[Imagination]:
    """임베딩이 없을 때: 겹치는 태그가 많은 순 → 같은 분야 최신순 (다른 작성자만)."""
    from sqlalchemy import func

    from app.domains.tags.models import ImaginationTag

    active = ImaginationTag.removed_at.is_(None)  # 작성자가 지운 태그는 빼고
    mine = select(ImaginationTag.tag_id).where(ImaginationTag.imagination_id == item.id, active)
    shared = (
        select(ImaginationTag.imagination_id, func.count().label("n"))
        .where(ImaginationTag.tag_id.in_(mine), active)
        .group_by(ImaginationTag.imagination_id)
        .subquery()
    )
    q = (
        select(Imagination)
        .outerjoin(shared, shared.c.imagination_id == Imagination.id)
        .where(
            Imagination.id != item.id,
            Imagination.author_id != item.author_id,
            Imagination.status == "visible",
            Imagination.kind.in_(KINDS),
            (shared.c.n > 0) | (Imagination.domain_id == item.domain_id),
        )
        .order_by(func.coalesce(shared.c.n, 0).desc(), Imagination.created_at.desc())
        .limit(limit)
    )
    return list(db.scalars(q).unique())
