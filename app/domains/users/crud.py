from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domains.users.models import User


def get_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(func.lower(User.email) == email.lower()))


def get_by_nickname(db: Session, nickname: str) -> User | None:
    return db.scalar(select(User).where(func.lower(User.nickname) == nickname.lower()))


def create(
    db: Session, *, email: str, password_hash: str, nickname: str, role: str = "user"
) -> User:
    user = User(email=email.lower(), password_hash=password_hash, nickname=nickname, role=role)
    db.add(user)
    db.flush()
    return user
