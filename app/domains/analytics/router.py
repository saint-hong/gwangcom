"""analytics 라우터 — /api/admin/analytics/* (운영자만, Sprint 6-D).

탭마다 하나씩 부른다 (한 번에 다 계산하지 않도록): overview · tech · cross · engagement(+ activation) · shake · ai
+ export.csv (기간 안 대중 상상 원자료: 분야 · 기술 · 욕망 · 반응 수 — 외부 분석 도구용)
"""

import csv
import io
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.domains.analytics import activation as act
from app.domains.analytics import engagement as eng
from app.domains.analytics import insights
from app.domains.analytics import summary as summ
from app.domains.analytics.frame import first_post_at, load_posts
from app.domains.analytics.period import Period, PeriodKey, make_period
from app.domains.analytics.schemas import (
    ActivationOut,
    AiOut,
    CrossOut,
    EngagementOut,
    OverviewOut,
    ShakeOut,
    SummaryOut,
    TechOut,
)
from app.domains.auth.deps import admin_user
from app.domains.users.models import User
from app.infrastructure.core.database import get_db
from app.shared.time import KST

router = APIRouter(prefix="/api/admin/analytics", tags=["analytics"])

DB = Annotated[Session, Depends(get_db)]
Admin = Annotated[User, Depends(admin_user)]
PeriodQ = Annotated[PeriodKey, Query()]


def _period(db: Session, key: str) -> Period:
    return make_period(key, first_post_at(db) if key == "all" else None)


@router.get("/summary", response_model=SummaryOut)
def get_summary(db: DB, _: Admin):
    """전체 현황 — 기간과 상관없이 처음부터 지금까지 (개요 맨 위)."""
    return summ.summary(db)


@router.get("/overview", response_model=OverviewOut)
def get_overview(db: DB, _: Admin, period: PeriodQ = "30d"):
    return insights.overview(db, _period(db, period))


@router.get("/tech", response_model=TechOut)
def get_tech(db: DB, _: Admin, period: PeriodQ = "30d"):
    return insights.tech(db, _period(db, period))


@router.get("/cross", response_model=CrossOut)
def get_cross(db: DB, _: Admin, period: PeriodQ = "30d"):
    return insights.cross(db, _period(db, period))


@router.get("/engagement", response_model=EngagementOut)
def get_engagement(db: DB, _: Admin, period: PeriodQ = "30d"):
    return eng.engagement(db, _period(db, period))


@router.get("/activation", response_model=ActivationOut)
def get_activation(db: DB, _: Admin, period: PeriodQ = "30d"):
    """신규 Dreamer 활성화 — 첫 7일 단계표 · 첫 주 경험별 계속 활동 비교 · 신규 Dreamer 목록."""
    return act.activation(db, _period(db, period))


@router.get("/shake", response_model=ShakeOut)
def get_shake(db: DB, _: Admin, period: PeriodQ = "30d"):
    return eng.shake(db, _period(db, period))


@router.get("/ai", response_model=AiOut)
def get_ai(db: DB, _: Admin, period: PeriodQ = "30d"):
    return eng.ai(db, _period(db, period))


@router.get("/export.csv")
def export_csv(db: DB, _: Admin, period: PeriodQ = "30d"):
    p = _period(db, period)
    posts = load_posts(db, p.start_utc, p.end_utc)
    buf = io.StringIO()
    buf.write("\ufeff")  # 엑셀에서 한글이 깨지지 않게
    w = csv.writer(buf)
    w.writerow(
        [
            "id",
            "작성(한국 시간)",
            "종류",
            "분야",
            "질문 답",
            "AI 도움",
            "기술",
            "욕망",
            "Thunder",
            "Wave",
            "인용",
            "북마크",
            "댓글",
            "제목",
            "본문",
        ]
    )
    for x in posts:
        w.writerow(
            [
                x.id,
                x.created_at.astimezone(KST).strftime("%Y-%m-%d %H:%M"),
                x.kind,
                x.domain,
                x.prompt_id or "",
                "Y" if x.ai_assisted else "",
                " | ".join(label for _, label in x.techs),
                " | ".join(label for _, label in x.desires),
                x.thunders,
                x.waves,
                x.quotes,
                x.bookmarks,
                x.comments,
                x.title or "",
                x.body,
            ]
        )
    name = f"imagine_{p.start:%Y%m%d}-{p.end:%Y%m%d}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )
