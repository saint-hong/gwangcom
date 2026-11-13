from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.domains.auth.deps import admin_user, optional_user
from app.domains.prompts import feed, service
from app.domains.prompts.schemas import (
    AdminPromptOut,
    AdminPromptsOut,
    AnswererOut,
    PromptFeedOut,
    PromptIn,
    PromptInsightOut,
    PromptListOut,
    PromptOut,
    PromptPatch,
)
from app.domains.users.models import User
from app.infrastructure.core.database import get_db

router = APIRouter(tags=["prompts"])
DB = Annotated[Session, Depends(get_db)]
Admin = Annotated[User, Depends(admin_user)]


@router.get("/api/prompts", response_model=PromptListOut)
def prompt_list(db: DB):
    """질문 목록: 진행 중(여러 개) · 끝난 질문 최근 20개. 홈 블록 제목 → /prompts."""
    return service.public_list(db)


@router.get("/api/prompts/current", response_model=PromptOut | None)
def current_prompt(db: DB):
    """지금 이번 주 질문 (없으면 null). 오른쪽 컬럼 블록 · 홈 배너에 쓴다."""
    return service.current(db)


@router.get("/api/prompts/{prompt_id}", response_model=PromptOut)
def prompt_detail(prompt_id: int, db: DB):
    """글쓰기 화면 ?prompt= 질문 카드 (끝난 질문은 open=false)."""
    return service.get_public(db, prompt_id)


@router.get("/api/prompts/{prompt_id}/insight", response_model=PromptInsightOut)
def prompt_insight(prompt_id: int, db: DB):
    """질문 상세 위쪽: 질문 + 답한 사용자별 반응 (그래프용, 반응 많은 순)."""
    return service.insight(db, prompt_id)


@router.get("/api/prompts/{prompt_id}/imaginations", response_model=PromptFeedOut)
def prompt_answers(
    prompt_id: int,
    db: DB,
    user: Annotated[User | None, Depends(optional_user)],
    cursor: Annotated[str | None, Query()] = None,
):
    """질문 상세 아래쪽: 이 질문에 답한 상상 (최신순, 커서)."""
    return feed.answer_feed(db, user, prompt_id, cursor)


@router.get("/api/admin/prompts/{prompt_id}/answerers", response_model=list[AnswererOut])
def admin_prompt_answerers(prompt_id: int, db: DB, _: Admin):
    """A3 펼친 줄: 답한 사용자 (꺼진 질문도)."""
    return service.admin_answerers(db, prompt_id)


@router.get("/api/admin/prompts", response_model=AdminPromptsOut)
def admin_prompts(
    db: DB,
    _: Admin,
    status: Annotated[Literal["all", "open", "scheduled", "ended", "off"], Query()] = "all",
    q: Annotated[str | None, Query(max_length=100)] = None,
    sort: Annotated[
        Literal[
            "id", "title", "starts", "ends", "status", "answers", "answerers", "created", "active"
        ],
        Query(),
    ] = "starts",
    order: Annotated[Literal["asc", "desc"], Query()] = "desc",
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query()] = 20,
):
    """A3 질문 목록 (상태 · 찾기 · 정렬 · 페이지 번호)."""
    return service.admin_list(db, status=status, q=q, sort=sort, order=order, page=page, size=size)


@router.post("/api/admin/prompts", response_model=AdminPromptOut, status_code=201)
def create_prompt(data: PromptIn, db: DB, admin: Admin):
    return service.create(db, admin, data)


@router.patch("/api/admin/prompts/{prompt_id}", response_model=AdminPromptOut)
def update_prompt(prompt_id: int, data: PromptPatch, db: DB, _: Admin):
    """고치기 · 켜기/끄기 (보낸 칸만 바꾼다, ends_at=null = 끝나는 때 없음)."""
    return service.update(db, prompt_id, data, data.model_fields_set)


@router.delete("/api/admin/prompts/{prompt_id}", status_code=204)
def delete_prompt(prompt_id: int, db: DB, _: Admin):
    """답한 상상이 없을 때만 지운다."""
    service.delete(db, prompt_id)
    return Response(status_code=204)
