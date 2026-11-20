"""graph 모델 — Memgraph 반영 기록 · 근거함 · 태그 임베딩 (기획안 v12 7장 graph_sync_logs, Sprint 7).

전체 다시 만들기는 성공 · 실패 모두 남기고(노드 · 연결 수), 글 하나 반영은 실패만 남긴다 (성공까지 남기면 너무 많다).
탐색기 맨 위 "마지막 반영"이 이 표를 읽는다.
"""

from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.domains.similar.models import EMBEDDING_DIM
from app.infrastructure.core.database import Base


class GraphSyncLog(Base):
    __tablename__ = "graph_sync_logs"
    __table_args__ = (Index("ix_graph_sync_logs_kind", "kind", "created_at"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    kind: Mapped[str] = mapped_column(String(12))  # full_build | event
    target_id: Mapped[int | None] = mapped_column(BigInteger)  # event: 상상 id
    status: Mapped[str] = mapped_column(String(10))  # success | failed
    nodes: Mapped[int | None] = mapped_column(Integer)
    edges: Mapped[int | None] = mapped_column(Integer)
    error: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ExplorerPin(Base):
    """Observe Note 근거함 (2026-11-20 사용자 결정, v13 5장) — 운영자가 탐색기에서 담아 둔 신호 · 원문.

    운영자마다 따로 모은다. 노트를 쓸 때 오른쪽 · 아래 근거함에서 꺼내 본문에 넣는다 (AI 가 글을 쓰지 않는다, 원칙 4).
    kind: quote(원문 상상) · fusion(기술 × 욕망 교차) · collision(기술 충돌) · zone(압력장) · lineage(계보) · cascade(확산 경로)
    ref: 다시 찾아갈 수 있는 값 {view, node, imagination_ids, period, domain}
    """

    __tablename__ = "explorer_pins"
    __table_args__ = (Index("ix_explorer_pins_admin", "admin_id", "created_at"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str] = mapped_column(Text)
    stat: Mapped[str] = mapped_column(String(300), default="")
    ref: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TagEmbedding(Base):
    """태그 이름 임베딩 (2026-11-20, v13 5장) — 욕망 태그를 뜻이 가까운 것끼리 묶는 데 쓴다 (CLI embed-tags)."""

    __tablename__ = "tag_embeddings"

    tag_id: Mapped[int] = mapped_column(ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True)
    model: Mapped[str] = mapped_column(String(80))
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
