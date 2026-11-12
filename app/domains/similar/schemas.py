from typing import Literal

from pydantic import BaseModel

from app.domains.imaginations.schemas import ImaginationOut


class SimilarItemOut(BaseModel):
    item: ImaginationOut
    score: float | None = None  # 1단계 벡터 유사도 (같은 분야 · 태그로 찾았으면 없음)
    reason: str | None = None  # LLM 이 붙인 "왜 비슷한가" (리랭킹일 때만)


class SimilarOut(BaseModel):
    """GET /api/imaginations/{id}/similar — 비슷한 상상 (F23).

    method: rerank = LLM 이 고름 · vector = 벡터 순서 · tags = 같은 분야 · 태그 · none = 대상 아님
    """

    items: list[SimilarItemOut]
    method: Literal["rerank", "vector", "tags", "none"]
