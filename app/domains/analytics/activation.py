"""analytics.activation — 신규 Dreamer 활성화 (반응 · 질문 · 활동 탭, 2026-11-13).

목적: 처음 가입한 Dreamer 가 어디서 멈추고, 첫 주에 무엇을 경험한 사람이 오래 남는지 보고
운영자가 할 일을 찾는다. 숫자만 계산하고 해석은 운영자가 한다 (원칙 4).

- 대상: 선택한 기간에 가입한 Dreamer (운영자 제외). 전체 기간은 처음부터.
- 첫 7일 = 가입 시각부터 7일. 그 안에 해 본 일:
    다시 들어옴(가입한 다음 날 이후 접속 또는 활동) · 반응 남김 · 첫 상상(원본 · 인용) · Thunder 받음(남이 준 것)
- 계속 활동 = 가입 후 8~28일째에 접속 또는 활동. 가입 후 8일이 안 지난 사람은 아직 판정하지 않는다(분모에서 뺌).
- 활동 = 글(상상 · 인용 · 댓글 · 혼합) · 반응 켜고 끄기 · 팔로우 · Shake it 시도. 접속 = user_visits.
"""

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from statistics import median

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domains.analytics.insights import period_out
from app.domains.analytics.period import Period
from app.domains.analytics.schemas import (
    ActivationCompare,
    ActivationOut,
    ActivationStep,
    NewUserRow,
)
from app.domains.imaginations.models import Imagination
from app.domains.reactions.models import ReactionEvent, Thunder
from app.domains.shake.models import ShakeAttempt
from app.domains.users.models import Follow, User, UserVisit
from app.shared.time import KST, now_utc

WINDOW = 7
KEEP_FROM, KEEP_TO = 8, 28
IDLE_DAYS = 7  # 마지막 활동이 이보다 오래면 "멈춤"
LIST_MAX = 100


@dataclass
class _U:
    id: int
    nickname: str
    joined: datetime
    acts: list[datetime] = field(default_factory=list)  # 활동 시각 (접속 제외)
    visits: list[datetime] = field(default_factory=list)
    posts: list[tuple[datetime, int | None]] = field(
        default_factory=list
    )  # (시각, prompt_id) 원본 · 인용
    originals: list[tuple[datetime, int | None]] = field(default_factory=list)
    comments: list[datetime] = field(default_factory=list)
    reactions: list[datetime] = field(default_factory=list)  # 켠 것만
    follows: list[datetime] = field(default_factory=list)
    shakes: list[datetime] = field(default_factory=list)
    thunders_got: list[datetime] = field(default_factory=list)

    def within(self, times: list[datetime], start_day: int, end_day: int) -> bool:
        a, b = self.joined + timedelta(days=start_day), self.joined + timedelta(days=end_day)
        return any(a <= t < b for t in times)

    def first_week(self, times: list[datetime]) -> bool:
        return self.within(times, 0, WINDOW)


def _kst_day(at: datetime) -> date:
    return at.astimezone(KST).date()


def activation(db: Session, p: Period) -> ActivationOut:
    now = now_utc()
    q = select(User.id, User.nickname, User.created_at).where(
        User.role != "admin", User.created_at < p.end_utc
    )
    if p.key != "all":
        q = q.where(User.created_at >= p.start_utc)
    users = {uid: _U(uid, nick, joined) for uid, nick, joined in db.execute(q).all()}
    ids = list(users)

    if ids:
        for uid, at, kind, prompt_id in db.execute(
            select(
                Imagination.author_id,
                Imagination.created_at,
                Imagination.kind,
                Imagination.prompt_id,
            ).where(Imagination.author_id.in_(ids))
        ).all():
            u = users[uid]
            u.acts.append(at)
            if kind in ("original", "quote"):
                u.posts.append((at, prompt_id))
            if kind == "original":
                u.originals.append((at, prompt_id))
            if kind == "comment":
                u.comments.append(at)
        for uid, at, on in db.execute(
            select(ReactionEvent.user_id, ReactionEvent.created_at, ReactionEvent.on).where(
                ReactionEvent.user_id.in_(ids)
            )
        ).all():
            users[uid].acts.append(at)
            if on:
                users[uid].reactions.append(at)
        for uid, at in db.execute(
            select(Follow.follower_id, Follow.created_at).where(Follow.follower_id.in_(ids))
        ).all():
            users[uid].acts.append(at)
            users[uid].follows.append(at)
        for uid, at in db.execute(
            select(ShakeAttempt.user_id, ShakeAttempt.created_at).where(
                ShakeAttempt.user_id.in_(ids)
            )
        ).all():
            users[uid].acts.append(at)
            users[uid].shakes.append(at)
        for uid, at in db.execute(
            select(UserVisit.user_id, UserVisit.first_at).where(UserVisit.user_id.in_(ids))
        ).all():
            users[uid].visits.append(at)
        for uid, at in db.execute(
            select(Imagination.author_id, Thunder.created_at)
            .join(Imagination, Imagination.id == Thunder.imagination_id)
            .where(
                Imagination.author_id.in_(ids),
                Imagination.kind.in_(("original", "quote")),
                Thunder.user_id != Imagination.author_id,
            )
        ).all():
            users[uid].thunders_got.append(at)

    eligible_cut = now - timedelta(days=KEEP_FROM)
    flags: dict[int, dict[str, bool]] = {}
    for u in users.values():
        seen = u.acts + u.visits
        joined_day = _kst_day(u.joined)
        f = {
            "returned": any(
                _kst_day(t) > joined_day and t < u.joined + timedelta(days=WINDOW) for t in seen
            ),
            "reacted": u.first_week(u.reactions),
            "posted": u.first_week([t for t, _ in u.posts]),
            "got_thunder": u.first_week(u.thunders_got),
        }
        if u.joined <= eligible_cut:
            f["kept"] = u.within(seen, KEEP_FROM - 1, KEEP_TO)
        flags[u.id] = f

    n = len(users)
    eligible = [uid for uid, f in flags.items() if "kept" in f]
    steps = [
        ActivationStep(key="joined", label="가입", users=n, base=n),
        *[
            ActivationStep(key=k, label=label, users=sum(f[k] for f in flags.values()), base=n)
            for k, label in (
                ("returned", "다시 들어옴 (2~7일째)"),
                ("reacted", "반응을 남김"),
                ("posted", "첫 상상을 씀"),
                ("got_thunder", "Thunder 를 받음"),
            )
        ],
        ActivationStep(
            key="kept",
            label=f"계속 활동 ({KEEP_FROM}~{KEEP_TO}일째)",
            users=sum(flags[uid]["kept"] for uid in eligible),
            base=len(eligible),
        ),
    ]

    # 첫 주 경험별 비교 — 결과는 모두 "계속 활동" (판정할 수 있는 사람만)
    def first_original(u: _U) -> tuple[datetime, int | None] | None:
        first = sorted(u.originals)[:1]
        return first[0] if first and u.first_week([first[0][0]]) else None

    experiences = [
        (
            "reacted",
            "첫 주에 반응을 남겼나",
            "남김",
            "안 남김",
            None,
            lambda u: u.first_week(u.reactions),
        ),
        (
            "posted",
            "첫 주에 상상을 썼나",
            "씀",
            "안 씀",
            None,
            lambda u: u.first_week([t for t, _ in u.posts]),
        ),
        (
            "got_thunder",
            "첫 주에 Thunder 를 받았나 (상상을 쓴 사람만)",
            "받음",
            "못 받음",
            lambda u: u.first_week([t for t, _ in u.posts]),
            lambda u: u.first_week(u.thunders_got),
        ),
        (
            "prompt_start",
            "첫 상상이 이번 주 질문의 답이었나 (첫 주에 원본을 쓴 사람만)",
            "질문 답",
            "자유 상상",
            lambda u: first_original(u) is not None,
            lambda u: (first_original(u) or (None, None))[1] is not None,
        ),
        (
            "followed",
            "첫 주에 팔로우를 했나",
            "함",
            "안 함",
            None,
            lambda u: u.first_week(u.follows),
        ),
        (
            "commented",
            "첫 주에 댓글을 썼나",
            "씀",
            "안 씀",
            None,
            lambda u: u.first_week(u.comments),
        ),
        (
            "shook",
            "첫 주에 Shake it 을 해 봤나",
            "해 봄",
            "안 해 봄",
            None,
            lambda u: u.first_week(u.shakes),
        ),
    ]
    compare = []
    for key, label, yes, no, among, test in experiences:
        yn = yk = nn = nk = 0
        for uid in eligible:
            u = users[uid]
            if among is not None and not among(u):
                continue
            kept = flags[uid]["kept"]
            if test(u):
                yn, yk = yn + 1, yk + kept
            else:
                nn, nk = nn + 1, nk + kept
        compare.append(
            ActivationCompare(
                key=key,
                label=label,
                yes_label=yes,
                no_label=no,
                yes_n=yn,
                yes_kept=yk,
                no_n=nn,
                no_kept=nk,
            )
        )

    hours = [
        (min(firsts) - u.joined).total_seconds() / 3600
        for u in users.values()
        if (firsts := [t for t, _ in u.posts if t >= u.joined])
    ]

    joined_series = [0] * len(p.buckets)
    for u in users.values():
        i = p.index_of(u.joined)
        if i is not None:
            joined_series[i] += 1

    rows = []
    for u in sorted(users.values(), key=lambda x: x.joined, reverse=True)[:LIST_MAX]:
        seen = u.acts + u.visits
        last = max(seen) if seen else None
        idle = (now - last).days if last else None
        if not u.acts:
            status = "not_started"
        elif idle is not None and idle < IDLE_DAYS:
            status = "active"
        else:
            status = "idle"
        rows.append(
            NewUserRow(
                id=u.id,
                nickname=u.nickname,
                joined_at=u.joined,
                steps=flags[u.id],
                posts=len(u.posts),
                reactions=len(u.reactions),
                thunders_got=len(u.thunders_got),
                last_active_at=last,
                idle_days=idle,
                status=status,
            )
        )

    since = db.scalar(select(func.min(UserVisit.day)))
    return ActivationOut(
        period=period_out(p),
        window_days=WINDOW,
        keep_from=KEEP_FROM,
        keep_to=KEEP_TO,
        new_users=n,
        eligible=len(eligible),
        joined_series=joined_series,
        steps=steps,
        compare=compare,
        first_post_hours_median=round(median(hours), 1) if hours else None,
        visits_since=since,
        users=rows,
    )
