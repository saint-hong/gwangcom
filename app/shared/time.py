"""app.shared.time — 시간 기준. DB 에는 UTC(timestamptz), 하루 횟수는 한국 시간 자정 기준."""

from datetime import UTC, datetime, timedelta, timezone

KST = timezone(timedelta(hours=9), "KST")


def now_utc() -> datetime:
    return datetime.now(UTC)


def kst_day_start(at: datetime | None = None) -> datetime:
    """`at`(기본: 지금)이 속한 한국 날짜의 0시를 UTC 로 돌려준다."""
    local = (at or now_utc()).astimezone(KST)
    return local.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(UTC)
