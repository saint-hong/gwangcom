from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.domains.users.schemas import AuthorOut

Reason = Literal[
    "login_required", "own_post", "not_allowed", "shake_disabled", "daily_limit", "not_material"
]


class ActionState(BaseModel):
    """버튼 하나를 쓸 수 있는지 (기획안 v9 8장 응답 원칙). 프론트는 다시 계산하지 않는다."""

    allowed: bool
    reason: Reason | None = None
    remaining: int | None = None


class Actions(BaseModel):
    thunder: ActionState
    wave: ActionState
    quote: ActionState
    comment: ActionState
    shake: ActionState
    bookmark: ActionState
    delete: ActionState
    # 작성자 기술 태그 편집 (5-D). remaining = 더 붙일 수 있는 태그 수 (limit.tag_count − 지금 수)
    edit_tags: ActionState


class DomainRef(BaseModel):
    slug: str
    name: str


class TagOut(BaseModel):
    """화면에 보이는 기술 태그. name = 주소 · 비교용(/tags/:name), label = 화면 표기."""

    name: str
    label: str


class Counts(BaseModel):
    thunders: int
    waves: int
    comments: int
    quotes: int
    shakes: int  # 이 글을 재료로 태어난 혼합 글 수


Kind = Literal["original", "blend", "quote", "comment"]


class My(BaseModel):
    """내가 이미 눌렀는지 (v10 반영목록 2장). actions 와 같이 서버가 알려 주고 화면은 그대로 그린다."""

    thunder: bool = False
    wave: bool = False
    bookmark: bool = False


class QuotedOut(BaseModel):
    """인용 글 아래에 붙는 원본 요약 카드. 원본이 삭제·숨김되면 deleted=true 이고 나머지는 비운다."""

    id: int | None
    deleted: bool = False
    kind: Kind | None = None
    author: AuthorOut | None = None
    domain: DomainRef | None = None
    display_title: str | None = None
    body: str | None = None
    image_url: str | None = None
    created_at: datetime | None = None


class PromptRef(BaseModel):
    """이번 주 질문에 답한 상상이면 그 질문 (6-C)."""

    id: int
    title: str


class ImaginationOut(BaseModel):
    id: int
    kind: Kind
    author: AuthorOut
    domain: DomainRef
    secondary_domain: DomainRef | None
    title: str | None
    display_title: str
    body: str
    desire: str | None
    image_url: str | None
    ai_assisted: bool
    shake_allowed: bool
    counts: Counts
    created_at: datetime
    actions: Actions
    my: My
    # 기술 태그 (지우지 않은 것). 욕망 태그는 분석용이라 내보내지 않는다 (2026-11-12 사용자 결정)
    tags: list[TagOut] = []
    # 운영자가 숨긴 글 (작성자 본인 · 운영자에게만 상세가 열린다, v11 F19)
    hidden: bool = False
    quoted: QuotedOut | None = None
    # 혼합 글(kind=blend)일 때: 재료 글 2개 [상대 글, 섞은 사람의 글] (F8 · F9). 지워졌으면 deleted=true
    sources: list[QuotedOut] | None = None
    # 댓글(kind=comment)일 때: 바로 위 글 · 맨 위 상상 · 누구에게 단 댓글인지
    parent_id: int | None = None
    root_id: int | None = None
    reply_to: AuthorOut | None = None
    # 팔로잉 탭 · 프로필 Wave 탭: "○○님이 Wave함" (이 사람의 Wave 로 보게 됨 → Wave 하면 via 로 기록)
    waved_by: AuthorOut | None = None
    # 이번 주 질문에 답한 상상 (질문형 · 자유 상상 구분, F13)
    prompt: PromptRef | None = None


class FeedOut(BaseModel):
    items: list[ImaginationOut]
    next_cursor: str | None


class ReactionOut(BaseModel):
    """반응을 켜고 끈 뒤의 상태 — 화면이 이 값으로 맞춘다."""

    my: My
    counts: Counts


class TagsIn(BaseModel):
    tech: list[str] = Field(description="새 기술 태그 목록 전체 (최대 limit.tag_count, 기본 5)")


class QuoteIn(BaseModel):
    body: str = Field(description="인용하며 쓰는 내 글 (기본 300자, 이용 한도)")


class CommentIn(BaseModel):
    body: str = Field(description="댓글·답글 (기본 300자, 이용 한도)")


class CommentThreadOut(BaseModel):
    """맨 위 댓글 하나 + 답글들. 답글이 남아 있는 삭제된 댓글은 comment=null ("삭제된 댓글이에요")."""

    id: int
    comment: ImaginationOut | None
    replies: list[ImaginationOut]


class CommentsOut(BaseModel):
    items: list[CommentThreadOut]
    next_cursor: str | None
