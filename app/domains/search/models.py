"""search 모델 — 검색 기록 (Sprint 7 홈 검색, 2026-11-19 사용자 결정).

사람들이 무엇을 찾는지는 욕망의 신호다 (제품 원칙 2: UI 가 곧 데이터 수집 장치).
검색 결과의 첫 페이지를 볼 때마다 한 줄 남긴다 (다음 페이지를 이어 볼 때는 남기지 않는다).
"""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.core.database import Base


class SearchLog(Base):
    __tablename__ = "search_logs"
    __table_args__ = (
        Index("ix_search_logs_created", "created_at"),
        Index("ix_search_logs_norm", "norm", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    # 로그인하지 않은 방문자는 null. 탈퇴해도 "무엇을 찾았나" 기록은 남긴다
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    query: Mapped[str] = mapped_column(String(50))  # 입력한 그대로 (앞뒤 빈칸 정리)
    norm: Mapped[str] = mapped_column(String(50))  # 묶어 세는 용: 띄어쓰기 없앰 · 영문 소문자
    tab: Mapped[str] = mapped_column(String(12))  # imaginations | topics | dreamers
    result_count: Mapped[int] = mapped_column(Integer)  # 찾은 수 (0 = 찾는 것이 없었다)
    meaning_count: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0"
    )  # 그중 글자는 다르지만 뜻이 비슷해서 찾은 상상 수
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
