from datetime import datetime

from pydantic import BaseModel


class AuthorOut(BaseModel):
    """카드·상세에 붙는 작성자 정보 (공개)."""

    id: int
    nickname: str
    avatar_url: str | None
    is_operator: bool


class MeOut(BaseModel):
    id: int
    email: str
    nickname: str
    bio: str | None
    avatar_url: str | None
    cover_url: str | None
    role: str
    created_at: datetime


class ProfileCounts(BaseModel):
    posts: int  # 원본 · 인용 · 혼합 (댓글 제외)
    following: int
    followers: int


class ProfileOut(BaseModel):
    """프로필 머리 (X 구조, v10 반영목록 7장). 위치 · 가입일 · 인증 배지는 없다."""

    id: int
    nickname: str
    bio: str | None
    avatar_url: str | None
    cover_url: str | None
    is_operator: bool
    counts: ProfileCounts
    is_me: bool
    following: bool  # 내가 이 사람을 팔로우하는지


class DreamerOut(BaseModel):
    """추천 Dreamer · 이 상상의 Dreamer 블록."""

    author: AuthorOut
    bio: str | None
    following: bool


class FollowUserOut(BaseModel):
    """팔로워 · 팔로잉 목록 한 줄 (X 구조). 버튼은 보는 사람 기준."""

    author: AuthorOut
    bio: str | None
    following: bool  # 내가 이 사람을 팔로우하는지
    follows_me: bool  # 이 사람이 나를 팔로우하는지 → "나를 팔로우합니다" · [서로 팔로우하기]


class FollowListOut(BaseModel):
    items: list[FollowUserOut]
    next_cursor: str | None


class FollowOut(BaseModel):
    following: bool
    followers: int


class PasswordIn(BaseModel):
    current_password: str
    new_password: str


def author_out(user) -> AuthorOut:
    return AuthorOut(
        id=user.id, nickname=user.nickname, avatar_url=user.avatar_url, is_operator=user.is_admin
    )


def me_out(user) -> MeOut:
    return MeOut(
        id=user.id,
        email=user.email,
        nickname=user.nickname,
        bio=user.bio,
        avatar_url=user.avatar_url,
        cover_url=user.cover_url,
        role=user.role,
        created_at=user.created_at,
    )
