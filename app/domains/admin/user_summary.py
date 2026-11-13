"""운영자 사용자 상세의 "AI가 분석했어요" (2026-11-13 사용자 요청, A5 보완).

- 활동 요약 6칸 + 가입 기간 · 마지막 글 날짜를 LLM 에 넘겨 2~3 문장 설명을 받는다 (prompts/v1/user_summary.md)
- 운영자 분석 업무 보조(AI 비서)다. 설명만 하고 평가 · 등급 · 제재 판단은 운영자 몫 (2026-11-13 기본값)
- 같은 활동 숫자면 다시 부르지 않는다 (서버 메모리에 보관 — 숫자가 바뀌거나 서버를 다시 켜면 새로 분석)
- AI 를 쓸 수 없으면(실패 · 하루 한도) summary=null + 안내 문구. 화면의 다른 부분은 그대로 쓴다
"""

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domains.admin.policy_admin import _get_user, activity_of
from app.domains.admin.schemas import UserSummaryOut
from app.domains.imaginations.models import Imagination
from app.infrastructure.llm import router
from app.infrastructure.llm.prompts import render
from app.infrastructure.llm.providers.base import LlmError, LlmLimited
from app.shared.time import KST, now_utc

SCHEMA = {
    "type": "object",
    "properties": {"summary": {"type": "string"}},
    "required": ["summary"],
    "additionalProperties": False,
}

_cache: dict[tuple, UserSummaryOut] = {}


def _kst_date(dt: datetime) -> str:
    return dt.astimezone(KST).strftime("%Y-%m-%d")


def summarize(db: Session, admin_id: int, user_id: int) -> UserSummaryOut:
    user = _get_user(db, user_id)
    a = activity_of(db, user)
    last = db.scalar(
        select(func.max(Imagination.created_at)).where(
            Imagination.author_id == user.id, Imagination.status == "visible"
        )
    )
    key = (
        user.id,
        a.posts,
        a.blends,
        a.comments,
        a.thunders_received,
        a.posts_today,
        a.shakes_today,
        last,
    )
    if key in _cache:
        return _cache[key]

    joined_days = max(1, (now_utc() - user.created_at).days + 1)
    system, prompt = render(
        "user_summary",
        nickname=user.nickname,
        joined_days=str(joined_days),
        last_post=_kst_date(last) if last else "없음",
        posts=str(a.posts),
        blends=str(a.blends),
        comments=str(a.comments),
        thunders=str(a.thunders_received),
        posts_today=str(a.posts_today),
        shakes_today=str(a.shakes_today),
    )
    try:
        res = router.generate_json(
            db,
            "user_summary",
            system=system,
            user=prompt,
            schema=SCHEMA,
            max_tokens=800,
            user_id=admin_id,
        )
    except LlmLimited as e:
        db.rollback()
        return UserSummaryOut(summary=None, error=str(e))
    except LlmError:
        db.rollback()
        return UserSummaryOut(summary=None, error="지금은 AI 분석을 불러오지 못했어요.")

    text = str(res.data.get("summary", "")).strip()
    if not text:
        return UserSummaryOut(summary=None, error="지금은 AI 분석을 불러오지 못했어요.")
    out = UserSummaryOut(summary=text, model=router.route("user_summary")[1], at=now_utc())
    _cache[key] = out
    return out
