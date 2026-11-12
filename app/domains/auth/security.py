"""비밀번호 해시(bcrypt) · JWT(PyJWT) — 기획안 v9 10장."""

from datetime import timedelta

import bcrypt
import jwt

from app.infrastructure.core.config import get_settings
from app.shared.time import now_utc

BCRYPT_MAX_BYTES = 72  # bcrypt 는 72바이트까지만 쓴다 → 가입 단계에서 막는다


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    raw = password.encode("utf-8")
    if len(raw) > BCRYPT_MAX_BYTES:
        return False
    try:
        return bcrypt.checkpw(raw, password_hash.encode("ascii"))
    except ValueError:
        return False


def create_access_token(user_id: int) -> str:
    s = get_settings()
    now = now_utc()
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(minutes=s.jwt_expire_minutes),
    }
    return jwt.encode(payload, s.jwt_secret, algorithm=s.jwt_algorithm)


def decode_access_token(token: str) -> int | None:
    """토큰이 올바르면 user_id, 아니면 None (만료·위조 모두)."""
    s = get_settings()
    try:
        payload = jwt.decode(
            token, s.jwt_secret, algorithms=[s.jwt_algorithm], options={"require": ["exp", "sub"]}
        )
        return int(payload["sub"])
    except (jwt.PyJWTError, ValueError):
        return None
