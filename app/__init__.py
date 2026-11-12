"""Imagine 백엔드 — 상상 플랫폼 API.

4계층 구조 (Insurance-Helper-v4 기준):
    domains/         비즈니스 도메인 (router → service → crud → models/schemas)
    infrastructure/  외부 시스템·기반 (설정, DB, LLM, 그래프, 임베딩, 저장소)
    shared/          횡단 관심사
    interfaces/      진입점 (CLI)
"""

__version__ = "0.1.0"
