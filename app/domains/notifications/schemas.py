from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.domains.imaginations.schemas import ImaginationOut
from app.domains.users.schemas import AuthorOut

NotificationType = Literal[
    "thunder", "wave", "quote", "comment", "reply", "follow", "shaken", "cited"
]


class NotificationOut(BaseModel):
    """알림 하나. item: thunder·wave = 반응을 받은 내 글 / comment·reply·quote = 새 글 / follow = 없음."""

    id: int
    type: NotificationType
    actor: AuthorOut | None
    item: ImaginationOut | None
    read: bool
    created_at: datetime


class NotificationsOut(BaseModel):
    items: list[NotificationOut]
    next_cursor: str | None


class UnreadOut(BaseModel):
    count: int
