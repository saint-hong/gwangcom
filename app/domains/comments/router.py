from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.domains.auth.deps import current_user, optional_user
from app.domains.comments import service
from app.domains.imaginations.schemas import CommentIn, CommentsOut, ImaginationOut
from app.domains.users.models import User
from app.infrastructure.core.database import get_db

router = APIRouter(prefix="/api", tags=["comments"])

DB = Annotated[Session, Depends(get_db)]


@router.get("/imaginations/{imagination_id}/comments", response_model=CommentsOut)
def list_comments(
    imagination_id: int,
    db: DB,
    user: Annotated[User | None, Depends(optional_user)],
    cursor: Annotated[str | None, Query(description="이전 응답의 next_cursor")] = None,
):
    """상상의 댓글 (최신순) + 댓글마다 답글 (오래된 순). 20개씩. 비로그인도 읽을 수 있다."""
    return service.list_threads(db, user, imagination_id, cursor)


@router.post("/imaginations/{item_id}/comments", response_model=ImaginationOut, status_code=201)
def create_comment(
    item_id: int, payload: CommentIn, db: DB, user: Annotated[User, Depends(current_user)]
):
    """댓글 쓰기. item_id 가 상상이면 댓글, 댓글이면 답글. 삭제는 DELETE /api/imaginations/{id}."""
    return service.create(db, user, item_id, payload.body)
