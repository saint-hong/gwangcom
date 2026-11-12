"""app.infrastructure.core.database

SQLAlchemy 2 엔진·세션과 ORM Base.
- 엔진은 처음 쓸 때 만든다 (import 만으로 DB 에 접속하지 않음).
- 테이블 생성·변경은 Alembic 마이그레이션으로만 한다 (DBeaver 로 직접 바꾸지 않음).
"""

from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.infrastructure.core.config import get_settings


class Base(DeclarativeBase):
    """모든 ORM 모델의 부모. Alembic autogenerate 는 Base.metadata 를 본다."""


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    settings = get_settings()
    return create_engine(
        settings.database_url,
        pool_pre_ping=True,
        connect_args={"connect_timeout": settings.db_connect_timeout_seconds},
    )


@lru_cache(maxsize=1)
def get_sessionmaker() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """FastAPI 의존성 — 요청마다 세션 하나."""
    session = get_sessionmaker()()
    try:
        yield session
    finally:
        session.close()


def check_database() -> bool:
    """DB 에 접속해 `SELECT 1` 이 되는지 확인한다 (헬스체크용)."""
    try:
        with get_engine().connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:  # noqa: BLE001 — 헬스체크는 어떤 실패든 '연결 안 됨'으로 본다
        return False
