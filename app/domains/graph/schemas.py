"""탐색기 API 모양 (Sprint 7-B 다시 짜기, 2026-11-20 사용자 결정 — v13 5장).

보기 네 개 + 근거함
  ① 융합과 충돌   /fusion          기술 × 욕망 묶음 연결 + 분야를 넘는 기술끼리의 충돌
  ② 집단 압력 지도 /map             뜻이 가까운 상상의 평면 지도 + 압력장(비슷한 상상 덩어리)
  ③ 변이와 진화   /lineage         Shake it 계보 숲 + 조합 시너지
  ④ 전파와 공명   /cascades · /cascade/{id}   Wave 확산 경로
  ⑤ 근거함        /pins            Observe Note 근거 모으기
숫자는 모두 계산 규칙이다 (원칙 4). 해석과 이름 짓기는 운영자가 한다.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Signal = Literal["new", "rising", "steady", "cooling"]


class TagCount(BaseModel):
    name: str
    label: str
    count: int


class ItemCard(BaseModel):
    """오른쪽 상세의 원문 상상 (PostgreSQL 에서 읽은 지금 값)."""

    id: int
    kind: str
    title: str
    excerpt: str
    desire: str | None  # 왜 원하나요 (작성자가 쓴 욕망 문장)
    author: str
    author_id: int
    domain: str | None
    domain2: str | None
    created_at: datetime
    thunders: int
    waves: int
    techs: list[str]


class Trend(BaseModel):
    """기간 앞 절반 → 뒤 절반의 비중 변화 (대시보드 기술 신호와 같은 기준)."""

    signal: Signal
    growth: float | None  # 비중 증감 (+0.5 = 1.5배). 앞 절반이 0 이면 None (새로 등장)
    recent: int
    earlier: int


# ---------------------------------------------------------------- ① 융합과 충돌


class FusionNode(BaseModel):
    id: str  # "t:<tech name>" · "d:<묶음 key>"
    kind: Literal["tech", "desire"]
    label: str
    domain: str | None  # 기술: 가장 많이 쓰인 분야
    count: int  # 상상 수
    thunder_avg: float
    trend: Trend
    members: list[TagCount] = []  # 욕망 묶음 안의 욕망 태그 (많이 쓰인 순)
    extra: bool = False  # 펼치기(2단계 이웃)로 더한 점


class FusionEdge(BaseModel):
    id: str
    source: str
    target: str
    kind: Literal[
        "desire", "collision", "combo"
    ]  # 기술-욕망 · 분야가 다른 기술 충돌 · 같은 분야 기술 조합
    weight: int  # 함께 쓰인 상상 수
    trend: Trend
    rank_pct: float  # 같은 종류 연결 중 위에서 몇 % (0.03 = 상위 3%)
    extra: bool = False


class FusionOut(BaseModel):
    nodes: list[FusionNode]
    edges: list[FusionEdge]
    total: int  # 거른 상상 수
    clustered: bool  # 욕망 태그 임베딩으로 묶었는가 (embed-tags 전이면 태그 하나가 한 묶음)


class Inspect(BaseModel):
    """점 · 선 하나의 상세 — 수치(신뢰 레이어) + 원문."""

    title: str
    kind: str
    count: int
    thunder_avg: float
    wave_avg: float
    dreamers: int
    domains: list[TagCount]
    trend: Trend
    rank_pct: float | None = None
    first_at: datetime | None
    last_at: datetime | None
    members: list[TagCount] = []
    items: list[ItemCard]


# ---------------------------------------------------------------- ② 집단 압력 지도


class MapPoint(BaseModel):
    id: int
    x: float
    y: float
    kind: str
    title: str
    author: str
    domain: str | None
    thunders: int
    recency: float  # 0 = 기간 처음 · 1 = 기간 끝
    tech: str | None  # 대표 주제 (가장 앞 태그)
    zone: str | None  # 압력장 key


class MapZone(BaseModel):
    key: str  # A · B · C
    name: str  # 핵심 주제 × 핵심 욕망 (계산)
    size: int
    dreamers: int
    cohesion: float  # 안쪽 비슷한 상상 연결 점수 평균
    diversity: float  # 주제 다양성 0~1 (1 − 1위 주제가 붙은 비율)
    unnamed: bool  # 주제는 제각각인데 뜻이 모임 = 아직 이름이 없는 경향
    trend: Trend
    techs: list[TagCount]
    desires: list[TagCount]
    domains: list[TagCount]
    item_ids: list[int]


class MapOut(BaseModel):
    method: Literal["tsne", "umap"]
    available: list[str]  # 좌표가 계산된 방법
    points: list[MapPoint]
    zones: list[MapZone]
    unplaced: int  # 기간 · 분야 안이지만 좌표가 없는 상상 (임베딩 없음 · 다시 만들기 전 새 글)


# ---------------------------------------------------------------- ③ 변이와 진화


class LineageNode(BaseModel):
    id: int
    kind: str
    title: str
    author: str
    domain: str | None
    domain2: str | None
    thunders: int
    synergy: float | None  # 혼합 글만
    depth: int  # 원본 0 · 혼합 1 · 혼합을 다시 섞음 2 …
    cross: bool  # 서로 다른 분야의 재료를 섞음
    tree: str
    created_at: datetime
    match: bool  # 기간 · 분야 · 거르기 조건에 맞는 혼합 글 (화면에서 강조)


class LineageTree(BaseModel):
    key: str
    size: int
    blends: int
    depth: int
    best_synergy: float | None
    cross_blends: int
    thunders: int


class LineageOut(BaseModel):
    nodes: list[LineageNode]
    edges: list[tuple[int, int]]  # (재료, 혼합 글)
    trees: list[LineageTree]
    blends_total: int  # 조건에 맞는 혼합 글 수 (보여 주지 못한 계보 포함)


# ---------------------------------------------------------------- ④ 전파와 공명


class CascadeSummary(BaseModel):
    id: int
    title: str
    author: str
    domain: str | None
    waves: int
    via_waves: int  # 다른 사람의 Wave 를 보고 한 Wave
    depth: int
    thunders: int
    created_at: datetime


class CascadeNode(BaseModel):
    id: str  # "u:5" (첫 노드 = 작성자)
    user_id: int
    nickname: str
    role: Literal["origin", "hub", "spreader", "leaf"]
    depth: int
    parent: str | None
    at: datetime | None
    downstream: int  # 이 사람을 거쳐 퍼진 Wave 수 (자기 아래)
    share: float  # downstream ÷ 전체 Wave
    reached_thunders: int  # 자기와 아래 사람들이 준 Thunder
    thundered: bool
    shaker: bool  # 이 상상을 재료로 Shake it 한 사람


class CascadeOut(BaseModel):
    item: ItemCard
    nodes: list[CascadeNode]
    total_waves: int
    via_waves: int
    depth: int
    hubs: int


# ---------------------------------------------------------------- ⑤ 근거함

PinKind = Literal["quote", "fusion", "collision", "desire", "tech", "zone", "lineage", "cascade"]


class PinIn(BaseModel):
    kind: PinKind
    title: str = Field(min_length=1, max_length=200)
    summary: str = Field(default="", max_length=4000)
    stat: str = Field(default="", max_length=300)
    ref: dict = {}


class PinOut(PinIn):
    id: int
    created_at: datetime


# ---------------------------------------------------------------- 시작점 · 상태


class SearchHit(BaseModel):
    id: str  # "t:<name>" 기술 · "i:12" 상상
    kind: Literal["tech", "desire", "imagination"]
    label: str
    sub: str | None = None


class LastBuild(BaseModel):
    at: datetime
    status: str
    nodes: int | None
    edges: int | None
    error: str | None


class GraphStatusOut(BaseModel):
    enabled: bool
    connected: bool
    nodes: int | None  # 지금 Memgraph 에 있는 수
    edges: int | None
    last_build: LastBuild | None
    last_error: LastBuild | None  # 마지막 반영 실패 (전체 · 글 하나)
    similar_rerank: int  # AI 가 비슷한 상상을 고른 상상 수
    similar_vector: int  # 벡터 순서로만 저장된 상상 수 (AI 실패 · 한도)
    similar_target: int  # 대상(임베딩이 있는 보이는 원본 · 인용) 수
    tag_embedded: int  # 이름 임베딩이 있는 욕망 태그 수 (embed-tags)
    desire_tags: int  # 쓰이고 있는 욕망 태그 수
