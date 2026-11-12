"""임베딩 제공자 고르기 — .env EMBEDDING_PROVIDER (gemini | fake)."""

from functools import lru_cache

from app.infrastructure.core.config import get_settings
from app.infrastructure.embeddings.base import Embedder


@lru_cache(maxsize=1)
def get_embedder() -> Embedder:
    s = get_settings()
    if s.embedding_provider == "gemini":
        from app.infrastructure.embeddings.gemini import GeminiEmbedder

        assert s.gemini_api_key is not None
        return GeminiEmbedder(
            s.gemini_api_key.get_secret_value(),
            s.embedding_model,
            s.embedding_dim,
            s.embedding_timeout_seconds,
        )
    from app.infrastructure.embeddings.fake import FakeEmbedder

    return FakeEmbedder(s.embedding_dim)
