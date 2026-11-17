from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

NoteStatus = Literal["draft", "published"]


class NoteIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    lead: str | None = Field(default=None, max_length=300)
    body_md: str = Field(default="", max_length=50_000)
    cover_url: str | None = Field(default=None, max_length=300)
    summary: str | None = Field(default=None, max_length=2000)
    sources: str | None = Field(default=None, max_length=10_000)
    status: NoteStatus = "draft"


class NotePatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    lead: str | None = Field(default=None, max_length=300)
    body_md: str | None = Field(default=None, max_length=50_000)
    cover_url: str | None = Field(default=None, max_length=300)
    summary: str | None = Field(default=None, max_length=2000)
    sources: str | None = Field(default=None, max_length=10_000)
    status: NoteStatus | None = None


class NoteSummaryIn(BaseModel):
    """AI 요약 초안을 만들 재료 — 저장 전 글로도 만들 수 있게 화면의 지금 내용을 받는다."""

    title: str = Field(min_length=1, max_length=120)
    lead: str | None = Field(default=None, max_length=300)
    body_md: str = Field(min_length=1, max_length=50_000)


class NoteSummaryOut(BaseModel):
    summary: str | None  # 줄마다 한 항목
    error: str | None = None


class NoteAuthor(BaseModel):
    id: int
    nickname: str
    avatar_url: str | None = None


class NoteCounts(BaseModel):
    thunders: int = 0
    waves: int = 0
    bookmarks: int = 0


class NoteMy(BaseModel):
    thunder: bool = False
    wave: bool = False
    bookmark: bool = False


class NoteActionState(BaseModel):
    """버튼을 쓸 수 있는지 — 서버가 정하고 화면은 그대로 그린다 (CLAUDE.md actions 규칙)."""

    allowed: bool
    reason: Literal["login_required"] | None = None
    remaining: int | None = None


class NoteActions(BaseModel):
    thunder: NoteActionState
    wave: NoteActionState
    bookmark: NoteActionState


class NoteReactionOut(BaseModel):
    my: NoteMy
    counts: NoteCounts


class NoteCard(BaseModel):
    """목록 카드 (공개 · 운영자)."""

    id: int
    number: int | None
    title: str
    lead: str | None
    status: NoteStatus
    published_at: datetime | None
    created_at: datetime
    updated_at: datetime
    edited: bool  # 발행 뒤 고쳤나 ("수정됨")
    cover_url: str | None = None
    view_count: int = 0
    # 반응 (2026-11-17): 수 · 내가 눌렀는지 · 버튼을 쓸 수 있는지
    counts: NoteCounts = NoteCounts()
    my: NoteMy = NoteMy()
    actions: NoteActions | None = None


class NoteOut(NoteCard):
    body_md: str
    summary: str | None
    sources: str | None
    author: NoteAuthor | None


class NoteListOut(BaseModel):
    items: list[NoteCard]
    next_cursor: str | None = None


class AdminNotesOut(BaseModel):
    items: list[NoteCard]
    total: int
    page: int
    size: int


class NoteImageOut(BaseModel):
    url: str
