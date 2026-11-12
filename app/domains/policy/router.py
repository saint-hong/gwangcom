from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.domains.auth.deps import current_user
from app.domains.policy.schemas import LimitsOut
from app.domains.policy.service import get_effective_policy
from app.domains.users.models import User
from app.infrastructure.core.database import get_db

router = APIRouter(prefix="/api/me", tags=["policy"])


@router.get("/limits", response_model=LimitsOut)
def my_limits(
    user: Annotated[User, Depends(current_user)], db: Annotated[Session, Depends(get_db)]
):
    """내게 적용되는 최종 한도·권한 (글쓰기 화면의 "123 / 500" 표시 등에 쓴다)."""
    p = get_effective_policy(db, user)
    return LimitsOut(
        limits={
            k.removeprefix("limit."): int(v) for k, v in p.values.items() if k.startswith("limit.")
        },
        permissions={
            k.removeprefix("perm."): bool(v) for k, v in p.values.items() if k.startswith("perm.")
        },
        today={
            "posts_used": p.posts_today,
            "posts_remaining": p.posts_remaining,
            "shakes_remaining": p.shakes_remaining,
        },
    )
