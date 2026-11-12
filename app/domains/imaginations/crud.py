from datetime import datetime

from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.domains.imaginations.models import Imagination, ImaginationView
from app.domains.tags.models import Domain
from app.shared.time import now_utc


def get_domain_by_slug(db: Session, slug: str) -> Domain | None:
    return db.scalar(select(Domain).where(Domain.slug == slug))


def get_visible(db: Session, imagination_id: int) -> Imagination | None:
    item = db.get(Imagination, imagination_id)
    return item if item is not None and item.status == "visible" else None


def list_feed(
    db: Session,
    *,
    domain_id: int | None,
    after: tuple[datetime, int] | None,
    limit: int,
) -> list[Imagination]:
    """최신순 피드 (created_at, id 내림차순). 커서 다음부터 limit+1 개를 읽는다 (다음 페이지 확인용)."""
    q = select(Imagination).where(
        Imagination.status == "visible", Imagination.kind != "comment"
    )  # 댓글은 피드에 나오지 않는다
    if domain_id is not None:
        q = q.where(
            or_(Imagination.domain_id == domain_id, Imagination.secondary_domain_id == domain_id)
        )
    if after is not None:
        t, i = after
        q = q.where(
            or_(Imagination.created_at < t, (Imagination.created_at == t) & (Imagination.id < i))
        )
    q = q.order_by(Imagination.created_at.desc(), Imagination.id.desc()).limit(limit + 1)
    return list(db.scalars(q).unique())


def record_view(db: Session, *, user_id: int, imagination_id: int) -> None:
    stmt = insert(ImaginationView).values(
        user_id=user_id, imagination_id=imagination_id, viewed_at=now_utc()
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=[ImaginationView.user_id, ImaginationView.imagination_id],
        set_={"viewed_at": stmt.excluded.viewed_at},
    )
    db.execute(stmt)
