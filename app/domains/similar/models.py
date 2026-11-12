"""비슷한 상상 모델 — 임베딩(pgvector) · 리랭킹 결과 (기획안 v10 F23 · 7장, v11 반영목록 5장).

원본 · 인용만 임베딩한다 (혼합 글은 AI 텍스트라서, 댓글은 대화라서 뺀다).
모델을 바꾸면 차원이 달라질 수 있으므로 마이그레이션 + embed-all 로 다시 만든다.
"""

from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, Float, ForeignKey, Index, SmallInteger, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.core.database import Base

EMBEDDING_DIM = (
    768  # .env EMBEDDING_DIM 과 같아야 한다 (gemini-embedding-001 을 768 차원으로 줄여 씀)
)


class ImaginationEmbedding(Base):
    __tablename__ = "imagination_embeddings"

    imagination_id: Mapped[int] = mapped_column(
        ForeignKey("imaginations.id", ondelete="CASCADE"), primary_key=True
    )
    model: Mapped[str] = mapped_column(String(80))
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SimilarSet(Base):
    """한 상상의 비슷한 상상 계산 기록 (리랭킹, v11 반영목록 5장). 결과가 0개여도 남긴다."""

    __tablename__ = "similar_sets"

    imagination_id: Mapped[int] = mapped_column(
        ForeignKey("imaginations.id", ondelete="CASCADE"), primary_key=True
    )
    method: Mapped[str] = mapped_column(String(10))  # rerank (LLM 이 고름) | vector (LLM 실패 시)
    model: Mapped[str] = mapped_column(String(80))  # 리랭킹에 쓴 LLM (vector 면 임베딩 모델)
    candidate_count: Mapped[int] = mapped_column(SmallInteger)
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class SimilarLink(Base):
    """기준 상상 → 비슷한 상상 (순서 · 벡터 점수 · LLM 이 붙인 이유)."""

    __tablename__ = "similar_links"
    __table_args__ = (Index("ix_similar_links_similar", "similar_id"),)

    imagination_id: Mapped[int] = mapped_column(
        ForeignKey("similar_sets.imagination_id", ondelete="CASCADE"), primary_key=True
    )
    similar_id: Mapped[int] = mapped_column(
        ForeignKey("imaginations.id", ondelete="CASCADE"), primary_key=True
    )
    rank: Mapped[int] = mapped_column(SmallInteger)
    score: Mapped[float] = mapped_column(Float)  # 1단계 벡터 코사인 유사도
    reason: Mapped[str | None] = mapped_column(String(200))
