"""analytics 응답 — 대시보드 탭마다 하나 (개요 · 기술 흐름 · 교차 · 반응과 질문 · Shake it · AI 사용량)."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel


class PeriodOut(BaseModel):
    key: str
    start: date
    end: date
    unit: Literal["day", "week"]
    buckets: list[date]  # 시간 칸 (하루 또는 주 시작일)
    has_prev: bool


class Kpi(BaseModel):
    key: str
    label: str
    value: float
    prev: float | None  # 비교 기간 값 (all 이면 없음)
    unit: str = ""
    series: list[int]  # 시간 칸마다


class EventMark(BaseModel):
    """시계열 위에 표시할 사건 (질문 시작 등) — 변화가 왜 생겼는지 읽는 단서."""

    date: date
    label: str
    kind: Literal["prompt"]


class DomainRow(BaseModel):
    slug: str
    name: str
    count: int
    prev: int | None
    series: list[int]


class TechSignal(BaseModel):
    """기술 태그 하나의 흐름. signal 은 계산 규칙으로만 정한다 (AI 판단 아님, 원칙 4)."""

    tag_id: int
    label: str
    count: int  # 이번 기간 이 기술이 붙은 상상 수
    prev: int | None
    growth: float | None  # 비중 증감 (이번 비중 / 이전 비중 - 1), 이전에 없었으면 없음
    thunders: int  # 그 상상들이 받은 Thunder 합 (욕망의 표시)
    thunder_avg: float
    authors: int  # 서로 다른 Dreamer 수 (한 사람 쏠림 확인)
    first_seen: date
    signal: Literal["new", "rising", "steady", "cooling"]
    domain: str  # 가장 많이 함께 나온 분야 slug
    series: list[int]
    desires: list[str]  # 함께 나온 욕망 상위 3개


class OverviewOut(BaseModel):
    period: PeriodOut
    kpis: list[Kpi]
    domains: list[DomainRow]  # 분야 8개 고정 순서 (시계열 쌓은 면적)
    activity: dict[str, list[int]]  # posts · thunders · waves · comments · blends
    events: list[EventMark]
    signals: list[TechSignal]  # 떠오르는 기술 미리보기
    tagged_ratio: float  # 기술 태그가 붙은 상상 비율 (분석 가능한 데이터 비율)


class TechOut(BaseModel):
    period: PeriodOut
    techs: list[TechSignal]
    total_posts: int
    events: list[EventMark]


class SankeyNode(BaseModel):
    id: str
    label: str
    column: int  # 0 분야 · 1 기술 · 2 욕망
    value: int


class SankeyLink(BaseModel):
    source: str
    target: str
    value: int


class NetNode(BaseModel):
    id: str
    label: str
    type: Literal["tech", "desire"]
    count: int
    thunders: int


class NetEdge(BaseModel):
    source: str
    target: str
    weight: int


class MatrixCell(BaseModel):
    count: int
    thunders: int


class PairRow(BaseModel):
    a: str
    b: str
    count: int
    prev: int | None
    thunders: int


class DesireRow(BaseModel):
    label: str
    count: int
    prev: int | None
    thunders: int
    thunder_avg: float
    techs: list[str]


class CrossOut(BaseModel):
    period: PeriodOut
    sankey_nodes: list[SankeyNode]
    sankey_links: list[SankeyLink]
    net_nodes: list[NetNode]
    net_edges: list[NetEdge]
    matrix_rows: list[str]  # 욕망
    matrix_cols: list[str]  # 기술
    matrix: list[list[MatrixCell]]
    pairs: list[PairRow]
    desires: list[DesireRow]


class TopPost(BaseModel):
    id: int
    title: str
    author: str
    domain: str
    created_at: date
    thunders: int  # 이 기간에 받은 반응
    waves: int
    bookmarks: int
    quotes: int
    total: int
    prompt: bool


class PromptRow(BaseModel):
    id: int
    title: str
    starts_at: date
    ends_at: date | None
    answers: int
    answerers: int
    thunder_avg: float


class EngagementOut(BaseModel):
    period: PeriodOut
    top: list[TopPost]
    histogram: list[tuple[str, int]]  # Thunder 수 구간 → 상상 수
    punch_posts: list[list[int]]  # 요일(월=0) × 시(0~23), 한국 시간
    punch_reactions: list[list[int]]
    active_users: list[int]  # 칸마다 활동한 Dreamer 수
    prompt_series: list[int]  # 칸마다 질문에 답한 상상 수
    free_series: list[int]  # 칸마다 자유 상상 수
    prompts: list[PromptRow]
    free_thunder_avg: float
    events: list[EventMark]


class ShakeOut(BaseModel):
    period: PeriodOut
    attempts: dict[str, int]  # 상태별 시도 수
    series: list[int]  # 칸마다 혼합 글 수
    blends: int
    deleted: int
    blend_thunder_avg: float
    material_thunder_avg: float  # 재료 글 Thunder 평균 (조합 시너지 비교)
    domain_pairs: list[tuple[str, str, int]]
    materials: list[tuple[int, str, int]]  # (상상 id, 제목, 재료로 쓰인 수)
    depths: list[tuple[int, int]]  # (계보 깊이, 혼합 글 수)
    selection_ms_median: int | None


class AiFeatureRow(BaseModel):
    feature: str
    provider: str
    model: str
    calls: int
    failed: int
    input_tokens: int
    output_tokens: int
    cost_usd: float
    latency_ms_avg: int


class AiOut(BaseModel):
    period: PeriodOut
    features: list[AiFeatureRow]
    series: dict[str, list[int]]  # 기능별 칸마다 호출 수
    cost_series: list[float]
    today_calls: int
    daily_limit: int


# ---- 신규 Dreamer 활성화 (반응 · 질문 · 활동 탭, 2026-11-13)


class ActivationStep(BaseModel):
    key: str
    label: str
    users: int  # 해 본 사람 수
    base: int  # 분모 (계속 활동은 8일 이상 지난 사람만)


class ActivationCompare(BaseModel):
    key: str
    label: str  # 무엇을 비교하나
    yes_label: str
    no_label: str
    yes_n: int
    yes_kept: int
    no_n: int
    no_kept: int


class NewUserRow(BaseModel):
    id: int
    nickname: str
    joined_at: datetime
    steps: dict[str, bool]  # returned · reacted · posted · got_thunder · kept(판정 전이면 빠짐)
    posts: int  # 원본 · 인용
    reactions: int  # 남긴 Thunder · Wave · 북마크
    thunders_got: int
    last_active_at: datetime | None  # 접속 포함
    idle_days: int | None
    status: Literal["active", "idle", "not_started"]


class ActivationOut(BaseModel):
    period: PeriodOut
    window_days: int  # 첫 N일
    keep_from: int  # 계속 활동 판정 구간 (가입 후 N일째부터)
    keep_to: int
    new_users: int
    eligible: int  # 계속 활동을 판정할 수 있는 사람 (가입 후 keep_from 일 이상 지남)
    joined_series: list[int]  # 칸마다 가입한 Dreamer 수
    steps: list[ActivationStep]
    compare: list[ActivationCompare]
    first_post_hours_median: float | None  # 가입 → 첫 상상까지 (시간)
    visits_since: date | None  # 접속 기록이 쌓이기 시작한 날
    users: list[NewUserRow]


# ---- 전체 현황 (개요 맨 위, 기간 · 설정과 상관없이 처음부터 지금까지, 2026-11-13)


class SummaryOut(BaseModel):
    imaginations: int  # 원본 상상 (보이는 것)
    comments: int  # 댓글 · 답글 (보이는 것)
    quotes: int  # 인용 (보이는 것)
    hidden: int  # 숨김 · 삭제된 글 (위 셋에서 뺌)
    thunders: int  # 지금 켜져 있는 Thunder
    waves: int
    blends: int  # Shake it 혼합 글 (보이는 것)
    shake_attempts: int  # Shake it 시도 (실패 포함)
    users: int  # Dreamer (운영자 제외)
    admins: int
    withdrawn: int | None  # 탈퇴 기능이 아직 없어 None
    today: dict[
        str, int
    ]  # 오늘(한국 날짜) 늘어난 수: imaginations · comments · quotes · thunders · waves · blends · users
