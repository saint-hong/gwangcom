"""임베딩 제공자 (기획안 v10 9-3장). 서비스 코드는 get_embedder() 만 쓴다."""

import math
from typing import Protocol


class EmbeddingError(Exception):
    pass


class Embedder(Protocol):
    name: str
    model: str
    dim: int

    def embed(self, texts: list[str]) -> list[list[float]]:
        """글 여러 개 → 길이 1 로 맞춘 벡터 여러 개 (같은 순서)."""
        ...


def normalize(v: list[float]) -> list[float]:
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]
