"""대시보드 반응 탭 "반응 순위 · Thunder 분포" 위의 "AI가 분석했어요" (2026-11-16 사용자 요청).

- Thunder 분포(실제 vs 예상 정규분포) + 반응 많이 받은 상상(분야 · 욕망)을 LLM 에 넘겨 2~3 문장 설명을 받는다
  (prompts/v1/reaction_summary.md). 제공자 · 모델은 사용자 요약과 같은 설정(llm_summary_*)을 쓴다.
- 운영자 분석 업무 보조(AI 비서)다. 반응이 어디에 쏠렸는지 설명만 하고, 기술 변화 판단 · 권고는 하지 않는다 (원칙 4)
- 같은 숫자면 다시 부르지 않는다 (서버 메모리에 보관)
- AI 를 쓸 수 없으면 summary=null + 안내 문구
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domains.analytics.engagement import engagement
from app.domains.analytics.period import Period
from app.domains.analytics.schemas import AiSummaryOut
from app.domains.tags.models import Domain
from app.infrastructure.llm import router
from app.infrastructure.llm.prompts import render
from app.infrastructure.llm.providers.base import LlmError, LlmLimited
from app.shared.time import now_utc

SCHEMA = {
    "type": "object",
    "properties": {"summary": {"type": "string"}},
    "required": ["summary"],
    "additionalProperties": False,
}
TOP_N = 10
FAIL = "지금은 AI 분석을 불러오지 못했어요."

_cache: dict[tuple, AiSummaryOut] = {}


def _compare(actual: int, expected: float) -> str:
    """실제 vs 예상 비교는 서버가 정해서 넘긴다 — 모델이 직접 빼기를 하다 틀린 일이 있었다 (2026-11-17 실측)."""
    if abs(actual - expected) < max(1.0, expected * 0.15):
        return "비슷"
    return "예상보다 많음" if actual > expected else "예상보다 적음"


def summarize(db: Session, admin_id: int, p: Period) -> AiSummaryOut:
    e = engagement(db, p)
    count = sum(n for _, n in e.histogram)
    if count == 0 and not e.top:
        return AiSummaryOut(summary=None, error="이 기간에는 분석할 상상 · 반응이 없어요.")
    top = e.top[:TOP_N]
    key = (
        p.start,
        p.end,
        tuple(e.histogram),
        tuple((t.id, t.thunders, t.total, tuple(t.desires)) for t in top),
    )
    if key in _cache:
        return _cache[key]

    names = {slug: name for slug, name in db.execute(select(Domain.slug, Domain.name))}
    system, prompt = render(
        "reaction_summary",
        period=f"{p.start} ~ {p.end} ({p.days}일)",
        count=str(count),
        histogram="\n".join(
            f"  {label}개: {n} / {exp:.1f} → {_compare(n, exp)}"
            for (label, n), exp in zip(e.histogram, e.histogram_normal, strict=True)
        ),
        mean=f"{e.thunder_mean:.1f}",
        median=f"{e.thunder_median:g}",
        sd=f"{e.thunder_sd:.1f}",
        top="\n".join(
            f"{i}. {t.title} — 분야 {names.get(t.domain, t.domain)} · "
            f"욕망 {', '.join(t.desires) or '없음'} · Thunder {t.thunders} · 합계 {t.total}"
            for i, t in enumerate(top, 1)
        )
        or "(없음)",
    )
    try:
        res = router.generate_json(
            db,
            "reaction_summary",
            system=system,
            user=prompt,
            schema=SCHEMA,
            max_tokens=800,
            user_id=admin_id,
        )
    except LlmLimited as err:
        db.rollback()
        return AiSummaryOut(summary=None, error=str(err))
    except LlmError:
        db.rollback()
        return AiSummaryOut(summary=None, error=FAIL)

    text = str(res.data.get("summary", "")).strip()
    if not text:
        return AiSummaryOut(summary=None, error=FAIL)
    out = AiSummaryOut(summary=text, model=router.route("reaction_summary")[1], at=now_utc())
    _cache[key] = out
    return out
