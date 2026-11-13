"""질문 상세의 "답한 상상" 목록 (2026-11-13 사용자 요청) — 최신순, 커서 20개씩.

imaginations.service 가 prompts.service 를 쓰므로(답할 수 있는 질문 검사) 순환을 피해 따로 둔다.
"""

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.domains.imaginations.models import Imagination
from app.domains.imaginations.service import FEED_PAGE_SIZE, present
from app.domains.prompts.schemas import PromptFeedOut
from app.domains.prompts.service import ANSWER, get_public
from app.domains.users.models import User
from app.shared.cursor import decode_cursor, encode_cursor


def answer_feed(
    db: Session, user: User | None, prompt_id: int, cursor: str | None
) -> PromptFeedOut:
    get_public(db, prompt_id)  # 꺼진 · 예정 질문은 404
    q = select(Imagination).where(Imagination.prompt_id == prompt_id, *ANSWER)
    if cursor:
        t, i = decode_cursor(cursor)
        q = q.where(
            or_(Imagination.created_at < t, (Imagination.created_at == t) & (Imagination.id < i))
        )
    rows = list(
        db.scalars(
            q.order_by(Imagination.created_at.desc(), Imagination.id.desc()).limit(
                FEED_PAGE_SIZE + 1
            )
        ).unique()
    )
    has_more = len(rows) > FEED_PAGE_SIZE
    rows = rows[:FEED_PAGE_SIZE]
    next_cursor = encode_cursor(rows[-1].created_at, rows[-1].id) if has_more and rows else None
    return PromptFeedOut(items=present(db, rows, user), next_cursor=next_cursor)
