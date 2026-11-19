"""탐색기 라우터 — /api/admin/graph/* (운영자만, Sprint 7-B).

Memgraph 를 쓸 수 없으면 503 graph_unavailable (탐색기만 안내, 나머지 서비스는 그대로).
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.domains.analytics.frame import first_post_at
from app.domains.analytics.period import PERIOD_PATTERN, Period, PeriodError, make_period
from app.domains.auth.deps import admin_user
from app.domains.graph import build, explore
from app.domains.graph.schemas import BundlesOut, ExpandOut, GraphStatusOut, SearchHit
from app.domains.users.models import User
from app.infrastructure import graph
from app.infrastructure.core.database import get_db
from app.shared.errors import AppError

router = APIRouter(prefix="/api/admin/graph", tags=["graph"])

DB = Annotated[Session, Depends(get_db)]
Admin = Annotated[User, Depends(admin_user)]
PeriodQ = Annotated[str, Query(pattern=PERIOD_PATTERN)]
DomainQ = Annotated[str | None, Query(max_length=20, description="분야 slug")]


def _period(db: Session, period: str) -> Period:
    try:
        return make_period(period, first_post_at(db) if period == "all" else None)
    except PeriodError as e:
        raise AppError(422, "invalid_period", str(e)) from e


def _filter(db: Session, period: str, domain: str | None, blend: bool) -> explore.Filter:
    p = _period(db, period)
    return explore.Filter(
        since=int(p.start_utc.timestamp()),
        until=int(p.end_utc.timestamp()),
        domain=domain or None,
        blend=blend,
    )


def _unavailable(e: graph.GraphUnavailable) -> AppError:
    return AppError(503, "graph_unavailable", str(e))


@router.get("/status", response_model=GraphStatusOut)
def get_status(db: DB, _: Admin):
    """Memgraph 연결 · 지금 점 / 선 수 · 마지막 반영 · 비슷한 상상 계산 현황."""
    return explore.status(db)


@router.post("/rebuild", response_model=GraphStatusOut)
def rebuild(db: DB, _: Admin):
    """그래프 전체 다시 만들기 (CLI graph-build 와 같음)."""
    try:
        build.full_build(db)
    except graph.GraphUnavailable as e:
        raise _unavailable(e) from e
    return explore.status(db)


@router.get("/bundles", response_model=BundlesOut)
def get_bundles(
    db: DB, _: Admin, period: PeriodQ = "all", domain: DomainQ = None, blend: bool = False
):
    """경향 다발 — 서로 다른 Dreamer 가 쓴 비슷한 상상 묶음과 특징 · 흐름 · 신호 (Dreamer 많은 순)."""
    try:
        return explore.bundles(_filter(db, period, domain, blend), _period(db, period))
    except graph.GraphUnavailable as e:
        raise _unavailable(e) from e


@router.get("/expand", response_model=ExpandOut)
def get_expand(
    db: DB,
    _: Admin,
    node: Annotated[str, Query(max_length=120, description='"i:12" · "u:5" · "t:tech:드론"')],
    period: PeriodQ = "all",
    domain: DomainQ = None,
    blend: bool = False,
):
    """파고들기 — 점 하나와 바로 이어진 점들."""
    try:
        return explore.expand(node, _filter(db, period, domain, blend))
    except graph.GraphUnavailable as e:
        raise _unavailable(e) from e


@router.get("/search", response_model=list[SearchHit])
def search(db: DB, _: Admin, q: Annotated[str, Query(max_length=200)]):
    """탐색 시작점 찾기 (주제 · 욕망 · Dreamer · 상상). 검색 기록은 남기지 않는다."""
    return explore.search(db, q)
