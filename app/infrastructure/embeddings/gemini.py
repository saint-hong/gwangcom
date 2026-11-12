"""Gemini 임베딩 (REST batchEmbedContents) — 2026-11-10 사용자 결정 (기획안 9-3장의 로컬 모델 대신).

- 모델 기본값 gemini-embedding-001 (사용자가 고른 text-embedding-004 는 Google 이 서비스를 끝내 404).
- outputDimensionality 로 768 차원으로 줄여 저장한다 (pgvector HNSW 색인은 2000 차원까지).
  줄인 벡터는 길이가 1 이 아니므로 직접 정규화한다.
- taskType=SEMANTIC_SIMILARITY: 상상끼리 비슷한지 비교하는 용도.
"""

import httpx2

from app.infrastructure.embeddings.base import EmbeddingError, normalize

BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
BATCH = 100  # 한 요청에 최대 100개


class GeminiEmbedder:
    name = "gemini"

    def __init__(self, api_key: str, model: str, dim: int, timeout: float) -> None:
        self.model = model
        self.dim = dim
        self._client = httpx2.Client(
            base_url=BASE_URL, timeout=timeout, headers={"x-goog-api-key": api_key}
        )

    def embed(self, texts: list[str]) -> list[list[float]]:
        out: list[list[float]] = []
        for i in range(0, len(texts), BATCH):
            chunk = texts[i : i + BATCH]
            body = {
                "requests": [
                    {
                        "model": f"models/{self.model}",
                        "content": {"parts": [{"text": t}]},
                        "taskType": "SEMANTIC_SIMILARITY",
                        "outputDimensionality": self.dim,
                    }
                    for t in chunk
                ]
            }
            try:
                res = self._client.post(f"/models/{self.model}:batchEmbedContents", json=body)
            except httpx2.HTTPError as e:
                raise EmbeddingError(f"Gemini 에 연결하지 못했어요: {e}") from e
            if res.status_code != 200:
                msg = res.json().get("error", {}).get("message", res.text)[:200]
                raise EmbeddingError(f"Gemini 임베딩 오류 ({res.status_code}): {msg}")
            vectors = [e["values"] for e in res.json()["embeddings"]]
            if any(len(v) != self.dim for v in vectors):
                raise EmbeddingError(f"차원이 {self.dim} 이 아니에요.")
            out.extend(normalize(v) for v in vectors)
        return out
