from pydantic import BaseModel, Field

from app.domains.imaginations.schemas import ImaginationOut


class ShakeIn(BaseModel):
    target_id: int
    mine_id: int
    # 선택 창이 열린 뒤 [완료]까지 걸린 시간 (분석용, F8). 화면이 재서 보낸다
    selection_ms: int | None = Field(default=None, ge=0, le=3_600_000)


class CandidatesOut(BaseModel):
    """Shake it 선택 창 — 상대 글 + 내 상상 목록(최신순) + 오늘 남은 횟수."""

    target: ImaginationOut
    items: list[ImaginationOut]
    next_cursor: str | None
    remaining: int
    limit: int
