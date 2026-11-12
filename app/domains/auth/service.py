from sqlalchemy.orm import Session

from app.domains.auth.schemas import LoginIn, SignupIn, TokenOut
from app.domains.auth.security import create_access_token, hash_password, verify_password
from app.domains.users import crud as users_crud
from app.domains.users.models import User
from app.domains.users.schemas import me_out
from app.shared.errors import AppError, conflict


def _token_for(user: User) -> TokenOut:
    return TokenOut(access_token=create_access_token(user.id), user=me_out(user))


def signup(db: Session, data: SignupIn) -> TokenOut:
    if users_crud.get_by_email(db, data.email):
        raise conflict("email_taken", "이미 가입한 이메일이에요.")
    if users_crud.get_by_nickname(db, data.nickname):
        raise conflict("nickname_taken", "이미 쓰고 있는 닉네임이에요.")
    user = users_crud.create(
        db, email=data.email, password_hash=hash_password(data.password), nickname=data.nickname
    )
    db.commit()
    db.refresh(user)
    return _token_for(user)


def login(db: Session, data: LoginIn) -> TokenOut:
    user = users_crud.get_by_email(db, data.email)
    if user is None or not verify_password(data.password, user.password_hash):
        # 이메일이 있는지 없는지 알려 주지 않는다
        raise AppError(401, "invalid_credentials", "이메일 또는 비밀번호가 맞지 않아요.")
    return _token_for(user)
