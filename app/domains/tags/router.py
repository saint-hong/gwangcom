from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domains.tags.models import Domain
from app.infrastructure.core.database import get_db

router = APIRouter(prefix="/api", tags=["domains"])


class DomainOut(BaseModel):
    slug: str
    name: str


@router.get("/domains", response_model=list[DomainOut])
def list_domains(db: Annotated[Session, Depends(get_db)]):
    """분야 8개 (고정 목록, 시드)."""
    return [
        DomainOut(slug=d.slug, name=d.name)
        for d in db.scalars(select(Domain).order_by(Domain.sort_order))
    ]
