"""Memgraph 연결 (기획안 v12 9-2장, Sprint 7) — 서비스 코드는 run() · is_ready() 만 쓴다.

Memgraph 는 PostgreSQL 에서 만들어 내는 분석용 복사본이다. 원본은 늘 PostgreSQL.
꺼져 있거나 GRAPH_ENABLED=false 면 GraphUnavailable 을 던진다 → 탐색기만 "연결할 수 없음", 나머지 서비스는 그대로.
드라이버: Python neo4j (Bolt 프로토콜, Insurance-Helper-v4 와 같음).
"""

import logging
from functools import lru_cache
from typing import Any

from app.infrastructure.core.config import get_settings

log = logging.getLogger(__name__)


class GraphUnavailable(Exception):
    """그래프 DB 를 쓸 수 없다 (꺼 둠 · 연결 안 됨 · 질의 실패)."""


@lru_cache(maxsize=1)
def _driver():
    from neo4j import GraphDatabase

    s = get_settings()
    auth = (
        (s.graph_user, s.graph_password.get_secret_value() if s.graph_password else "")
        if s.graph_user
        else None
    )
    return GraphDatabase.driver(
        s.graph_uri,
        auth=auth,
        connection_timeout=s.graph_timeout_seconds,
        connection_acquisition_timeout=s.graph_timeout_seconds,
        max_transaction_retry_time=0,
    )


def enabled() -> bool:
    return get_settings().graph_enabled


def run(query: str, **params: Any) -> list[dict[str, Any]]:
    """Cypher 한 번 실행 → 줄마다 dict."""
    if not enabled():
        raise GraphUnavailable("그래프 DB 를 꺼 두었어요 (GRAPH_ENABLED=false).")
    try:
        with _driver().session() as session:
            return [r.data() for r in session.run(query, params)]
    except GraphUnavailable:
        raise
    except Exception as e:  # noqa: BLE001 — 연결 실패 · 질의 오류 모두 "쓸 수 없음"으로
        log.warning("Memgraph 질의 실패: %s", e)
        raise GraphUnavailable(f"그래프 DB 에 연결할 수 없어요: {str(e)[:200]}") from e


def run_many(statements: list[tuple[str, dict[str, Any]]]) -> None:
    """여러 질의를 한 세션에서 차례로 (전체 다시 만들기 · 한 상상 반영)."""
    if not enabled():
        raise GraphUnavailable("그래프 DB 를 꺼 두었어요 (GRAPH_ENABLED=false).")
    try:
        with _driver().session() as session:
            for query, params in statements:
                session.run(query, params).consume()
    except Exception as e:  # noqa: BLE001
        log.warning("Memgraph 쓰기 실패: %s", e)
        raise GraphUnavailable(f"그래프 DB 에 쓰지 못했어요: {str(e)[:200]}") from e


def is_ready() -> bool:
    try:
        run("RETURN 1 AS ok")
        return True
    except GraphUnavailable:
        return False
