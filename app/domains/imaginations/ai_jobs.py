"""글을 올린 뒤 백그라운드에서 하는 AI 작업 (기획안 v10 F10 · F23, Sprint 5-A).

글쓰기 응답을 먼저 보내고 나서 실행한다 (FastAPI BackgroundTasks).
요청 세션은 이미 닫혔으므로 새 세션을 연다. 여기서 실패해도 글은 그대로 올라가 있다.
  - 태깅: 원본 · 인용 · 혼합 → 실패하면 CLI tag-all 로 다시
  - 임베딩: 원본 · 인용 (비슷한 상상 대상) → 실패하면 CLI embed-all 로 다시
  - 비슷한 상상(리랭킹, 5-C): 임베딩 다음에 이 글의 목록을 계산 → 실패하면 CLI similar-all 로 다시
    (다른 글의 목록은 새 글을 모른다 → similar-all 을 주기적으로 돌린다)
"""

import logging

from app.domains.imaginations.models import Imagination
from app.infrastructure.core.database import get_sessionmaker

log = logging.getLogger(__name__)


def after_post(item_id: int) -> None:
    from app.domains.similar.service import KINDS as EMBED_KINDS
    from app.domains.similar.service import embed_items
    from app.domains.tags.service import TAGGED_KINDS, tag_imagination

    with get_sessionmaker()() as db:
        item = db.get(Imagination, item_id)
        if item is None or item.status != "visible":
            return
        if item.kind in TAGGED_KINDS:
            try:
                tag_imagination(db, item)
            except Exception:  # noqa: BLE001 — 백그라운드 작업은 글쓰기에 영향을 주지 않는다
                db.rollback()
                log.exception("태깅 실패: imagination %s", item_id)
        if item.kind in EMBED_KINDS:
            try:
                embed_items(db, [item])
            except Exception:  # noqa: BLE001
                db.rollback()
                log.exception("임베딩 실패: imagination %s", item_id)
                return
            try:
                from app.domains.similar.rerank import compute_similar

                compute_similar(db, item)
            except Exception:  # noqa: BLE001
                db.rollback()
                log.exception("비슷한 상상 계산 실패: imagination %s", item_id)
