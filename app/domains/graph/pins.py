"""Observe Note 근거함 (2026-11-20 사용자 결정, v13 5장).

운영자가 탐색기에서 찾은 신호 · 원문을 담아 두고, 노트를 쓸 때 꺼내 본문에 넣는다.
AI 는 노트를 쓰지 않는다 (원칙 4). 근거함은 운영자마다 따로다.
"""

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.domains.graph.models import ExplorerPin
from app.domains.graph.schemas import PinIn, PinOut
from app.shared.errors import not_found

PINS_MAX = 200


def _out(p: ExplorerPin) -> PinOut:
    return PinOut(
        id=p.id,
        kind=p.kind,  # type: ignore[arg-type]
        title=p.title,
        summary=p.summary,
        stat=p.stat,
        ref=p.ref or {},
        created_at=p.created_at,
    )


def list_pins(db: Session, admin_id: int) -> list[PinOut]:
    rows = db.scalars(
        select(ExplorerPin)
        .where(ExplorerPin.admin_id == admin_id)
        .order_by(ExplorerPin.created_at.desc(), ExplorerPin.id.desc())
        .limit(PINS_MAX)
    )
    return [_out(p) for p in rows]


def add_pin(db: Session, admin_id: int, body: PinIn) -> PinOut:
    """같은 제목 · 종류가 이미 있으면 새로 만들지 않고 그것을 돌려준다 (두 번 눌러도 하나)."""
    same = db.scalar(
        select(ExplorerPin).where(
            ExplorerPin.admin_id == admin_id,
            ExplorerPin.kind == body.kind,
            ExplorerPin.title == body.title,
        )
    )
    if same:
        return _out(same)
    pin = ExplorerPin(
        admin_id=admin_id,
        kind=body.kind,
        title=body.title,
        summary=body.summary,
        stat=body.stat,
        ref=body.ref,
    )
    db.add(pin)
    db.commit()
    db.refresh(pin)
    return _out(pin)


def remove_pin(db: Session, admin_id: int, pin_id: int) -> None:
    pin = db.get(ExplorerPin, pin_id)
    if pin is None or pin.admin_id != admin_id:
        raise not_found("근거함에 없는 항목이에요.")
    db.delete(pin)
    db.commit()


def clear_pins(db: Session, admin_id: int) -> None:
    db.execute(delete(ExplorerPin).where(ExplorerPin.admin_id == admin_id))
    db.commit()
