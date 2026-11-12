import re

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.domains.auth.security import BCRYPT_MAX_BYTES
from app.domains.users.schemas import MeOut

# 프로필 주소(/@닉네임)에 쓰이므로 글자 종류를 제한한다
NICKNAME_RE = re.compile(r"^[0-9A-Za-z가-힣_]{2,20}$")
# 화면 경로와 겹치거나 운영자로 오해할 수 있는 이름
RESERVED_NICKNAMES = {
    "me",
    "admin",
    "imagine",
    "operator",
    "운영자",
    "settings",
    "login",
    "signup",
    "write",
    "notes",
    "library",
    "notifications",
    "trending",
    "topics",
    "feedback",
}


def check_nickname(v: str) -> str:
    """닉네임 규칙 — 가입과 프로필 수정에서 같이 쓴다. 맞지 않으면 ValueError."""
    v = v.strip()
    if not NICKNAME_RE.match(v):
        raise ValueError("닉네임은 한글·영문·숫자·밑줄(_)로 2~20자예요.")
    if v.lower() in RESERVED_NICKNAMES:
        raise ValueError("쓸 수 없는 닉네임이에요.")
    return v


def check_password(v: str) -> str:
    if len(v) < 8:
        raise ValueError("비밀번호는 8자 이상이에요.")
    if len(v) > 64 or len(v.encode("utf-8")) > BCRYPT_MAX_BYTES:
        raise ValueError("비밀번호가 너무 길어요.")
    return v


class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=64)
    nickname: str

    @field_validator("password")
    @classmethod
    def _password_bytes(cls, v: str) -> str:
        if len(v.encode("utf-8")) > BCRYPT_MAX_BYTES:
            raise ValueError("비밀번호가 너무 길어요.")
        return v

    @field_validator("nickname")
    @classmethod
    def _nickname(cls, v: str) -> str:
        return check_nickname(v)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: MeOut
