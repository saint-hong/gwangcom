"""Shake it (기획안 v10 F8, Sprint 5-B) — 선택 창 목록 · 섞어서 게시.

흐름: 상대 글에서 Shake it → 내 상상 고르기 → [완료] → AI 혼합 → 출력 검사 → 자동 게시
- 재료: 원본 · 인용 · 혼합 (댓글은 재료가 아니다 — 2026-11-11 결정, v11 반영목록 3장)
- 혼합 글: kind=blend · 작성자 = 섞은 사람 · ai_assisted=True · 분야 = 상대 글, 두 번째 분야 = 내 글(다르면)
  재료 2개는 imagination_parents (0 = 상대 글, 1 = 내 글), 재료 글마다 child_count(Shake 수) +1
- 출력 검사(blend.problems)에 걸리면 한 번 다시 만든다. 그래도 안 되면 게시하지 않는다
- 실패하면 게시하지 않고 하루 횟수도 차감하지 않는다 (하루 횟수 = 오늘 published 시도 수)
- 모든 시도는 shake_attempts 에 남긴다 (분석: 누가 무엇과 무엇을 골랐나 · 고르는 데 걸린 시간)
"""

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.domains.imaginations import crud
from app.domains.imaginations.models import Imagination
from app.domains.imaginations.service import bump, present
from app.domains.policy.service import EffectivePolicy, get_effective_policy
from app.domains.shake.blend import problems, run_blend
from app.domains.shake.models import ImaginationParent, ShakeAttempt
from app.domains.shake.schemas import CandidatesOut, ShakeIn
from app.domains.users.models import User
from app.infrastructure.llm.providers.base import LlmError, LlmLimited
from app.infrastructure.llm.router import route
from app.shared.cursor import decode_cursor, encode_cursor
from app.shared.errors import AppError, bad_request, forbidden, not_found

MATERIAL_KINDS = ("original", "quote", "blend")
CANDIDATE_PAGE_SIZE = 20
MAX_TRIES = 2  # 출력 검사에 걸리면 한 번 더


def check_target(item: Imagination | None, user: User, policy: EffectivePolicy) -> Imagination:
    """상대 글로 섞을 수 있는지 (actions.shake 와 같은 규칙 — 서버는 요청마다 다시 검사한다)."""
    if item is None:
        raise not_found("섞을 상상을 찾을 수 없어요.")
    if item.kind not in MATERIAL_KINDS:
        raise forbidden("not_material", "댓글은 Shake it 재료로 쓸 수 없어요.")
    if item.author_id == user.id:
        raise forbidden("own_post", "내 상상끼리는 섞을 수 없어요.")
    if not item.shake_allowed:
        raise forbidden("shake_disabled", "작성자가 Shake it 을 막아 둔 상상이에요.")
    if not policy.can("shake"):
        raise forbidden("not_allowed", "지금은 Shake it 을 쓸 수 없어요.")
    if policy.shakes_remaining <= 0:
        raise AppError(
            429,
            "daily_limit",
            f"오늘 Shake 횟수({policy.limit('shake_daily')}번)를 다 썼어요. 내일 다시 섞어 봐요.",
        )
    return item


def candidates(db: Session, user: User, target_id: int, cursor: str | None) -> CandidatesOut:
    """선택 창: 상대 글 + 내가 올린 상상(원본 · 인용 · 혼합) 최신순."""
    policy = get_effective_policy(db, user)
    target = check_target(crud.get_visible(db, target_id), user, policy)
    q = select(Imagination).where(
        Imagination.author_id == user.id,
        Imagination.status == "visible",
        Imagination.kind.in_(MATERIAL_KINDS),
    )
    if cursor:
        t, i = decode_cursor(cursor)
        q = q.where(
            or_(Imagination.created_at < t, (Imagination.created_at == t) & (Imagination.id < i))
        )
    q = q.order_by(Imagination.created_at.desc(), Imagination.id.desc())
    rows = list(db.scalars(q.limit(CANDIDATE_PAGE_SIZE + 1)).unique())
    has_more = len(rows) > CANDIDATE_PAGE_SIZE
    rows = rows[:CANDIDATE_PAGE_SIZE]
    out = present(db, [target, *rows], user, policy)
    return CandidatesOut(
        target=out[0],
        items=out[1:],
        next_cursor=encode_cursor(rows[-1].created_at, rows[-1].id) if has_more and rows else None,
        remaining=policy.shakes_remaining,
        limit=policy.limit("shake_daily"),
    )


def _fail(db: Session, attempt: ShakeAttempt, error: str) -> None:
    attempt.status = "failed"
    attempt.error = error[:500]
    db.commit()


def shake(db: Session, user: User, data: ShakeIn):
    policy = get_effective_policy(db, user)
    target = check_target(crud.get_visible(db, data.target_id), user, policy)
    mine = crud.get_visible(db, data.mine_id)
    if mine is None or mine.author_id != user.id:
        raise bad_request("mine_required", "섞을 내 상상을 골라 주세요.")
    if mine.kind not in MATERIAL_KINDS:
        raise bad_request("not_material", "댓글은 Shake it 재료로 쓸 수 없어요.")

    attempt = ShakeAttempt(
        user_id=user.id,
        target_id=target.id,
        mine_id=mine.id,
        selection_ms=data.selection_ms,
        status="processing",
        llm_model=route("shake")[1],
    )
    db.add(attempt)
    db.commit()

    out: dict | None = None
    issues: list[str] = []
    try:
        for _ in range(MAX_TRIES):
            out = run_blend(db, target, mine)
            issues = problems(out)
            if not issues:
                break
    except LlmLimited as e:
        _fail(db, attempt, f"limited: {e}")
        raise AppError(503, "ai_limited", str(e)) from e
    except LlmError as e:
        _fail(db, attempt, f"llm: {e}")
        raise AppError(
            502, "shake_failed", "상상을 섞지 못했어요. 잠시 후 다시 시도해 주세요."
        ) from e
    if out is None or issues:
        _fail(db, attempt, "출력 검사: " + ", ".join(issues))
        raise AppError(502, "shake_failed", "상상을 섞지 못했어요. 다시 시도해 주세요.")

    blend = Imagination(
        author_id=user.id,
        kind="blend",
        title=out["title"].strip(),
        body=out["body"].strip(),
        desire=out["desire"].strip(),
        domain_id=target.domain_id,
        secondary_domain_id=mine.domain_id if mine.domain_id != target.domain_id else None,
        ai_assisted=True,
        shake_allowed=True,
    )
    db.add(blend)
    db.flush()
    db.add_all(
        [
            ImaginationParent(child_id=blend.id, position=0, parent_id=target.id),
            ImaginationParent(child_id=blend.id, position=1, parent_id=mine.id),
        ]
    )
    bump(db, target.id, "child_count", 1)
    bump(db, mine.id, "child_count", 1)
    attempt.status = "published"
    attempt.published_id = blend.id
    attempt.ai_elements = {"tech": out["merged_tech"], "desire": out["merged_desire"]}

    from app.domains.notifications.service import notify  # 순환 import 를 피해 여기서

    # "내 상상이 ○○님의 상상과 섞였어요" — 상대 글 작성자에게
    notify(db, user_id=target.author_id, actor_id=user.id, type="shaken", imagination_id=blend.id)
    db.commit()
    db.refresh(blend)
    policy.shakes_today += 1
    return present(db, [blend], user, policy)[0]
