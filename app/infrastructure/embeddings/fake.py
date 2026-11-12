"""가짜 임베딩 — 테스트용 (비용 0, 네트워크 없음).

글자 2개 묶음(bigram)을 해시해서 벡터에 더한다 → 겹치는 글자가 많은 글끼리 비슷하게 나온다.
"""

import hashlib

from app.infrastructure.embeddings.base import normalize


class FakeEmbedder:
    name = "fake"

    def __init__(self, dim: int) -> None:
        self.model = "fake"
        self.dim = dim

    def embed(self, texts: list[str]) -> list[list[float]]:
        out = []
        for t in texts:
            v = [0.0] * self.dim
            s = "".join(t.split())
            for i in range(max(1, len(s) - 1)):
                h = int(hashlib.md5(s[i : i + 2].encode()).hexdigest(), 16)
                v[h % self.dim] += 1.0
            out.append(normalize(v))
        return out
