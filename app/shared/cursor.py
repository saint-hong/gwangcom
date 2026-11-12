"""app.shared.cursor — 목록 다음 페이지용 커서 (기획안 v9 8장: next_cursor).

커서는 마지막 항목의 (created_at, id) 를 담은 문자열이다. 프론트는 내용을 해석하지 않고 그대로 넘긴다.
"""

import base64
import json
from datetime import datetime

from app.shared.errors import bad_request


def encode_cursor(created_at: datetime, item_id: int) -> str:
    raw = json.dumps({"t": created_at.isoformat(), "i": item_id}, separators=(",", ":"))
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


def encode_offset(offset: int) -> str:
    """점수 순 목록(추천 탭)처럼 시간 순이 아닌 목록은 몇 번째부터인지를 커서로 쓴다."""
    return base64.urlsafe_b64encode(json.dumps({"o": offset}).encode()).decode().rstrip("=")


def decode_offset(cursor: str) -> int:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        return max(0, int(json.loads(base64.urlsafe_b64decode(padded.encode()))["o"]))
    except (ValueError, KeyError, TypeError) as exc:
        raise bad_request("invalid_cursor", "목록 위치 정보가 올바르지 않아요.") from exc


def decode_cursor(cursor: str) -> tuple[datetime, int]:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        data = json.loads(base64.urlsafe_b64decode(padded.encode()))
        return datetime.fromisoformat(data["t"]), int(data["i"])
    except (ValueError, KeyError, TypeError) as exc:
        raise bad_request("invalid_cursor", "목록 위치 정보가 올바르지 않아요.") from exc
