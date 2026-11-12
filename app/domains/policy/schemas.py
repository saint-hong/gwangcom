from pydantic import BaseModel


class LimitsOut(BaseModel):
    """GET /api/me/limits — 내게 적용되는 최종 한도·권한·오늘 남은 횟수."""

    limits: dict[str, int]
    permissions: dict[str, bool]
    today: dict[str, int]
