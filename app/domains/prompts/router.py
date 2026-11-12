from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.domains.auth.deps import admin_user
from app.domains.prompts import service
from app.domains.prompts.schemas import (
    AdminPromptOut,
    AdminPromptsOut,
    PromptIn,
    PromptOut,
    PromptPatch,
)
from app.domains.users.models import User
from app.infrastructure.core.database import get_db

router = APIRouter(tags=["prompts"])
DB = Annotated[Session, Depends(get_db)]
Admin = Annotated[User, Depends(admin_user)]


@router.get("/api/prompts/current", response_model=PromptOut | None)
def current_prompt(db: DB):
    """지금 이번 주 질문 (없으면 null). 오른쪽 컬럼 블록 · 홈 배너에 쓴다."""
    return service.current(db)


@router.get("/api/prompts/{prompt_id}", response_model=PromptOut)
def prompt_detail(prompt_id: int, db: DB):
    """글쓰기 화면 ?prompt= 질문 카드 (끝난 질문은 open=false)."""
    return service.get_public(db, prompt_id)


@router.get("/api/admin/prompts", response_model=AdminPromptsOut)
def admin_prompts(
    db: DB,
    _: Admin,
    status: Annotated[Literal["all", "open", "scheduled", "ended", "off"], Query()] = "all",
    q: Annotated[str | None, Query(max_length=100)] = None,
    sort: Annotated[
        Literal["id", "title", "starts", "ends", "status", "answers", "created"], Query()
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
