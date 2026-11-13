"""analytics.summary — 전체 현황 (개요 맨 위, 2026-11-13).

기간 · 그래프 설정과 상관없이 처음부터 지금까지의 대표 숫자. 오늘(한국 날짜) 늘어난 수도 함께.
- 글은 보이는 것만 센다 (숨김 · 삭제는 따로 hidden)
- Thunder · Wave 는 지금 켜져 있는 것 (끈 것은 기록(reaction_events)에만 남음)
- 탈퇴: 아직 기능이 없어 None (화면은 "—")
"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domains.analytics.schemas import SummaryOut
from app.domains.imaginations.models import Imagination
from app.domains.reactions.models import Thunder, Wave
from app.domains.shake.models import ShakeAttempt
from app.domains.users.models import User
from app.shared.time import kst_day_start


def summary(db: Session) -> SummaryOut:
    today = kst_day_start()
    rows = db.execute(
        select(
            Imagination.kind,
            Imagination.status,
            func.count(),
            func.count().filter(Imagination.created_at >= today),
        ).group_by(Imagination.kind, Imagination.status)
    ).all()
    visible = {k: (n, t) for k, st, n, t in rows if st == "visible"}
    hidden = sum(n for _, st, n, _ in rows if st != "visible")

    def total(model) -> tuple[int, int]:
        n, t = db.execute(
            select(func.count(), func.count().filter(model.created_at >= today))
        ).one()
        return n, t

    thunders, thunders_t = total(Thunder)
    waves, waves_t = total(Wave)
    users, users_t, admins = db.execute(
        select(
            func.count().filter(User.role != "admin"),
            func.count().filter(User.role != "admin", User.created_at >= today),
            func.count().filter(User.role == "admin"),
        )
    ).one()
    get = lambda k: visible.get(k, (0, 0))  # noqa: E731
    return SummaryOut(
        imaginations=get("original")[0],
        comments=get("comment")[0],
        quotes=get("quote")[0],
        hidden=hidden,
        thunders=thunders,
        waves=waves,
        blends=get("blend")[0],
        shake_attempts=db.scalar(select(func.count()).select_from(ShakeAttempt)) or 0,
        users=users,
        admins=admins,
        withdrawn=None,
        today={
            "imaginations": get("original")[1],
            "comments": get("comment")[1],
            "quotes": get("quote")[1],
            "thunders": thunders_t,
            "waves": waves_t,
            "blends": get("blend")[1],
            "users": users_t,
        },
    )
