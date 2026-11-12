from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.domains.auth.deps import current_user
from app.domains.notifications import service
from app.domains.notifications.schemas import NotificationsOut, UnreadOut
from app.domains.users.models import User
from app.infrastructure.core.database import get_db

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

DB = Annotated[Session, Depends(get_db)]
Me = Annotated[User, Depends(current_user)]


@router.get("", response_model=NotificationsOut)
def list_notifications(
    db: DB,
    user: Me,
    tab: Annotated[service.NotificationTab, Query()] = "all",
    cursor: Annotated[str | None, Query(description="이전 응답의 next_cursor")] = None,
):
    """알림 [전체 | 댓글], 최신순 20개씩."""
    return service.list_for(db, user, tab, cursor)


@router.get("/unread-count", response_model=UnreadOut)
def unread_count(db: DB, user: Me):
    """사이드바 종 배지용 안 읽은 수 (화면이 60초마다 묻는다)."""
    return UnreadOut(count=service.unread_count(db, user))


@router.post("/read", status_code=204)
def mark_read(db: DB, user: Me):
    """모두 읽음으로 (알림 화면을 열면 부른다)."""
    service.mark_all_read(db, user)
