"""상상 하나에 대해 "지금 할 수 있는 일"을 계산한다 (기획안 v9 8장 actions).

service 계층이 policy 결과를 넘겨 부른다. 화면 표시용이며, 서버는 요청마다 다시 검사한다.
"""

from app.domains.imaginations.models import Imagination
from app.domains.imaginations.schemas import Actions, ActionState
from app.domains.policy.service import EffectivePolicy
from app.domains.users.models import User

OK = ActionState(allowed=True)
LOGIN = ActionState(allowed=False, reason="login_required")
OWN = ActionState(allowed=False, reason="own_post")
NOT_ALLOWED = ActionState(allowed=False, reason="not_allowed")


def build_actions(item: Imagination, user: User | None, policy: EffectivePolicy) -> Actions:
    if user is None:
        return Actions(
            thunder=LOGIN,
            wave=LOGIN,
            quote=LOGIN,
            comment=LOGIN,
            shake=LOGIN,
            bookmark=LOGIN,
            delete=NOT_ALLOWED,
        )

    mine = item.author_id == user.id

    def perm(key: str, *, block_own: bool = False) -> ActionState:
        if block_own and mine:
            return OWN
        return OK if policy.can(key) else NOT_ALLOWED

    if item.kind == "comment":  # 댓글은 Shake it 재료가 아니다 (2026-11-11 결정)
        shake = ActionState(allowed=False, reason="not_material")
    elif mine:
        shake = OWN
    elif not item.shake_allowed:
        shake = ActionState(allowed=False, reason="shake_disabled")
    elif not policy.can("shake"):
        shake = NOT_ALLOWED
    elif policy.shakes_remaining <= 0:
        shake = ActionState(allowed=False, reason="daily_limit", remaining=0)
    else:
        shake = ActionState(allowed=True, remaining=policy.shakes_remaining)

    return Actions(
        thunder=OWN if mine else OK,
        wave=perm("wave", block_own=True),
        quote=perm("quote"),
        comment=perm("comment"),
        shake=shake,
        bookmark=OK,
        delete=OK if mine else NOT_ALLOWED,
    )
