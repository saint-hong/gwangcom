from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy.orm import Session

from app.domains.auth.deps import current_user
from app.domains.imaginations import ai_jobs
from app.domains.imaginations.schemas import ImaginationOut
from app.domains.shake import service
from app.domains.shake.schemas import CandidatesOut, ShakeIn
from app.domains.users.models import User
from app.infrastructure.core.database import get_db

router = APIRouter(prefix="/api/shake", tags=["shake"])
DB = Annotated[Session, Depends(get_db)]


@router.get("/candidates", response_model=CandidatesOut)
def shake_candidates(
    db: DB,
    user: Annotated[User, Depends(current_user)],
    target_id: Annotated[int, Query()],
    cursor: Annotated[str | None, Query()] = None,
):
    """Shake it 선택 창 — 상대 글 · 내 상상 목록(원본 · 인용 · 혼합, 최신순) · 오늘 남은 횟수."""
    return service.candidates(db, user, target_id, cursor)


@router.post("", response_model=ImaginationOut, status_code=201)
def shake_it(
    payload: ShakeIn,
    db: DB,
    tasks: BackgroundTasks,
    user: Annotated[User, Depends(current_user)],
):
    """두 상상을 AI 로 섞어 바로 게시한다 (수 초). 실패하면 게시하지 않고 하루 횟수도 차감하지 않는다."""
    out = service.shake(db, user, payload)
    tasks.add_task(ai_jobs.after_post, out.id)  # 혼합 글도 태깅한다 (분석 때 원본과 나눠 봄)
    return out
