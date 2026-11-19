"""graph 모델 — Memgraph 반영 기록 (기획안 v12 7장 graph_sync_logs, Sprint 7).

전체 다시 만들기는 성공 · 실패 모두 남기고(노드 · 연결 수), 글 하나 반영은 실패만 남긴다 (성공까지 남기면 너무 많다).
탐색기 맨 위 "마지막 반영"이 이 표를 읽는다.
"""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

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
