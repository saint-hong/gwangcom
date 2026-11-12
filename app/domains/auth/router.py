from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.domains.auth import service
from app.domains.auth.deps import current_user
from app.domains.auth.schemas import LoginIn, SignupIn, TokenOut
from app.domains.users.models import User
from app.domains.users.schemas import MeOut, me_out
from app.infrastructure.core.database import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/signup", response_model=TokenOut, status_code=201)
def signup(data: SignupIn, db: Annotated[Session, Depends(get_db)]):
    """가입하면 바로 로그인 상태(토큰)를 돌려준다. 가입하면 누구나 상상을 쓸 수 있다."""
    return service.signup(db, data)


@router.post("/login", response_model=TokenOut)
def login(data: LoginIn, db: Annotated[Session, Depends(get_db)]):
    return service.login(db, data)


@router.get("/me", response_model=MeOut)
def me(user: Annotated[User, Depends(current_user)]):
    return me_out(user)
