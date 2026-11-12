"""app.infrastructure.core.config

환경 변수(.env) 기반 설정을 한 곳에서 관리한다.
- `.env` 또는 OS 환경 변수에서 값을 읽는다 (OS 환경 변수가 우선).
- `get_settings()` 는 캐시된 싱글톤을 돌려준다.

LLM · 임베딩 설정(기획안 v10 9-1 · 9-3장)은 Sprint 4 에서 추가했다.
  · 글 생성 = Claude(anthropic) · 임베딩 = Gemini. 테스트와 키 없는 개발은 fake (비용 0).
  · 로컬 sLLM(local) 실험은 추후 자체 LLM 논의와 함께 (2026-11-10 결정).
"""

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── 앱 ──
    app_env: Literal["dev", "test", "production"] = "dev"
    app_name: str = "Imagine"
    log_level: str = "INFO"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])

    # ── PostgreSQL ──
    database_url: str = "postgresql+psycopg://imagine:imagine_local_pw@localhost:5432/imagine_dev"
    test_database_url: str = (
        "postgresql+psycopg://imagine:imagine_local_pw@localhost:5432/imagine_test"
    )
    db_connect_timeout_seconds: int = 3

    # ── 인증 (Sprint 1, 기획안 v9 10장: PyJWT + bcrypt) ──
    jwt_secret: str = "dev-only-insecure-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7일

    # ── 업로드 이미지 (로컬 디스크) ──
    upload_dir: str = "data/uploads"
    upload_url_prefix: str = "/uploads"

    # ── Memgraph (Sprint 7) ──
    graph_enabled: bool = True
    graph_uri: str = "bolt://localhost:7687"

    # ── LLM (Sprint 4, 기획안 9-1장) — 서비스 코드는 기능 이름(tagging · shake · note_draft)만 넘긴다 ──
    llm_provider: Literal["anthropic", "fake"] = "fake"
    llm_model: str = "claude-haiku-5-5"
    llm_effort: Literal["low", "medium", "high"] = "low"  # Claude 추론 깊이 (낮을수록 빠르고 저렴)
    llm_tagging_provider: Literal["anthropic", "fake", ""] = ""
    llm_tagging_model: str = ""
    llm_shake_provider: Literal["anthropic", "fake", ""] = ""
    llm_shake_model: str = ""
    llm_note_provider: Literal["anthropic", "fake", ""] = ""
    llm_note_model: str = ""
    llm_similar_provider: Literal["anthropic", "fake", ""] = ""  # 비슷한 상상 리랭킹 (5-C)
    llm_similar_model: str = ""
    anthropic_api_key: SecretStr | None = None
    llm_daily_call_limit: int = 300  # 서비스 전체 하루 AI 호출 상한 (한국 시간 자정 기준)
    llm_timeout_seconds: float = 30
    llm_max_retries: int = 2
    llm_price_input_per_mtok: float = 0.10  # 예상 비용 계산용 (Haiku 5.5)
    llm_price_output_per_mtok: float = 0.50

    # ── 임베딩 (Sprint 4, 기획안 9-3장) ──
    embedding_provider: Literal["gemini", "fake"] = "fake"
    embedding_model: str = "gemini-embedding-001"
    embedding_dim: int = 768  # DB 칸 크기와 같아야 한다 (바꾸면 마이그레이션 + embed-all)
    gemini_api_key: SecretStr | None = None
    embedding_timeout_seconds: float = 30
    embedding_price_per_mtok: float = 0.15
    similar_threshold: float = 0.85  # 참고값: 리랭킹(5-C) 뒤로는 화면 필터로 쓰지 않는다
    similar_candidates: int = 20  # 리랭킹 1단계: 벡터로 가져올 후보 수
    similar_show: int = 5  # 상세 화면에 보여 줄 수

    @model_validator(mode="after")
    def _check_keys(self) -> "Settings":
        """제공자를 골랐는데 키가 없으면 시작할 때 바로 알려 준다 (기획안 9-1장)."""
        uses_anthropic = "anthropic" in {
            self.llm_provider,
            self.llm_tagging_provider,
            self.llm_shake_provider,
            self.llm_note_provider,
            self.llm_similar_provider,
        }
        if uses_anthropic and not self.anthropic_api_key:
            raise ValueError(
                "LLM 제공자가 anthropic 인데 ANTHROPIC_API_KEY 가 없습니다 (.env 확인)."
            )
        if self.embedding_provider == "gemini" and not self.gemini_api_key:
            raise ValueError(
                "EMBEDDING_PROVIDER 가 gemini 인데 GEMINI_API_KEY 가 없습니다 (.env 확인)."
            )
        return self

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def jwt_secret_is_default(self) -> bool:
        return self.jwt_secret == "dev-only-insecure-secret-change-me"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
