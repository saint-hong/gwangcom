"""seed-demo — 대시보드 분석이 뜻을 드러내는 16주치 샘플 (2026-11-13 다시 만듦).

내부 테스트용 가상 데이터다. 매번 같은 결과(고정 난수)가 나온다.

만드는 것
- Dreamer 72명: 16주에 걸쳐 가입(최근일수록 많이), 성향 = 열심 · 꾸준 · 가끔 · 구경만 · 가입만
  dreamer01~10 은 처음부터 있던 열심 · 꾸준 Dreamer (샘플 로그인 계정)
- 첫 주 경험이 계속 활동에 영향: 첫 상상에 Thunder 를 받음 · 질문 답으로 시작 · 팔로우 → 남을 확률이 오름
  (신규 Dreamer 활성화 패널에서 차이가 보이도록)
- 상상: 주제(seed_topics.TOPICS)마다 시간에 따른 모양(꾸준 · 떠오름 · 식는 중 · 새로 등장)과 공감 정도가 달라
  기술 신호 · 사분면 · 히트맵 · 네트워크에서 흐름이 보인다. 태그는 AI 를 부르지 않고 주제에서 바로 붙인다
- 이번 주 질문 11개(지난 15주): 그 주에는 질문 주제의 상상이 늘고, 질문마다 공감 정도가 다르다
- 반응 · 댓글 · 답글 · 인용 · 팔로우 · Shake it(혼합 글 · 실패 · 계보 2단계) · 조회 · 하루 접속 · 알림
- 시간대: 글은 출근 · 점심 · 밤에, 반응은 점심 · 저녁에 많고 주말에 조금 더 많다 (한국 시간)
"""

import math
import random
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.domains.imaginations.models import Imagination, ImaginationView
from app.domains.prompts.models import Prompt
from app.domains.reactions.models import Bookmark, ReactionEvent, Thunder, Wave
from app.domains.shake.models import ImaginationParent, ShakeAttempt
from app.domains.tags.models import Domain
from app.domains.tags.service import save_ai_tags
from app.domains.users.models import Follow, User, UserVisit
from app.interfaces.cli.seed_data import COMMENTS, QUOTES, REPLIES
from app.interfaces.cli.seed_topics import (
    DESIRE_TEXT,
    NICK_A,
    NICK_B,
    PREFIXES,
    PROMPTS,
    TOPICS,
    Topic,
)
from app.shared.time import KST, now_utc

DAYS = 112  # 16주
N_USERS = 72
FIRST_FIXED = 10  # dreamer01~10: 처음부터 있던 Dreamer

# 성향별: (상상 쓰기 / 접속한 날, 접속 확률 / 활동하는 날, 반응 수 / 접속한 날, 첫 주 상상 확률, 첫 주 팔로우 확률, 기본 유지 확률)
PERSONA = {
    "core": (0.55, 0.85, 4.0, 1.0, 0.6, 0.95),
    "regular": (0.30, 0.55, 2.5, 0.85, 0.45, 0.55),
    "casual": (0.25, 0.35, 1.5, 0.6, 0.25, 0.25),
    "lurker": (0.04, 0.45, 2.0, 0.1, 0.2, 0.40),
    "ghost": (0.0, 0.0, 0.0, 0.0, 0.0, 0.03),
}
PERSONA_MIX = [("core", 0.1), ("regular", 0.3), ("casual", 0.35), ("lurker", 0.15), ("ghost", 0.1)]

# 시간대 무게 (한국 시간 0~23시)
POST_HOURS = [
    1,
    0.5,
    0.3,
    0.2,
    0.2,
    0.4,
    1,
    2.5,
    3,
    1.5,
    1.2,
    1.5,
    3,
    2.5,
    1.2,
    1,
    1.2,
    1.5,
    2,
    2.5,
    3,
    3.5,
    3.5,
    2,
]
REACT_HOURS = [
    1.2,
    0.6,
    0.3,
    0.2,
    0.2,
    0.3,
    0.8,
    1.5,
    2,
    1.5,
    1.2,
    1.5,
    3,
    3,
    1.5,
    1.2,
    1.5,
    2,
    3,
    3.5,
    3.5,
    3.5,
    3,
    2,
]


@dataclass
class Sim:
    user: User
    persona: str
    joined: datetime
    end: datetime  # 마지막으로 활동하는 시각 (이후는 멈춤)
    fav: tuple[str, str]
    first_post: bool = False
    prompt_start: bool = False
    follow_w1: bool = False
    thunder_w1: bool | None = None  # 첫 상상이 첫 주에 Thunder 를 받나 (정해지면)
    posts: list[Imagination] = field(default_factory=list)
    visit_days: set = field(default_factory=set)

    def alive(self, at: datetime) -> bool:
        return self.joined <= at <= self.end


def _at_hour(rng: random.Random, day_start: datetime, weights: list[float]) -> datetime:
    """한국 날짜 0시(day_start, KST)에서 시간대 무게대로 고른 시각 (UTC)."""
    hour = rng.choices(range(24), weights=weights)[0]
    return (day_start + timedelta(hours=hour, minutes=rng.randint(0, 59))).astimezone(
        now_utc().tzinfo
    )


def _trend(t: Topic, days_ago: float) -> float:
    kind, weight = t.trend[0], t.trend[1]
    x = 1 - days_ago / DAYS  # 0 = 16주 전, 1 = 오늘
    if kind == "steady":
        return weight
    if kind == "rising":
        start = t.trend[2]
        return (
            weight * (0.15 + 0.85 * max(0.0, 1 - days_ago / start))
            if days_ago < start
            else weight * 0.08
        )
    if kind == "cooling":
        return weight * (0.12 + 0.88 * (1 - x) ** 1.6)
    if kind == "new":
        return weight if days_ago < t.trend[2] else 0.0
    if kind == "burst":
        return weight
    return weight


def reset(db: Session, demo_domain: str) -> None:
    demo_users = select(User.id).where(User.email.like(f"%@{demo_domain}"))
    db.execute(delete(User).where(User.id.in_(demo_users)))  # 글 · 반응 · 접속 기록도 함께 지워진다
    db.execute(
        delete(Prompt).where(
            Prompt.created_by.is_(None), Prompt.title.in_([p.title for p in PROMPTS])
        )
    )
    db.commit()


def seed(db: Session, demo_domain: str, pw_hash: str) -> dict[str, int]:
    rng = random.Random(20261113)
    now = now_utc()
    today = now.astimezone(KST).replace(hour=0, minute=0, second=0, microsecond=0)
    origin = today - timedelta(days=DAYS)
    domains = {d.slug: d.id for d in db.scalars(select(Domain))}
    topics = {t.key: t for t in TOPICS}

    # ---- 이번 주 질문 (지난 주들, 월요일 9시 ~ 다음 월요일 9시)
    monday = today - timedelta(days=today.weekday())
    prompts: list[tuple[Prompt, object]] = []
    for sp in PROMPTS:
        start = monday - timedelta(weeks=sp.weeks_ago) + timedelta(hours=9)
        pr = Prompt(
            title=sp.title,
            body=sp.body,
            starts_at=start,
            ends_at=start + timedelta(days=7),
            is_active=True,
            created_by=None,
            created_at=start - timedelta(days=2),
        )
        db.add(pr)
        prompts.append((pr, sp))
    db.flush()

    def open_prompt(at: datetime):
        for pr, sp in prompts:
            if pr.starts_at <= at < pr.ends_at:
                return pr, sp
        return None

    # ---- Dreamer
    names: list[str] = []
    pairs = [(a, b) for a in NICK_A for b in NICK_B]
    rng.shuffle(pairs)
    fixed = [
        "별빛여행자",
        "Cloud_Kid",
        "미래정원사",
        "rocket_mina",
        "느린거북",
        "voltage",
        "바다건너",
        "pixel_dream",
        "생각주머니",
        "하늘다람쥐",
    ]
    names = fixed + [f"{a}{b}" for a, b in pairs if f"{a}{b}" not in fixed][: N_USERS - len(fixed)]
    slugs = list(domains)
    sims: list[Sim] = []
    for i, nick in enumerate(names):
        if i < FIRST_FIXED:
            persona = "core" if i < 4 else "regular"
            days_ago = rng.uniform(DAYS - 6, DAYS - 0.5)
        else:
            persona = rng.choices([p for p, _ in PERSONA_MIX], weights=[w for _, w in PERSONA_MIX])[
                0
            ]
            # 최근일수록 가입이 많다 (서비스가 자라는 모양)
            days_ago = DAYS * (1 - math.sqrt(rng.random())) ** 1.0
            days_ago = min(DAYS - 7, max(0.3, days_ago))
        joined = (today - timedelta(days=days_ago)).astimezone(now.tzinfo)
        u = User(
            email=f"dreamer{i + 1:02d}@{demo_domain}",
            password_hash=pw_hash,
            nickname=nick[:20],
            bio=f"{nick}의 상상 노트",
            created_at=joined,
        )
        db.add(u)
        sims.append(Sim(u, persona, joined, joined, tuple(rng.sample(slugs, 2))))
    db.flush()

    # ---- 첫 주 경험 → 계속 남을지
    for i, s in enumerate(sims):
        post_p, _, _, w1_post, w1_follow, keep = PERSONA[s.persona]
        s.first_post = rng.random() < w1_post
        s.follow_w1 = rng.random() < w1_follow
        if s.first_post:
            first_at = s.joined + timedelta(hours=rng.uniform(1, 6 * 24))
            s.prompt_start = open_prompt(first_at) is not None and rng.random() < 0.6
            s.thunder_w1 = rng.random() < (
                0.5 + (0.2 if s.prompt_start else 0) + (0.2 if s.persona == "core" else 0)
            )
        if i < FIRST_FIXED:
            s.end = (
                now if i not in (5, 8) else now - timedelta(days=rng.uniform(15, 25))
            )  # 둘은 요즘 멈춤
            continue
        p = keep
        if s.first_post:
            p += 0.3 if s.thunder_w1 else -0.15
        p += 0.15 if s.prompt_start else 0
        p += 0.12 if s.follow_w1 else 0
        p = min(0.97, max(0.02, p))
        if s.persona == "ghost":
            s.end = s.joined + timedelta(hours=rng.uniform(0.1, 3))
        elif rng.random() < p:
            s.end = min(now, s.joined + timedelta(days=28 + rng.expovariate(1 / 60)))
        else:
            s.end = min(now, s.joined + timedelta(days=rng.uniform(1.5, 6.5)))

    # ---- 날마다: 접속 · 상상 쓰기 (반응은 글을 다 만든 뒤 글 쪽에서)
    items: list[tuple[Imagination, Topic, Sim, object]] = []  # (글, 주제, 작성자, 질문)

    def new_post(s: Sim, at: datetime, force_prompt: bool = False) -> None:
        po = open_prompt(at)
        answer = po is not None and (force_prompt or rng.random() < 0.35)
        days_ago = (now - at).total_seconds() / 86400
        if answer:
            t = topics[rng.choice(po[1].topics)]
        else:
            cand = [t for t in TOPICS if _trend(t, days_ago) > 0]
            w = [_trend(t, days_ago) * (2.2 if t.domain in s.fav else 1) for t in cand]
            t = rng.choices(cand, weights=w)[0]
        # 가끔은 인기 글 인용
        recent = [
            x
            for x in items
            if x[0].kind == "original"
            and x[2] is not s
            and at - timedelta(days=10) <= x[0].created_at < at
        ]
        if recent and not answer and rng.random() < 0.08:
            q = max(rng.sample(recent, min(5, len(recent))), key=lambda x: _trend(x[1], days_ago))
            item = Imagination(
                author_id=s.user.id,
                kind="quote",
                body=rng.choice(QUOTES),
                domain_id=q[0].domain_id,
                quoted_id=q[0].id,
                created_at=at,
                tagging_status="done",
            )
            db.add(item)
            db.flush()
            save_ai_tags(db, item, {"tech": [q[1].main], "desire": [q[1].desires[0]]})
            items.append((item, q[1], s, None))
            s.posts.append(item)
            return
        title, core = rng.choice(t.cores)
        desires = [t.desires[0] if rng.random() < 0.55 else rng.choice(t.desires)]
        if len(t.desires) > 1 and rng.random() < 0.35:
            desires.append(rng.choice([d for d in t.desires if d not in desires]))
        techs = [t.main] + [c for c in t.co if rng.random() < 0.38]
        item = Imagination(
            author_id=s.user.id,
            kind="original",
            title=title if rng.random() < 0.7 else None,
            body=rng.choice(PREFIXES) + core,
            desire=rng.choice(DESIRE_TEXT[desires[0]]) if rng.random() < 0.85 else None,
            domain_id=domains[t.domain],
            ai_assisted=rng.random() < 0.1,
            prompt_id=po[0].id if answer else None,
            created_at=at,
            tagging_status="done" if rng.random() > 0.02 else "pending",
        )
        db.add(item)
        db.flush()
        if item.tagging_status == "done":
            save_ai_tags(db, item, {"tech": techs, "desire": desires})
        items.append((item, t, s, po[1] if answer else None))
        s.posts.append(item)

    for d in range(DAYS + 1):
        day = origin + timedelta(days=d)
        weekend = day.weekday() >= 5
        for s in sims:
            day_end = day + timedelta(days=1)
            if s.end < day or s.joined >= day_end:
                continue
            post_p, visit_p, _, _, _, _ = PERSONA[s.persona]
            first_day = s.joined >= day
            in_w1 = day < s.joined + timedelta(days=7)
            if not (first_day or rng.random() < visit_p * (1.15 if weekend else 1)):
                continue
            s.visit_days.add(day.date())
            wants = rng.random() < post_p * (1.2 if weekend else 1)
            if in_w1 and not s.first_post:
                wants = False
            if in_w1 and s.first_post and not s.posts:  # 첫 주에 쓰기로 한 사람은 늦어도 6일째에
                wants = wants or rng.random() < 0.5 or day_end >= s.joined + timedelta(days=6)
            if wants:
                at = max(_at_hour(rng, day, POST_HOURS), s.joined + timedelta(minutes=30))
                if at < min(s.end, now):
                    new_post(s, at, force_prompt=s.prompt_start and not s.posts)
    db.flush()

    # ---- 반응 (글마다): Thunder 수 = 주제 공감 × 질문 공감 × 작성자 성향
    reactors = [s for s in sims if PERSONA[s.persona][2] > 0]
    follows: set[tuple[int, int]] = set()
    counts = {"thunders": 0, "comments": 0}

    def pick_reactor(at: datetime, exclude: Sim) -> Sim | None:
        live = [s for s in reactors if s is not exclude and s.alive(at)]
        if not live:
            return None
        return rng.choices(live, weights=[PERSONA[s.persona][2] for s in live])[0]

    def react_at(base: datetime, mean_h: float) -> datetime:
        delay = rng.expovariate(1 / mean_h)
        day = (
            (base + timedelta(hours=delay))
            .astimezone(KST)
            .replace(hour=0, minute=0, second=0, microsecond=0)
        )
        at = _at_hour(rng, day, REACT_HOURS)
        return at if at > base else base + timedelta(hours=delay)

    for item, t, author, sp in items:
        is_first = author.posts and author.posts[0] is item
        lam = 1.7 * t.appeal * (sp.appeal if sp else 1) * (1.3 if author.persona == "core" else 1)
        if item.kind == "quote":
            lam *= 0.6
        n = sum(1 for _ in range(12) if rng.random() < lam / 12)
        w1_end = author.joined + timedelta(days=7)
        if is_first and author.thunder_w1:
            n = max(n, 2)
        given: set[int] = set()
        for k in range(n):
            at = react_at(item.created_at, 6 if is_first and author.thunder_w1 and k < 2 else 30)
            if is_first and author.thunder_w1 is False and at < w1_end:
                at = w1_end + timedelta(hours=rng.uniform(2, 200))
            if at >= now:
                continue
            r = pick_reactor(at, author)
            if r is None or r.user.id in given:
                continue
            given.add(r.user.id)
            r.visit_days.add(at.astimezone(KST).date())
            db.add(Thunder(user_id=r.user.id, imagination_id=item.id, created_at=at))
            db.add(
                ReactionEvent(
                    user_id=r.user.id,
                    imagination_id=item.id,
                    type="thunder",
                    on=True,
                    created_at=at,
                )
            )
            counts["thunders"] += 1
            if rng.random() < 0.22:
                db.add(
                    Wave(
                        user_id=r.user.id,
                        imagination_id=item.id,
                        created_at=at + timedelta(minutes=2),
                    )
                )
                db.add(
                    ReactionEvent(
                        user_id=r.user.id,
                        imagination_id=item.id,
                        type="wave",
                        on=True,
                        created_at=at + timedelta(minutes=2),
                    )
                )
            if rng.random() < 0.25:
                db.add(
                    Bookmark(
                        user_id=r.user.id,
                        imagination_id=item.id,
                        created_at=at + timedelta(minutes=1),
                    )
                )
                db.add(
                    ReactionEvent(
                        user_id=r.user.id,
                        imagination_id=item.id,
                        type="bookmark",
                        on=True,
                        created_at=at + timedelta(minutes=1),
                    )
                )
            if rng.random() < 0.05 and (r.user.id, author.user.id) not in follows:
                follows.add((r.user.id, author.user.id))
                db.add(
                    Follow(
                        follower_id=r.user.id,
                        followee_id=author.user.id,
                        created_at=at + timedelta(minutes=3),
                    )
                )
        # 켰다 끈 Thunder (기록만)
        if rng.random() < 0.06:
            r = pick_reactor(item.created_at + timedelta(hours=3), author)
            if r is not None and r.user.id not in given:
                at = item.created_at + timedelta(hours=rng.uniform(1, 20))
                if at < now:
                    db.add(
                        ReactionEvent(
                            user_id=r.user.id,
                            imagination_id=item.id,
                            type="thunder",
                            on=True,
                            created_at=at,
                        )
                    )
                    db.add(
                        ReactionEvent(
                            user_id=r.user.id,
                            imagination_id=item.id,
                            type="thunder",
                            on=False,
                            created_at=at + timedelta(minutes=5),
                        )
                    )
        # 조회
        viewers: set[int] = set()
        for _ in range(rng.randint(0, 4)):
            r = pick_reactor(item.created_at + timedelta(hours=10), author)
            at = item.created_at + timedelta(hours=rng.uniform(0.5, 48))
            if r is not None and at < now and r.user.id not in viewers:
                viewers.add(r.user.id)
                db.add(ImaginationView(user_id=r.user.id, imagination_id=item.id, viewed_at=at))
        # 댓글 · 답글
        if item.kind == "original":
            for _ in range(sum(1 for _ in range(6) if rng.random() < 0.7 * t.appeal / 6)):
                at = react_at(item.created_at, 20)
                r = pick_reactor(at, author)
                if r is None or at >= now:
                    continue
                c = Imagination(
                    author_id=r.user.id,
                    kind="comment",
                    body=rng.choice(COMMENTS),
                    domain_id=item.domain_id,
                    parent_id=item.id,
                    root_id=item.id,
                    created_at=at,
                )
                db.add(c)
                counts["comments"] += 1
                if author.alive(at) and rng.random() < 0.45:
                    db.flush()
                    rat = at + timedelta(hours=rng.uniform(0.3, 12))
                    if rat < now:
                        db.add(
                            Imagination(
                                author_id=author.user.id,
                                kind="comment",
                                body=rng.choice(REPLIES),
                                domain_id=item.domain_id,
                                parent_id=c.id,
                                root_id=item.id,
                                created_at=rat,
                            )
                        )

    # ---- 첫 주 팔로우
    cores = [s for s in sims if s.persona == "core"]
    for s in sims:
        if not s.follow_w1 or s.persona == "ghost":
            continue
        for other in rng.sample(
            [c for c in cores if c is not s], min(rng.randint(1, 3), len(cores) - 1)
        ):
            if (s.user.id, other.user.id) in follows:
                continue
            at = s.joined + timedelta(hours=rng.uniform(0.5, 5 * 24))
            if at < min(s.end + timedelta(hours=1), now):
                follows.add((s.user.id, other.user.id))
                db.add(Follow(follower_id=s.user.id, followee_id=other.user.id, created_at=at))
    db.flush()

    # ---- Shake it: 혼합 글 · 실패 · 계보 2단계 이상 · 첫 주에 해 보는 신규 Dreamer
    blends: list[tuple[Imagination, Sim, set[str]]] = []
    techs_of = {item.id: {t.main} for item, t, _, _ in items}
    originals = [x for x in items if x[0].kind == "original"]
    shakers = [s for s in sims if s.persona in ("core", "regular") and s.posts]
    # 계획: 첫 주에 Shake it 을 해 보는 신규 Dreamer 일부 + 열심 · 꾸준 Dreamer 의 평소 혼합
    plans: list[tuple[Sim, bool]] = [
        (s, True)
        for s in sims
        if s.persona in ("core", "regular", "casual")
        and s.posts
        and s.posts[0].created_at < s.joined + timedelta(days=6)
        and rng.random() < 0.25
    ] + [(rng.choice(shakers), False) for _ in range(70)]
    for s, first_week in plans:
        own = [p for p in s.posts if p.kind == "original"]
        mine_blends = [b for b, o, _ in blends if o is s and b.status == "visible"]
        if first_week:
            if not own:
                continue
            mine = own[0]
            at = mine.created_at + timedelta(hours=rng.uniform(1, 30))
        else:
            if mine_blends and rng.random() < 0.3:  # 내 혼합 글을 다시 섞기 → 계보 2단계 이상
                mine = rng.choice(mine_blends)
            elif own:
                mine = rng.choice(own)
            else:
                continue
            at = max(mine.created_at, s.joined) + timedelta(hours=rng.uniform(2, 24 * 14))
        if at >= min(now, s.end):
            continue
        targets = [x for x in originals if x[2] is not s and x[0].created_at < at]
        if not targets:
            continue
        target = max(rng.sample(targets, min(6, len(targets))), key=lambda x: x[1].appeal)[0]
        failed = rng.random() < 0.13
        attempt = ShakeAttempt(
            user_id=s.user.id,
            target_id=target.id,
            mine_id=mine.id,
            selection_ms=int(rng.lognormvariate(math.log(9000), 0.6)),
            status="failed" if failed else "published",
            llm_model="seed-demo",
            error="샘플: AI 응답 실패" if failed else None,
            created_at=at,
        )
        db.add(attempt)
        if failed:
            continue
        tset = techs_of.get(target.id, set()) | techs_of.get(mine.id, set())
        blend = Imagination(
            author_id=s.user.id,
            kind="blend",
            title=f"{target.display_title[:18]} × {mine.display_title[:18]}",
            body=f"'{target.display_title}'와 '{mine.display_title}'를 섞어 봤어요. 두 상상이 한 도시에서 함께 일어난다면 어떨까요?",
            domain_id=target.domain_id,
            secondary_domain_id=mine.domain_id,
            ai_assisted=True,
            created_at=at + timedelta(seconds=20),
            tagging_status="done",
            status="deleted" if rng.random() < 0.1 else "visible",
        )
        db.add(blend)
        db.flush()
        attempt.published_id = blend.id
        db.add(ImaginationParent(child_id=blend.id, position=0, parent_id=target.id))
        db.add(ImaginationParent(child_id=blend.id, position=1, parent_id=mine.id))
        save_ai_tags(db, blend, {"tech": sorted(tset)[:3], "desire": ["새로운 경험"]})
        techs_of[blend.id] = tset
        blends.append((blend, s, tset))
        given = set()
        for _ in range(sum(1 for _ in range(8) if rng.random() < 1.3 / 8)):
            rat = react_at(blend.created_at, 24)
            r = pick_reactor(rat, s)
            if r is None or rat >= now or r.user.id in given:
                continue
            given.add(r.user.id)
            db.add(Thunder(user_id=r.user.id, imagination_id=blend.id, created_at=rat))
            db.add(
                ReactionEvent(
                    user_id=r.user.id,
                    imagination_id=blend.id,
                    type="thunder",
                    on=True,
                    created_at=rat,
                )
            )

    # ---- 하루 접속 기록 (활동한 날 + 접속만 한 날)
    for s in sims:
        for p in s.posts:
            s.visit_days.add(p.created_at.astimezone(KST).date())
        for day in s.visit_days:
            first = datetime(day.year, day.month, day.day, tzinfo=KST) + timedelta(
                hours=rng.choices(range(24), weights=POST_HOURS)[0]
            )
            first = max(first, s.joined)
            if first < now:
                db.add(UserVisit(user_id=s.user.id, day=day, first_at=first))
    db.flush()
    return {
        "users": len(sims),
        "posts": sum(1 for x in items),
        "prompts": len(prompts),
        "blends": len(blends),
        **counts,
    }
