"""Imagine 관리 명령 (기획안 v9 11장 interfaces/cli).

uv run python -m app.interfaces.cli create-admin --email admin@example.com --nickname 운영자1
uv run python -m app.interfaces.cli seed-demo            # 샘플 Dreamer 10명 · 상상 50개 + 반응·댓글·인용
uv run python -m app.interfaces.cli seed-demo --reset    # 샘플 데이터를 지우고 다시 넣기
uv run python -m app.interfaces.cli embed-all [--force]  # 원본·인용 임베딩 (Sprint 4)
uv run python -m app.interfaces.cli tag-all [--pending-only]  # 태깅 안 된 글 태깅 (Sprint 5)
uv run python -m app.interfaces.cli similar --id 12 [--rerank]  # 벡터 후보 + 저장된 리랭킹 결과
uv run python -m app.interfaces.cli similar-all [--force]     # 비슷한 상상 리랭킹 (Sprint 5-C)
uv run python -m app.interfaces.cli ai-eval              # 모델 실측: 태깅 20 · Shake 10 · 유사도 분포 (비용 발생)
"""

import argparse
import getpass
import random
import sys
from datetime import timedelta

from sqlalchemy import delete, select, text

from app.domains.auth.schemas import SignupIn
from app.domains.auth.security import hash_password
from app.domains.imaginations.models import Imagination, ImaginationView
from app.domains.reactions.models import Bookmark, ReactionEvent, Thunder, Wave
from app.domains.tags.models import Domain
from app.domains.users import crud as users_crud
from app.domains.users.models import Follow, User
from app.infrastructure.core import model_registry  # noqa: F401 — 모든 모델 등록 (FK 해석)
from app.infrastructure.core.database import get_sessionmaker
from app.interfaces.cli.seed_data import COMMENTS, DREAMERS, IMAGINATIONS, QUOTES, REPLIES
from app.shared.time import now_utc

DEMO_EMAIL_DOMAIN = "demo.example.com"  # example.com 은 예시용으로 예약된 주소 (실제 메일 없음)
DEMO_PASSWORD = "imagine1234"


def create_admin(args: argparse.Namespace) -> int:
    password = args.password or getpass.getpass("운영자 비밀번호 (8자 이상): ")
    try:
        data = SignupIn(email=args.email, password=password, nickname=args.nickname)
    except ValueError as exc:
        print(f"입력값을 확인해 주세요:\n{exc}", file=sys.stderr)
        return 1
    with get_sessionmaker()() as db:
        existing = users_crud.get_by_email(db, data.email)
        if existing is not None:
            existing.role = "admin"
            db.commit()
            print(f"이미 있는 계정을 운영자로 바꿨어요: {existing.email} ({existing.nickname})")
            return 0
        if users_crud.get_by_nickname(db, data.nickname):
            print("이미 쓰고 있는 닉네임이에요.", file=sys.stderr)
            return 1
        user = users_crud.create(
            db,
            email=data.email,
            password_hash=hash_password(data.password),
            nickname=data.nickname,
            role="admin",
        )
        db.commit()
        print(f"운영자 계정을 만들었어요: {user.email} ({user.nickname})")
    return 0


def seed_demo(args: argparse.Namespace) -> int:
    rng = random.Random(20261110)  # 매번 같은 결과
    with get_sessionmaker()() as db:
        demo_users = select(User.id).where(User.email.like(f"%@{DEMO_EMAIL_DOMAIN}"))
        if db.scalar(select(User.id).where(User.id.in_(demo_users)).limit(1)):
            if not args.reset:
                print("샘플 데이터가 이미 있어요. 다시 넣으려면 --reset 을 붙이세요.")
                return 0
            db.execute(delete(User).where(User.id.in_(demo_users)))  # 상상도 함께 지워진다
            db.commit()

        domains = {d.slug: d.id for d in db.scalars(select(Domain))}
        pw_hash = hash_password(DEMO_PASSWORD)  # 같은 비밀번호라 한 번만 계산
        users = []
        for i, nickname in enumerate(DREAMERS, start=1):
            u = User(
                email=f"dreamer{i:02d}@{DEMO_EMAIL_DOMAIN}",
                password_hash=pw_hash,
                nickname=nickname,
                bio=f"{nickname}의 상상 노트",
            )
            db.add(u)
            users.append(u)
        db.flush()

        now = now_utc()
        items = []
        for n, (slug, title, body, desire) in enumerate(IMAGINATIONS):
            item = Imagination(
                author_id=users[n % len(users)].id,
                title=title,
                body=body,
                desire=desire,
                domain_id=domains[slug],
                ai_assisted=rng.random() < 0.15,
                created_at=now - timedelta(minutes=rng.randint(10, 14 * 24 * 60)),
            )
            db.add(item)
            items.append(item)
        db.flush()
        _seed_activity(db, rng, users, items, now)
        db.commit()
        print(
            f"샘플 Dreamer {len(users)}명 · 상상 {len(IMAGINATIONS)}개 + 반응·댓글·인용·팔로우·알림을 넣었어요.\n"
            f"로그인: dreamer01@{DEMO_EMAIL_DOMAIN} / {DEMO_PASSWORD} (01~10)"
        )
    return 0


def _after(rng: random.Random, start, now):
    """start 와 지금 사이의 무작위 시각."""
    span = max(60, int((now - start).total_seconds()))
    return start + timedelta(seconds=rng.randint(30, span))


def _seed_activity(db, rng: random.Random, users, items, now) -> None:
    """Sprint 2 샘플 활동: Thunder · Wave · 북마크 · 조회 · 댓글·답글 · 인용. 수 캐시는 마지막에 다시 센다."""
    for u in users:
        others = [i for i in items if i.author_id != u.id]
        for model, k in ((Thunder, 12), (Wave, 3), (Bookmark, 4)):
            for it in rng.sample(others, k):
                at = _after(rng, it.created_at, now)
                db.add(model(user_id=u.id, imagination_id=it.id, created_at=at))
                kind = model.__tablename__.rstrip("s")
                db.add(
                    ReactionEvent(
                        user_id=u.id, imagination_id=it.id, type=kind, on=True, created_at=at
                    )
                )
        for it in rng.sample(items, 8):
            db.add(
                ImaginationView(
                    user_id=u.id, imagination_id=it.id, viewed_at=_after(rng, it.created_at, now)
                )
            )

    comments = []
    for it in rng.sample(items, 25):
        for _ in range(rng.randint(1, 3)):
            author = rng.choice([u for u in users if u.id != it.author_id])
            c = Imagination(
                author_id=author.id,
                kind="comment",
                body=rng.choice(COMMENTS),
                domain_id=it.domain_id,
                parent_id=it.id,
                root_id=it.id,
                created_at=_after(rng, it.created_at, now),
            )
            db.add(c)
            comments.append((c, it))
    db.flush()
    for c, it in rng.sample(comments, 15):  # 상상 작성자의 답글
        db.add(
            Imagination(
                author_id=it.author_id,
                kind="comment",
                body=rng.choice(REPLIES),
                domain_id=it.domain_id,
                parent_id=c.id,
                root_id=it.id,
                created_at=_after(rng, c.created_at, now),
            )
        )
    for c, _ in rng.sample(comments, 12):  # 댓글에도 Thunder
        u = rng.choice([u for u in users if u.id != c.author_id])
        db.add(
            Thunder(user_id=u.id, imagination_id=c.id, created_at=_after(rng, c.created_at, now))
        )

    for body, it in zip(QUOTES, rng.sample(items, len(QUOTES)), strict=True):
        author = rng.choice([u for u in users if u.id != it.author_id])
        db.add(
            Imagination(
                author_id=author.id,
                kind="quote",
                body=body,
                domain_id=it.domain_id,
                quoted_id=it.id,
                created_at=_after(rng, it.created_at, now),
            )
        )
    for u in users:  # Sprint 3: 서로 팔로우 (4명씩)
        for other in rng.sample([o for o in users if o.id != u.id], 4):
            db.add(
                Follow(
                    follower_id=u.id,
                    followee_id=other.id,
                    created_at=now - timedelta(days=rng.randint(1, 13)),
                )
            )
    db.flush()
    _seed_notifications(db, [u.id for u in users])
    db.execute(
        text(
            """
            UPDATE imaginations i SET
              thunder_count  = (SELECT count(*) FROM thunders t WHERE t.imagination_id = i.id),
              wave_count     = (SELECT count(*) FROM waves w WHERE w.imagination_id = i.id),
              bookmark_count = (SELECT count(*) FROM bookmarks b WHERE b.imagination_id = i.id),
              quote_count    = (SELECT count(*) FROM imaginations q
                                WHERE q.quoted_id = i.id AND q.status = 'visible'),
              comment_count  = CASE WHEN i.kind = 'comment'
                THEN (SELECT count(*) FROM imaginations r
                      WHERE r.parent_id = i.id AND r.status = 'visible')
                ELSE (SELECT count(*) FROM imaginations r
                      WHERE r.root_id = i.id AND r.status = 'visible') END
            WHERE i.author_id = ANY(:ids)
            """
        ),
        {"ids": [u.id for u in users]},
    )


def _seed_notifications(db, user_ids: list[int]) -> None:
    """샘플 활동에서 알림을 만든다 (반응·인용·댓글·답글·팔로우). 나에게 온 것은 빼고, 3일 지난 것은 읽음."""
    db.execute(
        text(
            """
            INSERT INTO notifications (user_id, type, actor_id, imagination_id, created_at, read_at)
            SELECT user_id, type, actor_id, imagination_id, at,
                   CASE WHEN at < now() - interval '3 days' THEN at END
            FROM (
              SELECT i.author_id AS user_id, 'thunder' AS type, t.user_id AS actor_id,
                     i.id AS imagination_id, t.created_at AS at
                FROM thunders t JOIN imaginations i ON i.id = t.imagination_id
              UNION ALL
              SELECT i.author_id, 'wave', w.user_id, i.id, w.created_at
                FROM waves w JOIN imaginations i ON i.id = w.imagination_id
              UNION ALL
              SELECT o.author_id, 'quote', q.author_id, q.id, q.created_at
                FROM imaginations q JOIN imaginations o ON o.id = q.quoted_id
              UNION ALL
              SELECT p.author_id, CASE WHEN p.kind = 'comment' THEN 'reply' ELSE 'comment' END,
                     c.author_id, c.id, c.created_at
                FROM imaginations c JOIN imaginations p ON p.id = c.parent_id
               WHERE c.kind = 'comment'
              UNION ALL
              SELECT f.followee_id, 'follow', f.follower_id, NULL, f.created_at FROM follows f
            ) n
            WHERE user_id <> actor_id AND user_id = ANY(:ids)
            """
        ),
        {"ids": user_ids},
    )


def embed_all_cmd(args: argparse.Namespace) -> int:
    from app.domains.similar.service import embed_all
    from app.infrastructure.embeddings import get_embedder

    e = get_embedder()
    with get_sessionmaker()() as db:
        n = embed_all(db, force=args.force)
    print(f"임베딩 {n}개 저장 (제공자 {e.name} · 모델 {e.model} · {e.dim}차원)")
    return 0


def tag_all_cmd(args: argparse.Namespace) -> int:
    from app.domains.tags.service import tag_all
    from app.infrastructure.llm.router import route

    provider, model = route("tagging")
    with get_sessionmaker()() as db:
        ok, total = tag_all(db, include_failed=not args.pending_only)
    print(f"태깅 {ok}/{total}개 완료 (제공자 {provider} · 모델 {model})")
    if ok < total:
        print("남은 글은 실패했거나 하루 AI 한도에 걸렸어요. 나중에 다시 실행하세요.")
    return 0


def similar_cmd(args: argparse.Namespace) -> int:
    from app.domains.similar.models import SimilarLink, SimilarSet
    from app.domains.similar.rerank import compute_similar
    from app.domains.similar.service import find_similar

    with get_sessionmaker()() as db:
        base = db.get(Imagination, args.id)
        if base is None:
            print("상상을 찾을 수 없어요.", file=sys.stderr)
            return 1
        print(f"[{base.id}] {base.display_title}")
        print("  · 1단계 벡터 후보")
        for s in find_similar(db, args.id, args.limit):
            print(f"    {s.score:.3f}  [{s.item.id}] {s.item.display_title}")
        if args.rerank:
            compute_similar(db, base)
        saved = db.get(SimilarSet, args.id)
        if saved is None:
            print("  · 저장된 결과 없음 (--rerank 로 계산)")
            return 0
        print(f"  · 저장된 결과 ({saved.method}, 후보 {saved.candidate_count}개)")
        for link in db.scalars(
            select(SimilarLink)
            .where(SimilarLink.imagination_id == args.id)
            .order_by(SimilarLink.rank)
        ):
            title = db.get(Imagination, link.similar_id).display_title
            print(
                f"    {link.rank}. {link.score:.3f}  [{link.similar_id}] {title} — {link.reason or ''}"
            )
    return 0


def similar_all_cmd(args: argparse.Namespace) -> int:
    from app.domains.similar.rerank import compute_all

    with get_sessionmaker()() as db:
        counts = compute_all(db, force=args.force)
    print(f"비슷한 상상 계산: 리랭킹 {counts['rerank']}개 · 벡터만 {counts['vector']}개")
    if counts["vector"]:
        print(
            "벡터만 저장된 글은 AI 호출이 실패했거나 하루 한도에 걸린 글이에요. 나중에 다시 실행하세요."
        )
    return 0


def ai_eval_cmd(args: argparse.Namespace) -> int:
    from app.interfaces.cli.ai_eval import run

    return run(tagging_n=args.tagging, pairs_n=args.pairs, similar_n=args.similar)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.interfaces.cli", description="Imagine 관리 명령"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser(
        "create-admin", help="운영자 계정 만들기 (이미 있는 이메일이면 운영자로 변경)"
    )
    p.add_argument("--email", required=True)
    p.add_argument("--nickname", required=True)
    p.add_argument("--password", help="생략하면 입력 창으로 물어본다")
    p.set_defaults(func=create_admin)

    p = sub.add_parser("seed-demo", help="샘플 Dreamer 10명 · 상상 50개 + 반응·댓글·인용 넣기")
    p.add_argument("--reset", action="store_true", help="기존 샘플 데이터를 지우고 다시 넣기")
    p.set_defaults(func=seed_demo)

    p = sub.add_parser("embed-all", help="원본·인용 상상 임베딩 (없는 것만, --force 면 전부)")
    p.add_argument("--force", action="store_true")
    p.set_defaults(func=embed_all_cmd)

    p = sub.add_parser(
        "tag-all", help="태깅 안 된 원본·인용·혼합 태깅 (실패한 글 포함) — 실제 API 면 비용이 든다"
    )
    p.add_argument("--pending-only", action="store_true", help="실패한 글은 빼고 처음인 글만")
    p.set_defaults(func=tag_all_cmd)

    p = sub.add_parser("similar", help="비슷한 상상 보기")
    p.add_argument("--id", type=int, required=True)
    p.add_argument("--limit", type=int, default=5)
    p.add_argument("--rerank", action="store_true", help="지금 리랭킹해서 저장 (실제 API 면 비용)")
    p.set_defaults(func=similar_cmd)

    p = sub.add_parser(
        "similar-all",
        help="비슷한 상상 리랭킹 (안 했거나 벡터만 저장된 글, --force 면 전부) — 실제 API 면 비용",
    )
    p.add_argument("--force", action="store_true")
    p.set_defaults(func=similar_all_cmd)

    p = sub.add_parser(
        "ai-eval", help="모델 실측 (태깅 · Shake · 유사도) — 실제 API 를 호출해 비용이 든다"
    )
    p.add_argument("--tagging", type=int, default=20)
    p.add_argument("--pairs", type=int, default=10)
    p.add_argument("--similar", type=int, default=5)
    p.set_defaults(func=ai_eval_cmd)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
