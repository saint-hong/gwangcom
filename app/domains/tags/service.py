"""태그 저장 · 정규화 (기획안 v10 F10, 정규화 규칙은 v11 반영목록 3장 · tags/models.py 머리말)."""

import re
import unicodedata

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.domains.imaginations.models import Imagination
from app.domains.tags.models import ImaginationTag, Tag
from app.infrastructure.llm.providers.base import LlmError, LlmLimited

# 태그 하나의 최대 글자 수 (화면 표기 기준). 욕망은 문장이어도 받는다 (2026-11-11 사용자 결정)
TAG_MAX_CHARS = {"tech": 20, "desire": 40}
TAG_TYPES = ("tech", "desire")
# 태깅하는 글: 원본 · 인용 · 혼합 (댓글은 하지 않는다. 혼합은 분석 때 원본과 나눠 본다)
TAGGED_KINDS = ("original", "quote", "blend")
STOP_AFTER_FAILS = 3  # tag_all: 연달아 이만큼 실패하면 멈춘다


def to_label(raw: str, type_: str = "tech") -> str | None:
    """화면 표기: NFC · 앞의 # 제거 · 띄어쓰기는 한 칸으로 (대소문자 유지).

    비었거나 종류별 최대 글자 수를 넘으면 None.
    """
    t = unicodedata.normalize("NFC", raw).strip().lstrip("#")
    t = re.sub(r"\s+", " ", t).strip()
    if not t or len(t) > TAG_MAX_CHARS[type_]:
        return None
    return t


def to_name(label: str) -> str:
    """비교용 이름: 띄어쓰기를 모두 없애고 영문 소문자로 ("자율 주행" = "자율주행", "AI" = "ai")."""
    return re.sub(r"\s+", "", label).lower()


def get_or_create(db: Session, raw: str, type_: str) -> Tag | None:
    """같은 이름 · 종류의 태그가 있으면 그것을, 없으면 새로 만든다 (처음 표기가 label 로 남는다).

    raw 는 여기서 다시 정규화한다. 규칙에 맞지 않으면 None.
    """
    label = to_label(raw, type_)
    if label is None:
        return None
    name = to_name(label)
    db.execute(
        insert(Tag)
        .values(name=name, label=label, type=type_)
        .on_conflict_do_nothing(constraint="uq_tags_name_type")
    )
    return db.scalars(select(Tag).where(Tag.name == name, Tag.type == type_)).one()


def save_ai_tags(db: Session, item: Imagination, tags: dict[str, list[str]]) -> None:
    """AI 태그를 갈아 끼운다. 작성자가 고친 태그(source=user)는 건드리지 않는다."""
    db.execute(
        delete(ImaginationTag).where(
            ImaginationTag.imagination_id == item.id, ImaginationTag.source == "ai"
        )
    )
    for type_ in TAG_TYPES:
        for label in tags.get(type_, []):
            tag = get_or_create(db, label, type_)
            if tag is None:
                continue
            db.execute(
                insert(ImaginationTag)
                .values(imagination_id=item.id, tag_id=tag.id, source="ai")
                .on_conflict_do_nothing()
            )


def tags_of(db: Session, item_id: int) -> list[Tag]:
    return list(
        db.scalars(
            select(Tag)
            .join(ImaginationTag, ImaginationTag.tag_id == Tag.id)
            .where(ImaginationTag.imagination_id == item_id)
            .order_by(Tag.type.desc(), ImaginationTag.created_at, Tag.id)  # tech 먼저
        )
    )


def tag_imagination(db: Session, item: Imagination) -> bool:
    """한 글을 태깅해 저장한다. 성공하면 True.

    - AI 실패 · 거절 → tagging_status=failed (tag-all 로 다시)
    - 하루 AI 한도 → pending 그대로 (내일 tag-all 로)
    호출 기록(llm_calls)은 LLM router 가 남긴다.
    """
    from app.domains.tags.tagging import run_tagging

    try:
        result = run_tagging(db, item)
    except LlmLimited:
        return False
    except LlmError:
        item.tagging_status = "failed"
        db.commit()
        return False
    save_ai_tags(db, item, result)
    item.tagging_status = "done"
    db.commit()
    return True


def tag_all(db: Session, *, include_failed: bool = True) -> tuple[int, int]:
    """아직 태깅하지 않은(failed 포함) 보이는 글을 태깅한다 → (성공, 대상) 수."""
    statuses = ["pending", "failed"] if include_failed else ["pending"]
    items = list(
        db.scalars(
            select(Imagination)
            .where(
                Imagination.status == "visible",
                Imagination.kind.in_(TAGGED_KINDS),
                Imagination.tagging_status.in_(statuses),
            )
            .order_by(Imagination.id)
        ).unique()
    )
    ok = fails_in_row = 0
    for item in items:
        if tag_imagination(db, item):
            ok += 1
            fails_in_row = 0
            continue
        if item.tagging_status == "pending":
            break  # 하루 한도에 걸림 → 멈춘다
        fails_in_row += 1
        if fails_in_row >= STOP_AFTER_FAILS:
            break  # 키 오류 · 장애처럼 계속 실패하면 멈춘다 (2026-11-11: 401 로 56번 시도한 일)
    return ok, len(items)
