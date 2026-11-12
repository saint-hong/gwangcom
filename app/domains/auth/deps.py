"""인증 의존성 — 로그인 사용자 가져오기."""

from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.domains.auth.security import decode_access_token
from app.domains.users.models import User
from app.infrastructure.core.database import get_db
from app.shared.errors import forbidden, unauthorized

_bearer = HTTPBearer(auto_error=False)


def optional_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db: Annotated[Session, Depends(get_db)],
) -> User | None:
    """토큰이 없거나 틀리면 None (비로그인으로 본다)."""
    if creds is None:
        return None
    user_id = decode_access_token(creds.credentials)
    return db.get(User, user_id) if user_id is not None else None


def current_user(user: Annotated[User | None, Depends(optional_user)]) -> User:
    if user is None:
        raise unauthorized()
    return user


def admin_user(user: Annotated[User, Depends(current_user)]) -> User:
    if not user.is_admin:
        raise forbidden("admin_only", "운영자만 할 수 있어요.")
    return user
