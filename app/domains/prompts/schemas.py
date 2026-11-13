from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.domains.imaginations.schemas import ImaginationOut
from app.domains.users.schemas import AuthorOut

PromptStatus = Literal["open", "scheduled", "ended", "off"]


class PromptOut(BaseModel):
    """사용자 화면용 질문 (오른쪽 컬럼 · 글쓰기 위 질문 카드)."""

    id: int
    title: str
    body: str | None
    starts_at: datetime
    ends_at: datetime | None
    open: bool  # 지금 답할 수 있는지
    answer_count: int  # 이 질문에 답한 상상 수 (보이는 원본)
    answerer_count: int = 0  # 답한 사용자 수 (같은 사람이 여럿 써도 한 명)


class AdminPromptOut(BaseModel):
    id: int
    title: str
    body: str | None
    starts_at: datetime
    ends_at: datetime | None
    is_active: bool
    status: PromptStatus  # open 진행 중 · scheduled 예정 · ended 끝 · off 꺼짐
    # 기간만 본 상태 (켜짐 · 꺼짐과 따로): A3 상태 칸 뱃지 진행 · 종료 (· 예정)
    phase: Literal["scheduled", "open", "ended"]
    answer_count: int
    answerer_count: int  # 답한 사용자 수
    created_by: str | None
    created_at: datetime


class AnswererOut(BaseModel):
    """질문에 답한 사용자 한 명 — 그 사람이 답한 상상들의 반응 합계 (질문 상세 그래프 · A3 펼친 줄)."""

    author: AuthorOut
    answers: int  # 답한 상상 수
    thunders: int
    waves: int
    comments: int
    total: int  # Thunder + Wave + 댓글
    best_id: int  # 그 사람의 답 중 반응이 가장 많은 상상


class PromptListOut(BaseModel):
    """질문 목록 (/prompts, 2026-11-13): 진행 중(늦게 시작한 순) · 끝난 질문(최근 끝난 순, 최근 20개)."""

    open: list[PromptOut]
    ended: list[PromptOut]
    ended_total: int = (
        0  # 끝난 질문 전체 수 (ended 는 최근 20개만, 2026-11-13 목록 머리 "종료됨 N개")
    )


class PromptInsightOut(BaseModel):
    """질문 상세 (S 이번 주 질문 상세): 질문 + 답한 사용자별 반응 (반응 많은 순)."""

    prompt: PromptOut
    answerers: list[AnswererOut]


class PromptFeedOut(BaseModel):
    items: list[ImaginationOut]
    next_cursor: str | None


class AdminPromptsOut(BaseModel):
    items: list[AdminPromptOut]
    total: int
    page: int
    size: int


class PromptIn(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    body: str | None = Field(default=None, max_length=300)
    starts_at: datetime
    ends_at: datetime | None = None
    is_active: bool = True


class PromptPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=80)
    body: str | None = Field(default=None, max_length=300)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    is_active: bool | None = None
