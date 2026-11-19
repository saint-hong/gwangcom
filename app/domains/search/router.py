from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.domains.auth.deps import optional_user
from app.domains.search import service
from app.domains.search.schemas import SearchDreamersOut, SearchImaginationsOut, SearchTopicsOut
from app.domains.users.models import User
from app.infrastructure.core.database import get_db

router = APIRouter(prefix="/api/search", tags=["search"])

DB = Annotated[Session, Depends(get_db)]
MaybeMe = Annotated[User | None, Depends(optional_user)]
Q = Annotated[str, Query(description="검색어 (1~50자)", max_length=200)]
Cursor = Annotated[str | None, Query(description="이전 응답의 next_cursor")]


@router.get("/imaginations", response_model=SearchImaginationsOut)
def search_imaginations(db: DB, me: MaybeMe, q: Q, cursor: Cursor = None):
    """상상 검색 — 글자가 맞는 상상이 먼저, 그 뒤에 뜻이 비슷한 상상 (meaning_ids). 20개씩."""
    return service.imaginations(db, me, q, cursor)


@router.get("/topics", response_model=SearchTopicsOut)
def search_topics(db: DB, me: MaybeMe, q: Q):
    """주제(기술 태그) 검색 — 이름에 검색어가 들어 있는 주제, 상상 많은 순."""
    return service.topics(db, me, q)


@router.get("/dreamers", response_model=SearchDreamersOut)
def search_dreamers(db: DB, me: MaybeMe, q: Q, cursor: Cursor = None):
    """Dreamer 검색 — 닉네임 · 소개에 검색어가 들어 있는 사람."""
    return service.dreamers(db, me, q, cursor)
