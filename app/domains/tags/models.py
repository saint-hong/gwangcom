"""tags 모델 — 분야 · 태그 (기획안 v10 7장 domains · tags · imagination_tags).

태그 정규화 (2026-11-11 사용자 결정, v11 반영목록 3장)
- label = 화면 표기: NFC · 앞의 # 제거 · 띄어쓰기는 한 칸으로 · 대소문자 유지 · 처음 저장된 모양
          최대 글자 수: 기술 20 · 욕망 40 (욕망은 문장이어도 받는다 — 분석 때 한 번 더 정제)
- name  = 비교용 값: label 에서 띄어쓰기를 모두 없애고 영문 소문자 ("자율 주행" = "자율주행")
- 비슷한 말 묶기(전기차 = EV)는 하지 않는다 → 운영자 기능(Sprint 6)

화면에 보이는 것 (2026-11-12 사용자 결정, Sprint 5-D)
- 기술 태그만 보인다. 욕망 태그는 분석용으로 DB 에만 저장한다
- 작성자는 기술 태그를 추가 · 삭제할 수 있다 (limit.tag_count, 기본 5). 지운 태그는 removed_at 으로 남긴다
"""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.core.database import Base


class Domain(Base):
    __tablename__ = "domains"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String(40), unique=True)
    slug: Mapped[str] = mapped_column(String(40), unique=True)
    sort_order: Mapped[int] = mapped_column(SmallInteger)


class Tag(Base):
    __tablename__ = "tags"
    __table_args__ = (
        UniqueConstraint("name", "type", name="uq_tags_name_type"),
        CheckConstraint("type IN ('tech', 'desire')", name="ck_tags_type"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String(40))
    label: Mapped[str] = mapped_column(String(40))
    type: Mapped[str] = mapped_column(String(10))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ImaginationTag(Base):
    __tablename__ = "imagination_tags"
    __table_args__ = (
        CheckConstraint("source IN ('ai', 'user')", name="ck_imagination_tags_source"),
        Index("ix_imagination_tags_tag", "tag_id", "imagination_id"),
    )

    imagination_id: Mapped[int] = mapped_column(
        ForeignKey("imaginations.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[int] = mapped_column(ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True)
    source: Mapped[str] = mapped_column(String(10))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # 작성자가 지운 태그 (행은 남겨 분석에 쓴다, 2026-11-12). 화면 · 집계는 None 인 것만
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    tag: Mapped[Tag] = relationship(lazy="joined")
