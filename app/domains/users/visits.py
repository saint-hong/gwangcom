"""하루 접속 기록 (6-D 활성화 분석, 2026-11-13).

로그인한 요청마다 부르지만, 같은 (사용자, 한국 날짜)는 프로세스 안에서 한 번만 DB 에 쓴다.
DB 에서도 (user_id, day) 기본 키 + ON CONFLICT DO NOTHING 이라 여러 프로세스여도 한 줄.
"""

from datetime import date

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.domains.users.models import UserVisit
from app.shared.time import KST, now_utc

_seen: set[tuple[int, date]] = set()
_SEEN_MAX = 50_000


def record_visit(db: Session, user_id: int) -> None:
    day = now_utc().astimezone(KST).date()
    key = (user_id, day)
    if key in _seen:
        return
    db.execute(insert(UserVisit).values(user_id=user_id, day=day).on_conflict_do_nothing())
    db.commit()
    if len(_seen) >= _SEEN_MAX:
        _seen.clear()
    _seen.add(key)
