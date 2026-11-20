"""탐색기 라우터 — /api/admin/graph/* (운영자만, Sprint 7-B · 2026-11-20 다시 짬).

Memgraph 를 쓸 수 없으면 503 graph_unavailable (탐색기만 안내, 나머지 서비스는 그대로). 근거함은 PostgreSQL 이라 늘 쓸 수 있다.
"""

from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.domains.analytics.frame import first_post_at
from app.domains.analytics.period import PERIOD_PATTERN, Period, PeriodError, make_period
from app.domains.auth.deps import admin_user
from app.domains.graph import build, explore, pins
from app.domains.graph.schemas import (
    CascadeOut,
    CascadeSummary,
    FusionOut,
    GraphStatusOut,
    Inspect,
    LineageOut,
    MapOut,
    PinIn,
    PinOut,
    SearchHit,
)
from app.domains.users.models import User
from app.infrastructure import graph
from app.infrastructure.core.database import get_db
from app.shared.errors import AppError

router = APIRouter(prefix="/api/admin/graph", tags=["graph"])

DB = Annotated[Session, Depends(get_db)]
Admin = Annotated[User, Depends(admin_user)]
PeriodQ = Annotated[str, Query(pattern=PERIOD_PATTERN)]
DomainQ = Annotated[str | None, Query(max_length=20, description="분야 slug")]
# 욕망 묶기 기준 (화면 설정): 비우면 graph-build 때 저장한 묶음(기본 0.9), 1 = 묶지 않음
DesireMinQ = Annotated[float | None, Query(ge=0.5, le=1)]
HitQ = Annotated[
    str | None, Query(max_length=60, description="시작점 찾기: tech:이름 · desire:이름")
]
NodeQ = Annotated[
    str, Query(max_length=120, description='"t:드론" 기술 · "d:dc:시간절약" 욕망 묶음')
]


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


def _clusters(db: Session, desire_min: float | None) -> explore.Clusters | None:
    return explore.desire_cluster_map(db, desire_min) if desire_min is not None else None


def _graph[T](fn: Callable[[], T]) -> T:
    try:
        return fn()
    except graph.GraphUnavailable as e:
        raise AppError(503, "graph_unavailable", str(e)) from e


@router.get("/status", response_model=GraphStatusOut)
def get_status(db: DB, _: Admin):
    """Memgraph 연결 · 점 / 선 수 · 마지막 반영 · 비슷한 상상 · 욕망 태그 임베딩 현황."""
    return explore.status(db)


@router.post("/rebuild", response_model=GraphStatusOut)
def rebuild(db: DB, _: Admin):
    """그래프 전체 다시 만들기 (CLI graph-build 와 같음). 의미 지도 좌표 · 욕망 묶음 · 시너지도 다시 계산한다."""
    _graph(lambda: build.full_build(db))
    return explore.status(db)


# ---------------------------------------------------------------- ① 융합과 충돌


@router.get("/fusion")
def get_fusion(
    db: DB,
    _: Admin,
    period: PeriodQ = "all",
    domain: DomainQ = None,
    blend: bool = False,
    techs: Annotated[int, Query(ge=3, le=40)] = explore.TECHS_DEFAULT,
    desires: Annotated[int, Query(ge=2, le=30)] = explore.DESIRES_DEFAULT,
    focus: Annotated[str | None, Query(max_length=120)] = None,
    desire_min: DesireMinQ = None,
) -> dict:
    """기술 × 욕망 묶음 2부 그래프 + 기술 충돌 선. focus = 시작점("tech:드론" · "desire:…" · "t:…")."""
    clusters = _clusters(db, desire_min)
    out, focus_id = _graph(
        lambda: explore.fusion(_filter(db, period, domain, blend), techs, desires, focus, clusters)
    )
    return {**out.model_dump(mode="json"), "focus": focus_id}


@router.get("/fusion/expand", response_model=FusionOut)
def get_fusion_expand(
    db: DB,
    _: Admin,
    node: NodeQ,
    shown: Annotated[str, Query(max_length=8000, description="지금 보이는 점 id, 쉼표로")] = "",
    period: PeriodQ = "all",
    domain: DomainQ = None,
    blend: bool = False,
    desire_min: DesireMinQ = None,
):
    """점 하나 펼치기 (더블클릭) — 아직 안 보이는 2단계 이웃."""
    have = [s for s in shown.split(",") if s]
    clusters = _clusters(db, desire_min)
    return _graph(
        lambda: explore.fusion_expand(_filter(db, period, domain, blend), node, have, clusters)
    )


@router.get("/fusion/inspect", response_model=Inspect)
def get_fusion_inspect(
    db: DB,
    _: Admin,
    a: NodeQ,
    b: Annotated[str | None, Query(max_length=120)] = None,
    period: PeriodQ = "all",
    domain: DomainQ = None,
    blend: bool = False,
    desire_min: DesireMinQ = None,
):
    """점(a) 또는 선(a, b)의 수치 + 원문 상상."""
    clusters = _clusters(db, desire_min)
    return _graph(
        lambda: explore.fusion_inspect(db, _filter(db, period, domain, blend), a, b, clusters)
    )


# ---------------------------------------------------------------- ② 집단 압력 지도


@router.get("/map", response_model=MapOut)
def get_map(
    db: DB,
    _: Admin,
    method: Annotated[str, Query(pattern="^(tsne|umap)$")] = "tsne",
    period: PeriodQ = "all",
    domain: DomainQ = None,
    blend: bool = False,
):
    """의미 지도 (t-SNE · UMAP 좌표) + 압력장."""
    return _graph(lambda: explore.semantic_map(_filter(db, period, domain, blend), method))


@router.get("/items/inspect", response_model=Inspect)
def get_items_inspect(
    db: DB,
    _: Admin,
    ids: Annotated[str, Query(max_length=4000, description="상상 id, 쉼표로")],
    title: Annotated[str, Query(max_length=200)] = "",
    kind: Annotated[str, Query(max_length=20)] = "items",
    period: PeriodQ = "all",
    domain: DomainQ = None,
    blend: bool = False,
):
    """상상 묶음(압력장 · 계보 · 상상 하나)의 수치 + 원문."""
    try:
        id_list = [int(x) for x in ids.split(",") if x][:500]
    except ValueError as e:
        raise AppError(400, "bad_ids", "상상 id 는 숫자예요.") from e
    return _graph(
        lambda: explore.items_inspect(
            db, _filter(db, period, domain, True if kind != "zone" else blend), id_list, title, kind
        )
    )


# ---------------------------------------------------------------- ③ 변이와 진화


@router.get("/lineage", response_model=LineageOut)
def get_lineage(
    db: DB,
    _: Admin,
    period: PeriodQ = "all",
    domain: DomainQ = None,
    cross: bool = False,
    min_synergy: Annotated[float | None, Query(ge=-1000, le=1000)] = None,
    trees: Annotated[int, Query(ge=1, le=40)] = explore.LINEAGE_TREES,
    hit: HitQ = None,
    item: int | None = None,
):
    """Shake it 계보 숲. cross = 분야를 넘는 혼합만, min_synergy = 시너지 이 값 이상만.
    hit(tech:이름 · desire:이름) = 그 태그가 붙은 상상이 든 계보만, item = 그 상상의 계보를 맨 앞에."""

    def run():
        f = _filter(db, period, domain, True)
        only = set(explore.find_ids(f, hit)) if hit else None
        return explore.lineage(f, cross, min_synergy, trees, only, item)

    return _graph(run)


# ---------------------------------------------------------------- ④ 전파와 공명


@router.get("/cascades", response_model=list[CascadeSummary])
def get_cascades(
    db: DB,
    _: Admin,
    period: PeriodQ = "all",
    domain: DomainQ = None,
    blend: bool = False,
    hit: HitQ = None,
):
    """Wave 확산 경로가 있는 상상 (깊은 순). hit = 그 태그가 붙은 상상만."""

    def run():
        f = _filter(db, period, domain, blend)
        only = set(explore.find_ids(f, hit)) if hit else None
        return explore.cascades(f, only=only)

    return _graph(run)


@router.get("/find", response_model=list[int])
def get_find(
    db: DB,
    _: Admin,
    hit: Annotated[str, Query(max_length=60)],
    period: PeriodQ = "all",
    domain: DomainQ = None,
    blend: bool = False,
):
    """시작점 찾기 결과(tech:이름 · desire:이름) → 기간 · 분야 안에서 그 태그가 붙은 상상 id (Thunder 많은 순)."""
    return _graph(lambda: explore.find_ids(_filter(db, period, domain, blend), hit))


@router.get("/cascade/{item_id}", response_model=CascadeOut)
def get_cascade(db: DB, _: Admin, item_id: int):
    """상상 하나의 Wave 확산 나무."""
    return _graph(lambda: explore.cascade(db, item_id))


# ---------------------------------------------------------------- 찾기 · 근거함


@router.get("/search", response_model=list[SearchHit])
def search(db: DB, _: Admin, q: Annotated[str, Query(max_length=200)]):
    """탐색 시작점 찾기 (기술 · 욕망 태그 · 상상). 검색 기록은 남기지 않는다."""
    return explore.search(db, q)


@router.get("/pins", response_model=list[PinOut])
def get_pins(db: DB, admin: Admin):
    """내 근거함 (최근 담은 순)."""
    return pins.list_pins(db, admin.id)


@router.post("/pins", response_model=PinOut, status_code=201)
def post_pin(db: DB, admin: Admin, body: PinIn):
    return pins.add_pin(db, admin.id, body)


@router.delete("/pins/{pin_id}", status_code=204)
def delete_pin(db: DB, admin: Admin, pin_id: int):
    pins.remove_pin(db, admin.id, pin_id)


@router.delete("/pins", status_code=204)
def clear_pins(db: DB, admin: Admin):
    pins.clear_pins(db, admin.id)
