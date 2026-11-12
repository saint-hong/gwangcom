from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.domains.imaginations.schemas import Counts, DomainRef, Kind
from app.domains.users.schemas import AuthorOut

ModerationStatus = Literal["visible", "hidden"]


class ModerationOut(BaseModel):
    """마지막 숨김 · 다시 보이기 기록 (운영자 화면에만)."""

    action: Literal["hide", "unhide"]
    admin: str | None  # 운영자 닉네임 (계정이 지워졌으면 None)
    reason: str | None
    at: datetime


class AdminItemOut(BaseModel):
    """A4 게시물 관리 한 줄. 상상 · 인용 · Shake it · 댓글 모두."""

    id: int
    kind: Kind
    status: ModerationStatus
    author: AuthorOut
    domain: DomainRef
    display_title: str
    body: str
    root_id: int | None  # 댓글이면 맨 위 상상 (화면에서 원글로 가는 링크)
    counts: Counts
    created_at: datetime
    last_moderation: ModerationOut | None = None


class AdminItemsOut(BaseModel):
    """페이지 번호 목록 (운영자 표는 커서 대신 번호로 옮겨 다닌다, 2026-11-12 사용자 요청)."""

    items: list[AdminItemOut]
    total: int
    page: int
    size: int


class ModerateIn(BaseModel):
    status: ModerationStatus = Field(description="hidden = 숨기기, visible = 다시 보이기")
    reason: str | None = Field(
        default=None, max_length=200, description="운영자 메모 (작성자에게 안 보임)"
    )


# ---------------------------------------------------------------- 6-B 정책 · 사용자 관리 (F20, A5 · A6)


class PolicyKeyOut(BaseModel):
    key: str
    label: str
    group: str
    kind: Literal["int", "bool"]
    unit: str
    min: int
    max: int


class TierOut(BaseModel):
    id: int
    name: str
    description: str | None
    is_default: bool
    user_count: int


class ChangeLogOut(BaseModel):
    id: int
    admin: str | None
    target_scope: Literal["global", "tier", "user"]
    tier: str | None
    user: str | None
    key: str
    label: str  # 화면에 보일 이름 (항목 이름 · "등급" · "역할")
    old_value: int | bool | str | None
    new_value: int | bool | str | None
    expires_at: datetime | None
    at: datetime


class PolicyOut(BaseModel):
    """A6 기본 정책: 항목 · 전체 기본값 · 등급별 값(없으면 전체 기본값을 따름) · 등급 · 최근 변경."""

    keys: list[PolicyKeyOut]
    global_values: dict[str, int | bool]
    tier_values: dict[int, dict[str, int | bool]]
    tiers: list[TierOut]
    logs: list[ChangeLogOut]


class PolicyIn(BaseModel):
    scope: Literal["global", "tier"]
    tier_id: int | None = None
    key: str
    value: int | bool | None = Field(description="null = 등급 값 지우기(전체 기본값 따르기)")


class TierIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    description: str | None = Field(default=None, max_length=200)


class TierPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=40)
    description: str | None = Field(default=None, max_length=200)
    is_default: bool | None = Field(
        default=None, description="true 로만 바꿀 수 있다 (다른 등급의 기본은 꺼짐)"
    )


class AdminUserRow(BaseModel):
    id: int
    nickname: str
    email: str
    avatar_url: str | None
    role: Literal["user", "admin"]
    tier: str | None  # 등급이 비었으면 기본 등급 이름
    posts: int  # 원본 · 인용 (보이는 것)
    exceptions: int  # 만료되지 않은 개인 예외 수
    created_at: datetime


class AdminUsersOut(BaseModel):
    items: list[AdminUserRow]
    total: int
    page: int
    size: int


class LimitRow(BaseModel):
    """사용자에게 지금 적용되는 값 하나 + 어디서 왔는지 + 개인 예외."""

    key: str
    value: int | bool
    source: Literal["user", "tier", "global", "default"]
    exception: int | bool | None = None  # 개인 예외 값 (만료된 것 포함)
    exception_expires_at: datetime | None = None
    exception_expired: bool = False


class ActivityOut(BaseModel):
    posts: int  # 원본 · 인용
    blends: int  # Shake it 으로 만든 글
    comments: int
    thunders_received: int  # 내 원본 · 인용 · 혼합이 받은 Thunder
    posts_today: int
    shakes_today: int


class AdminUserDetail(BaseModel):
    user: AdminUserRow
    tier_id: int | None  # 실제로 적용되는 등급 (비었으면 기본 등급)
    activity: ActivityOut
    keys: list[PolicyKeyOut]
    limits: list[LimitRow]
    tiers: list[TierOut]
    logs: list[ChangeLogOut]


class UserPatch(BaseModel):
    role: Literal["user", "admin"] | None = None
    tier_id: int | None = None


class UserPolicyIn(BaseModel):
    key: str
    value: int | bool
    expires_at: datetime | None = Field(default=None, description="비우면 만료 없음")
