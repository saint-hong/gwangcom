from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

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


class AdminPromptOut(BaseModel):
    id: int
    title: str
    body: str | None
    starts_at: datetime
    ends_at: datetime | None
    is_active: bool
    status: PromptStatus  # open 진행 중 · scheduled 예정 · ended 끝 · off 꺼짐
    answer_count: int
    created_by: str | None
    created_at: datetime


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
