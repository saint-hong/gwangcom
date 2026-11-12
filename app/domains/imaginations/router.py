from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Query, UploadFile
from sqlalchemy.orm import Session

from app.domains.auth.deps import current_user, optional_user
from app.domains.imaginations import ai_jobs, service
from app.domains.imaginations.schemas import FeedOut, ImaginationOut, QuoteIn
from app.domains.shake.lineage import LineageOut, lineage
from app.domains.similar.rerank import similar_for
from app.domains.similar.schemas import SimilarOut
from app.domains.users.models import User
from app.infrastructure.core.database import get_db

router = APIRouter(prefix="/api", tags=["imaginations"])

DB = Annotated[Session, Depends(get_db)]


@router.get("/feed", response_model=FeedOut)
def feed(
    db: DB,
    user: Annotated[User | None, Depends(optional_user)],
    tab: Annotated[service.FeedTab, Query()] = "recommended",
    domain: Annotated[str | None, Query(description="분야 slug (ai, space …)")] = None,
    cursor: Annotated[str | None, Query(description="이전 응답의 next_cursor")] = None,
):
    """홈 피드. 20개씩, 다음 페이지는 next_cursor. 상상마다 actions 가 붙는다."""
    return service.feed(db, user, tab=tab, domain=domain, cursor=cursor)


@router.get("/trending", response_model=FeedOut)
def trending(
    db: DB,
    user: Annotated[User | None, Depends(optional_user)],
    limit: Annotated[int, Query(ge=1, le=20)] = 20,
):
    """인기 상상: 최근 7일 원본·인용을 점수(Thunder + Wave×2 + 인용×3 + 댓글) 순으로 1~20위."""
    return service.trending(db, user, limit)


@router.post("/imaginations", response_model=ImaginationOut, status_code=201)
async def create_imagination(
    db: DB,
    tasks: BackgroundTasks,
    user: Annotated[User, Depends(current_user)],
    body: Annotated[str, Form()],
    domain: Annotated[str, Form(description="분야 slug")],
    title: Annotated[str | None, Form()] = None,
    desire: Annotated[str | None, Form()] = None,
    ai_assisted: Annotated[bool, Form()] = False,
    shake_allowed: Annotated[bool, Form()] = True,
    prompt_id: Annotated[int | None, Form(description="이번 주 질문에서 들어왔을 때")] = None,
    image: Annotated[UploadFile | None, File()] = None,
):
    """상상 쓰기 (multipart). 글자 수·하루 횟수는 내 이용 한도(/api/me/limits)로 검사한다."""
    data = await image.read() if image is not None and image.filename else None
    out = service.create(
        db,
        user,
        service.NewImagination(
            body=body,
            domain=domain,
            title=title,
            desire=desire,
            ai_assisted=ai_assisted,
            shake_allowed=shake_allowed,
            image=data or None,
            prompt_id=prompt_id,
        ),
    )
    tasks.add_task(ai_jobs.after_post, out.id)  # 응답 뒤 태깅 · 임베딩 (F10 · F23)
    return out


@router.post("/imaginations/{imagination_id}/quote", response_model=ImaginationOut, status_code=201)
def quote_imagination(
    imagination_id: int,
    payload: QuoteIn,
    db: DB,
    tasks: BackgroundTasks,
    user: Annotated[User, Depends(current_user)],
):
    """인용하기 — 내 글(기본 300자)을 쓰고 원본을 아래에 붙여 새 글로 올린다. 하루 상상 쓰기 한도에 포함."""
    out = service.quote(db, user, imagination_id, payload.body)
    tasks.add_task(ai_jobs.after_post, out.id)
    return out


@router.get("/imaginations/{imagination_id}", response_model=ImaginationOut)
def get_imagination(
    imagination_id: int, db: DB, user: Annotated[User | None, Depends(optional_user)]
):
    """상상 상세. 로그인 상태면 조회 기록(최근 본 상상)을 남긴다."""
    return service.detail(db, user, imagination_id)


@router.delete("/imaginations/{imagination_id}", status_code=204)
def delete_imagination(imagination_id: int, db: DB, user: Annotated[User, Depends(current_user)]):
    """내 상상 삭제 (수정은 할 수 없고 삭제만 가능 — 기획안 F2)."""
    service.delete(db, user, imagination_id)


@router.get("/imaginations/{imagination_id}/similar", response_model=SimilarOut)
def similar_imaginations(
    imagination_id: int, db: DB, user: Annotated[User | None, Depends(optional_user)]
):
    """비슷한 상상 (F23) — 미리 계산해 둔 리랭킹 결과 (벡터 후보 → LLM 이 고름 + 이유)."""
    return similar_for(db, imagination_id, user)


@router.get("/imaginations/{imagination_id}/lineage", response_model=LineageOut)
def imagination_lineage(
    imagination_id: int,
    db: DB,
    up: Annotated[int, Query(ge=0, le=5)] = 3,
    down: Annotated[int, Query(ge=0, le=5)] = 3,
):
    """계보 그래프 (F9 · S15) — 조상(재료) up 단계 · 자손(혼합 글) down 단계, 노드 최대 100개."""
    return lineage(db, imagination_id, up, down)
