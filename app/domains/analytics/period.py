"""analytics.period — 대시보드 기간 · 시간 칸(버킷) 계산 (Sprint 6-D).

- 기간: 7d · 30d · 90d · all. 끝은 오늘(한국 날짜), 시작은 끝에서 N-1 일 전 0시.
- 비교 기간: 바로 앞 같은 길이 (all 은 비교 없음).
- 시간 칸: 기간이 62일 이하면 하루, 길면 한 주(월요일 시작). 모두 한국 시간 기준.
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from functools import cached_property
from typing import Literal

from app.shared.time import KST, now_utc

PeriodKey = Literal["7d", "30d", "90d", "all"]
DAYS = {"7d": 7, "30d": 30, "90d": 90}
DAY_BUCKET_MAX = 62


@dataclass(frozen=True)
class Period:
    key: str
    start: date  # 한국 날짜 (포함)
    end: date  # 한국 날짜 (포함, 오늘)
    unit: Literal["day", "week"]
    buckets: tuple[date, ...]
    has_prev: bool

    @property
    def days(self) -> int:
        return (self.end - self.start).days + 1

    @property
    def start_utc(self) -> datetime:
        return _utc(self.start)

    @property
    def end_utc(self) -> datetime:  # 끝 날 다음 0시 (미포함)
        return _utc(self.end + timedelta(days=1))

    @property
    def prev_start_utc(self) -> datetime:
        return _utc(self.start - timedelta(days=self.days))

    def bucket_of(self, at: datetime) -> date:
        d = at.astimezone(KST).date()
        return d - timedelta(days=d.weekday()) if self.unit == "week" else d

    def index_of(self, at: datetime) -> int | None:
        """이 시각이 들어가는 칸 번호 (기간 밖이면 None)."""
        b = self.bucket_of(at)
        try:
            return self._index[b]
        except KeyError:
            return None

    @cached_property
    def _index(self) -> dict[date, int]:
        return {b: i for i, b in enumerate(self.buckets)}


def _utc(d: date) -> datetime:
    return datetime(d.year, d.month, d.day, tzinfo=KST)


def make_period(key: str, first_at: datetime | None) -> Period:
    """first_at: 전체(all) 기간의 시작 — 가장 오래된 상상 시각."""
    today = now_utc().astimezone(KST).date()
    if key in DAYS:
        start = today - timedelta(days=DAYS[key] - 1)
    else:
        start = first_at.astimezone(KST).date() if first_at else today
    days = (today - start).days + 1
    unit: Literal["day", "week"] = "day" if days <= DAY_BUCKET_MAX else "week"
    if unit == "day":
        buckets = tuple(start + timedelta(days=i) for i in range(days))
    else:
        first = start - timedelta(days=start.weekday())
        buckets = tuple(first + timedelta(weeks=i) for i in range((today - first).days // 7 + 1))
    return Period(key, start, today, unit, buckets, has_prev=key in DAYS)
