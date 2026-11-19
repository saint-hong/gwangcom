from datetime import datetime
from typing import Literal

from pydantic import BaseModel

NodeKind = Literal["imagination", "dreamer", "tech", "desire"]
EdgeKind = Literal["wrote", "has_tag", "similar", "blended", "quotes", "with", "uses"]


class GNode(BaseModel):
    id: str  # "i:12" · "u:5" · "t:tech:드론" · "t:desire:…"
    kind: NodeKind
    label: str
    sub: str | None = None  # 작은 글씨 (상상 = 작성자 · 주제 = 상상 수 …)
    size: float = 1  # 점 크기 재료 (상상 = Thunder, 주제 = 상상 수)
    domain: str | None = None  # 상상의 분야 (색)
    blend: bool = False  # Shake it 혼합 글


class GEdge(BaseModel):
    source: str
    target: str
    kind: EdgeKind
    weight: float = 1  # 함께 쓰인 횟수 · 비슷한 정도
    reason: str | None = None  # 비슷한 상상: AI 가 붙인 이유


class ExpandOut(BaseModel):
    """한 점과 바로 이어진 점들 (파고들기)."""

    center: GNode
    nodes: list[GNode]
    edges: list[GEdge]
    more: dict[str, int] = {}  # 다 보여 주지 못한 수 {"imagination": 28}


class GroupMember(BaseModel):
    id: int
    title: str
    excerpt: str
    author: str
    author_id: int
    domain: str | None
    created_at: datetime
    thunders: int


class BundleTag(BaseModel):
    name: str
    label: str
    count: int  # 다발 안에서 이 태그(분야)가 붙은 상상 수


class Bundle(BaseModel):
    """경향 다발 — 서로 다른 Dreamer 가 쓴 비슷한 상상 묶음과 그 특징 (2026-11-19 사용자 결정)."""

    key: str  # A · B · C (화면 구분용, 이름 아님)
    name: str  # 핵심 주제 × 핵심 욕망 (계산으로 붙임)
    size: int
    dreamers: int  # 서로 다른 작성자 수
    first_at: datetime
    last_at: datetime
    recent: int  # 기간 뒤 절반에 올라온 상상 수
    earlier: int  # 기간 앞 절반
    share_growth: float | None  # 앞 → 뒤 절반 비중 증감 (앞이 0 이면 None)
    trend: float  # 쏠림 0~1 (0.5 = 그대로, 1 = 뒤 절반에만)
    signal: Literal["new", "rising", "steady", "cooling"]
    series: list[int]  # 칸(하루 · 주)마다 상상 수
    techs: list[BundleTag]
    desires: list[BundleTag]
    domains: list[BundleTag]
    reasons: list[str]  # AI 가 붙인 "왜 비슷한가" (점수 높은 순 3개)
    members: list[GroupMember]  # 대표 순 (다발 안에서 가장 많이 이어진 상상부터)


class BundlesOut(BaseModel):
    bundles: list[Bundle]
    linked: int  # 다발 기준(점수) 이상 연결이 하나라도 있는 상상 수
    buckets: list[str]  # 칸 시작 날짜
    unit: Literal["day", "week"]


class SearchHit(BaseModel):
    id: str
    kind: NodeKind
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
