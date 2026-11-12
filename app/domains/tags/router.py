from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domains.auth.deps import current_user, optional_user
from app.domains.imaginations.schemas import ImaginationOut, TagsIn
from app.domains.tags import browse
from app.domains.tags.models import Domain
from app.domains.users.models import User
from app.infrastructure.core.database import get_db

router = APIRouter(prefix="/api", tags=["domains"])


class DomainOut(BaseModel):
    slug: str
    name: str


@router.get("/domains", response_model=list[DomainOut])
def list_domains(db: Annotated[Session, Depends(get_db)]):
    """분야 8개 (고정 목록, 시드)."""
    return [
        DomainOut(slug=d.slug, name=d.name)
        for d in db.scalars(select(Domain).order_by(Domain.sort_order))
    ]


DB = Annotated[Session, Depends(get_db)]


@router.put("/imaginations/{imagination_id}/tags", response_model=ImaginationOut)
def put_tags(
    imagination_id: int, data: TagsIn, db: DB, user: Annotated[User, Depends(current_user)]
):
    """작성자 기술 태그 편집 (목록 전체를 보낸다). 지운 태그는 기록으로 남는다 (5-D)."""
    return browse.set_tech_tags(db, user, imagination_id, data.tech)


@router.get("/topics", response_model=browse.TopicsOut)
def get_topics(db: DB):
    """S8 주제 둘러보기: 분야마다 많이 등장한 기술 태그 (원본 · 인용 기준)."""
    return browse.topics(db)


# 태그 이름에 "/" 가 들어갈 수 있어(AR/VR) path 로 받는다
@router.get("/tags/{name:path}/imaginations", response_model=browse.TagFeedOut)
def get_tag_feed(
    name: str,
    db: DB,
    user: Annotated[User | None, Depends(optional_user)],
    cursor: Annotated[str | None, Query()] = None,
):
    """S9 태그별 상상: 그 기술 태그가 붙은 상상 최신순 (혼합 포함)."""
    return browse.tag_feed(db, user, name, cursor)
