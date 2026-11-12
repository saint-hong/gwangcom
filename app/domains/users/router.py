from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from sqlalchemy.orm import Session

from app.domains.auth.deps import current_user, optional_user
from app.domains.imaginations.schemas import FeedOut
from app.domains.users import service
from app.domains.users.models import User
from app.domains.users.schemas import (
    DreamerOut,
    FollowListOut,
    FollowOut,
    MeOut,
    PasswordIn,
    ProfileOut,
)
from app.infrastructure.core.database import get_db

router = APIRouter(prefix="/api/users", tags=["users"])

DB = Annotated[Session, Depends(get_db)]
Me = Annotated[User, Depends(current_user)]
MaybeMe = Annotated[User | None, Depends(optional_user)]


async def _read(file: UploadFile | None) -> bytes | None:
    return (await file.read()) or None if file is not None and file.filename else None


@router.patch("/me", response_model=MeOut)
async def update_me(
    db: DB,
    me: Me,
    nickname: Annotated[str | None, Form()] = None,
    bio: Annotated[str | None, Form()] = None,
    avatar: Annotated[UploadFile | None, File()] = None,
    cover: Annotated[UploadFile | None, File()] = None,
    remove_avatar: Annotated[bool, Form()] = False,
    remove_cover: Annotated[bool, Form()] = False,
):
    """프로필 수정 (multipart): 커버 · 프로필 이미지 · 이름(닉네임) · 자기소개. 닉네임을 바꾸면 프로필 주소도 바뀐다."""
    return service.update_me(
        db,
        me,
        nickname=nickname,
        bio=bio,
        avatar=await _read(avatar),
        cover=await _read(cover),
        remove_avatar=remove_avatar,
        remove_cover=remove_cover,
    )


@router.post("/me/password", status_code=204)
def change_password(payload: PasswordIn, db: DB, me: Me):
    """비밀번호 변경 (설정 S14)."""
    service.change_password(db, me, payload.current_password, payload.new_password)


@router.get("/recommended", response_model=list[DreamerOut])
def recommended(db: DB, me: MaybeMe, limit: Annotated[int, Query(ge=1, le=10)] = 3):
    """추천 Dreamer — 아직 팔로우하지 않은 사람 중 받은 Thunder 가 많은 순."""
    return service.recommended(db, me, limit)


@router.get("/{nickname}", response_model=ProfileOut)
def profile(nickname: str, db: DB, me: MaybeMe):
    """프로필 머리: 닉네임 · 소개 · 커버 · 팔로잉/팔로워 수 · 내가 팔로우하는지."""
    return service.profile(db, me, nickname)


@router.get("/{nickname}/card", response_model=DreamerOut)
def dreamer_card(nickname: str, db: DB, me: MaybeMe):
    """상세 화면 오른쪽 "이 상상의 Dreamer" 블록."""
    return service.dreamer(db, me, nickname)


@router.get("/{nickname}/imaginations", response_model=FeedOut)
def profile_items(
    nickname: str,
    db: DB,
    me: MaybeMe,
    tab: Annotated[service.ProfileTab, Query()] = "posts",
    cursor: Annotated[str | None, Query(description="이전 응답의 next_cursor")] = None,
):
    """프로필 탭 [상상 | 댓글 | 인용], 최신순 20개씩."""
    return service.profile_items(db, me, nickname, tab, cursor)


@router.get("/{nickname}/followers", response_model=FollowListOut)
def followers(
    nickname: str,
    db: DB,
    me: MaybeMe,
    cursor: Annotated[str | None, Query(description="이전 응답의 next_cursor")] = None,
):
    """팔로워: 이 사람을 팔로우하는 계정 (follows_me = 나를 팔로우하는지)."""
    return service.follow_list(db, me, nickname, "followers", cursor)


@router.get("/{nickname}/following", response_model=FollowListOut)
def following(
    nickname: str,
    db: DB,
    me: MaybeMe,
    cursor: Annotated[str | None, Query(description="이전 응답의 next_cursor")] = None,
):
    """팔로잉: 이 사람이 팔로우하는 계정."""
    return service.follow_list(db, me, nickname, "following", cursor)


@router.post("/{nickname}/follow", response_model=FollowOut)
def follow(nickname: str, db: DB, me: Me):
    return service.follow(db, me, nickname, True)


@router.delete("/{nickname}/follow", response_model=FollowOut)
def unfollow(nickname: str, db: DB, me: Me):
    return service.follow(db, me, nickname, False)
