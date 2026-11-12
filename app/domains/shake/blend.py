"""Shake it 혼합 (기획안 v10 F8) — LLM 호출 + 출력 검사. 게시 · 계보 · 하루 횟수는 Sprint 5.

미리보기 없이 바로 게시되므로 출력을 검사한다 (9장): 빈 결과 · 글자 수 · 금지 표현.
"""

from sqlalchemy.orm import Session

from app.domains.imaginations.models import Imagination
from app.infrastructure.llm import prompts, router

LIMITS = {"title": 40, "body": 300, "desire": 100}
SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "body": {"type": "string"},
        "desire": {"type": "string"},
        "merged_tech": {"type": "array", "items": {"type": "string"}},
        "merged_desire": {"type": "string"},
    },
    "required": ["title", "body", "desire", "merged_tech", "merged_desire"],
    "additionalProperties": False,
}
# 아주 기본적인 금지어 (고도화 때 콘텐츠 필터로) — 어린이 사용자 고려
BANNED = ("죽여", "살인", "자살", "섹스", "마약", "폭탄 제조")


def problems(out: dict) -> list[str]:
    """게시하면 안 되는 이유들 (비어 있으면 통과)."""
    found = []
    for k, n in LIMITS.items():
        v = (out.get(k) or "").strip()
        if not v:
            found.append(f"{k} 비어 있음")
        elif len(v) > n:
            found.append(f"{k} {len(v)}자 (>{n})")
    text = " ".join(str(out.get(k, "")) for k in LIMITS)
    found += [f"금지어 '{w}'" for w in BANNED if w in text]
    return found


def _fields(prefix: str, item: Imagination) -> dict[str, str]:
    return {
        f"{prefix}_domain": item.domain.name,
        f"{prefix}_title": item.title or "(없음)",
        f"{prefix}_body": item.body,
        f"{prefix}_desire": item.desire or "(없음)",
    }


def run_blend(
    db: Session, a: Imagination, b: Imagination, *, log_feature: str | None = None
) -> dict:
    system, user = prompts.render("shake", **_fields("a", a), **_fields("b", b))
    res = router.generate_json(
        db,
        "shake",
        system=system,
        user=user,
        schema=SCHEMA,
        max_tokens=4000,
        imagination_id=a.id,
        log_feature=log_feature,
    )
    return res.data
