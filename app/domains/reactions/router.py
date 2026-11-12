from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query
from sqlalchemy.orm import Session

from app.domains.auth.deps import current_user
from app.domains.imaginations.schemas import FeedOut, ReactionOut
from app.domains.reactions import service
from app.domains.users.models import User
from app.infrastructure.core.database import get_db

router = APIRouter(prefix="/api", tags=["reactions"])

DB = Annotated[Session, Depends(get_db)]
Me = Annotated[User, Depends(current_user)]


@router.post("/imaginations/{item_id}/thunder", response_model=ReactionOut)
def thunder_on(item_id: int, db: DB, user: Me):
    """Thunder 켜기 (상상·댓글). 내 글에는 누를 수 없다."""
    return service.toggle(db, user, item_id, "thunder", True)


@router.delete("/imaginations/{item_id}/thunder", response_model=ReactionOut)
def thunder_off(item_id: int, db: DB, user: Me):
    return service.toggle(db, user, item_id, "thunder", False)


@router.post("/imaginations/{item_id}/wave", response_model=ReactionOut)
def wave_on(
    item_id: int,
    db: DB,
    user: Me,
    via_user_id: Annotated[int | None, Body(embed=True)] = None,
):
    """Wave 켜기. via_user_id = 이 사람의 Wave 를 보고 Wave 함 (확산 경로, Sprint 3 부터 화면이 보냄)."""
    return service.toggle(db, user, item_id, "wave", True, via_user_id)


@router.delete("/imaginations/{item_id}/wave", response_model=ReactionOut)
def wave_off(item_id: int, db: DB, user: Me):
    return service.toggle(db, user, item_id, "wave", False)


@router.post("/imaginations/{item_id}/bookmark", response_model=ReactionOut)
def bookmark_on(item_id: int, db: DB, user: Me):
    """북마크 켜기 (내 글도 가능). 서재 [북마크] 탭에 모인다."""
    return service.toggle(db, user, item_id, "bookmark", True)


@router.delete("/imaginations/{item_id}/bookmark", response_model=ReactionOut)
def bookmark_off(item_id: int, db: DB, user: Me):
    return service.toggle(db, user, item_id, "bookmark", False)


@router.get("/me/library", response_model=FeedOut)
def library(
    db: DB,
    user: Me,
    tab: Annotated[service.LibraryTab, Query()] = "thunders",
    cursor: Annotated[str | None, Query(description="이전 응답의 next_cursor")] = None,
):
    """내 서재 [Thunder | Wave | Shake it | 북마크 | 최근 본 상상]. 20개씩. Shake it = 내가 섞어 만든 혼합 글."""
    return service.library(db, user, tab, cursor)
