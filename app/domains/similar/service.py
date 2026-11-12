"""비슷한 상상 (기획안 v10 F23) — 임베딩 만들기 · 저장 · 찾기. 상세 화면 블록은 Sprint 5.

- 대상: 원본 · 인용, 보이는 글만 (혼합 · 댓글 제외)
- 임베딩할 글 = 제목 + 본문 + 왜 원하나요
- 찾기: 코사인 유사도(1 - 거리) 높은 순, 다른 작성자의 글만
"""

import time
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.domains.imaginations.models import Imagination
from app.domains.similar.models import ImaginationEmbedding
from app.infrastructure.core.config import get_settings
from app.infrastructure.embeddings import get_embedder
from app.infrastructure.llm.models import LlmCall

KINDS = ("original", "quote")


def text_of(item: Imagination) -> str:
    parts = [item.title or "", item.body, f"왜 원하나요: {item.desire}" if item.desire else ""]
    return "\n".join(p for p in parts if p).strip()


def embed_items(db: Session, items: list[Imagination]) -> int:
    """items 를 임베딩해 저장(있으면 갈아 끼움). 호출 한 번을 llm_calls(feature=embedding)에 남긴다."""
    if not items:
        return 0
    s = get_settings()
    embedder = get_embedder()
    texts = [text_of(i) for i in items]
    started = time.perf_counter()
    row = LlmCall(feature="embedding", provider=embedder.name, model=embedder.model)
    try:
        vectors = embedder.embed(texts)
    except Exception as e:
        row.status, row.error = "failed", str(e)[:500]
        row.latency_ms = int((time.perf_counter() - started) * 1000)
        db.add(row)
        db.commit()
        raise
    # Gemini 임베딩 응답에는 토큰 수가 없어서 글자 수로 어림한다 (한국어 약 1.5자 = 1토큰)
    tokens = int(sum(len(t) for t in texts) / 1.5)
    row.status, row.input_tokens = "success", tokens
    row.est_cost_usd = (
        Decimal(0)
        if embedder.name == "fake"
        else Decimal(str(round(tokens * s.embedding_price_per_mtok / 1e6, 6)))
    )
    row.latency_ms = int((time.perf_counter() - started) * 1000)
    db.add(row)
    for item, vec in zip(items, vectors, strict=True):
        stmt = insert(ImaginationEmbedding).values(
            imagination_id=item.id, model=embedder.model, embedding=vec
        )
        db.execute(
            stmt.on_conflict_do_update(
                index_elements=[ImaginationEmbedding.imagination_id],
                set_={"model": stmt.excluded.model, "embedding": stmt.excluded.embedding},
            )
        )
    db.commit()
    return len(items)


def embed_all(db: Session, *, force: bool = False) -> int:
    """아직 임베딩이 없는(force 면 전부) 원본 · 인용을 임베딩한다."""
    q = select(Imagination).where(Imagination.status == "visible", Imagination.kind.in_(KINDS))
    if not force:
        model = get_embedder().model
        done = select(ImaginationEmbedding.imagination_id).where(
            ImaginationEmbedding.model == model
        )
        q = q.where(Imagination.id.not_in(done))
    items = list(db.scalars(q.order_by(Imagination.id)).unique())
    total = 0
    for i in range(0, len(items), 100):
        total += embed_items(db, items[i : i + 100])
    return total


@dataclass
class Similar:
    item: Imagination
    score: float


def find_similar(db: Session, item_id: int, limit: int = 5) -> list[Similar]:
    """item 과 비슷한 다른 작성자의 상상 (점수 높은 순). 기준값으로 거르지 않고 점수를 함께 돌려준다."""
    base = db.get(ImaginationEmbedding, item_id)
    target = db.get(Imagination, item_id)
    if base is None or target is None:
        return []
    dist = ImaginationEmbedding.embedding.cosine_distance(base.embedding)
    rows = db.execute(
        select(Imagination, dist.label("d"))
        .join(ImaginationEmbedding, ImaginationEmbedding.imagination_id == Imagination.id)
        .where(
            Imagination.id != item_id,
            Imagination.author_id != target.author_id,
            Imagination.status == "visible",
            Imagination.kind.in_(KINDS),
            ImaginationEmbedding.model == base.model,
        )
        .order_by(dist)
        .limit(limit)
    ).unique()
    return [Similar(item=r[0], score=round(1 - float(r[1]), 4)) for r in rows]
