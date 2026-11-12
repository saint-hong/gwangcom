"""자동 태깅 (기획안 v10 F10) — LLM 호출 부분. 결과 저장은 tags/service.py.

출력: {"tech": [...], "desire": [...]} 각 1~5개. 형식 검사는 여기서 한다 (구조화 출력이 모양은 보장).
"""

from sqlalchemy.orm import Session

from app.domains.imaginations.models import Imagination
from app.infrastructure.llm import prompts, router

MAX_TAGS = 5
SCHEMA = {
    "type": "object",
    "properties": {
        "tech": {"type": "array", "items": {"type": "string"}},
        "desire": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["tech", "desire"],
    "additionalProperties": False,
}


def clean_tags(values: list[str], type_: str = "tech") -> list[str]:
    """화면 표기(label) 목록으로 다듬는다: 정규화 이름이 겹치면 하나만, 규칙에 안 맞으면 버림."""
    from app.domains.tags.service import to_label, to_name

    out: list[str] = []
    seen: set[str] = set()
    for v in values:
        label = to_label(v, type_)
        if label is None or to_name(label) in seen:
            continue
        seen.add(to_name(label))
        out.append(label)
    return out[:MAX_TAGS]


def run_tagging(db: Session, item: Imagination, *, log_feature: str | None = None) -> dict:
    system, user = prompts.render(
        "tagging",
        domain=item.domain.name,
        title=item.title or "(없음)",
        body=item.body,
        desire=item.desire or "(없음)",
    )
    res = router.generate_json(
        db,
        "tagging",
        system=system,
        user=user,
        schema=SCHEMA,
        max_tokens=2000,
        imagination_id=item.id,
        log_feature=log_feature,
    )
    return {
        "tech": clean_tags(res.data["tech"], "tech"),
        "desire": clean_tags(res.data["desire"], "desire"),
    }
