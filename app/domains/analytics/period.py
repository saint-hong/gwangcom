"""analytics.period — 대시보드 기간 · 시간 칸(버킷) 계산 (Sprint 6-D).

- 기간: 빠른 선택 7d · 10d · 20d · 30d(1개월) · 90d(3개월) · 180d(6개월) · all,
  또는 직접 고른 날짜 범위 "YYYY-MM-DD~YYYY-MM-DD" (2026-11-17 사용자 요청: 그래프 설정 달력).
  빠른 선택은 끝이 오늘(한국 날짜), 시작은 끝에서 N-1 일 전 0시. 직접 고른 범위는 끝이 오늘을 넘으면 오늘로 줄인다.
- 비교 기간: 바로 앞 같은 길이 (all 은 비교 없음).
- 시간 칸: 기간이 62일 이하면 하루, 길면 한 주(월요일 시작). 모두 한국 시간 기준.
"""

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from functools import cached_property
from typing import Literal

from app.shared.time import KST, now_utc

PeriodKey = str  # 빠른 선택 키 또는 "YYYY-MM-DD~YYYY-MM-DD"
DAYS = {"7d": 7, "10d": 10, "20d": 20, "30d": 30, "90d": 90, "180d": 180}
DAY_BUCKET_MAX = 62
RANGE_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})~(\d{4}-\d{2}-\d{2})$")
# API 검사용 (FastAPI Query pattern)
PERIOD_PATTERN = r"^(" + "|".join(DAYS) + r"|all|\d{4}-\d{2}-\d{2}~\d{4}-\d{2}-\d{2})$"


class PeriodError(ValueError):
    """잘못된 기간 (없는 날짜 · 시작이 끝보다 늦음 · 미래)."""


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
    end = today
    if key in DAYS:
        start = today - timedelta(days=DAYS[key] - 1)
    elif m := RANGE_RE.match(key):
        try:
            start, end = date.fromisoformat(m[1]), date.fromisoformat(m[2])
        except ValueError as e:
            raise PeriodError("없는 날짜예요.") from e
        if start > end:
            raise PeriodError("시작일이 종료일보다 늦어요.")
        if start > today:
            raise PeriodError("미래 기간은 고를 수 없어요.")
        end = min(end, today)
    elif key == "all":
        start = first_at.astimezone(KST).date() if first_at else today
    else:
        raise PeriodError("알 수 없는 기간이에요.")
    days = (end - start).days + 1
    unit: Literal["day", "week"] = "day" if days <= DAY_BUCKET_MAX else "week"
    if unit == "day":
        buckets = tuple(start + timedelta(days=i) for i in range(days))
    else:
        first = start - timedelta(days=start.weekday())
        buckets = tuple(first + timedelta(weeks=i) for i in range((end - first).days // 7 + 1))
    return Period(key, start, end, unit, buckets, has_prev=key != "all")
