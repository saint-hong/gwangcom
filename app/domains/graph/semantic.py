"""탐색기 계산 재료 — 의미 지도 좌표 · 욕망 묶음 (2026-11-20 사용자 결정, v13 5장).

모두 계산 규칙이다 (AI 판단 없음, 원칙 4). AI 는 임베딩(글 → 숫자 벡터)만 만든다.

의미 지도 좌표
  상상 임베딩(768 차원)을 평면 두 좌표로 줄인다. 뜻이 가까운 상상이 가까이 놓인다.
  방법 두 가지를 모두 계산해 두고 화면 설정에서 고른다 (2026-11-20 사용자):
    · t-SNE (scikit-learn): 가까운 이웃 관계를 잘 지킨다. 덩어리가 또렷하다
    · UMAP (umap-learn): 가까운 관계 + 덩어리 사이 거리도 어느 정도 지킨다
  같은 재료면 같은 좌표가 나오게 random_state 를 고정한다. 좌표는 0~1 로 맞춘다.
  `graph-build` 때 한 번 계산해 Memgraph 상상 점에 넣는다 (새 글은 다음 다시 만들기 때 지도에 들어간다).

욕망 묶음
  욕망 태그 이름의 임베딩(tag_embeddings, CLI embed-tags)이 코사인 DESIRE_CLUSTER_MIN(0.88) 이상이면 한 묶음.
  많이 쓰인 태그부터 대표가 되고, 다음 태그는 대표와 가장 가까운 묶음에 들어간다 (가장 가까워도 기준 아래면 새 묶음).
  임베딩이 없는 태그는 혼자 한 묶음이다.
"""

import logging
import math
from collections.abc import Sequence

log = logging.getLogger(__name__)

METHODS = ("tsne", "umap")
SEED = 42
DESIRE_CLUSTER_MIN = 0.88  # 2026-11-20 실측(욕망 22개): 0.85 = 장수 · 성장, 건강 · 환경 보호까지 묶임 / 0.88 = 편리함 · 시간 절약, 건강 · 안전, 새로운 경험 · 호기심 · 배움 / 0.9 = 같은 말만(화면 변화 없음). 화면 설정에서 바꿔 볼 수 있다
MIN_POINTS = (
    5  # 이보다 적으면 지도를 만들지 않는다 (t-SNE perplexity · UMAP 이웃 수가 성립하지 않음)
)


def _normalize(xy: Sequence[Sequence[float]]) -> list[tuple[float, float]]:
    xs = [p[0] for p in xy]
    ys = [p[1] for p in xy]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    span = max(x1 - x0, y1 - y0, 1e-9)  # 가로세로 비율을 지킨다
    return [
        (round((x - x0) / span, 5), round((y - y0) / span, 5)) for x, y in zip(xs, ys, strict=True)
    ]


def project(vectors: list[list[float]], method: str) -> list[tuple[float, float]] | None:
    """벡터 → 평면 좌표 (0~1). 점이 너무 적거나 계산에 실패하면 None (지도 없이 다른 보기는 그대로)."""
    n = len(vectors)
    if n < MIN_POINTS:
        return None
    import numpy as np

    data = np.asarray(vectors, dtype=np.float32)
    try:
        if method == "tsne":
            from sklearn.decomposition import PCA
            from sklearn.manifold import TSNE

            # 고차원 그대로보다 PCA 로 먼저 줄이면 빠르고 잡음이 준다 (t-SNE 일반 권장)
            reduced = PCA(
                n_components=min(50, n - 1, data.shape[1]), random_state=SEED
            ).fit_transform(data)
            xy = TSNE(
                n_components=2,
                perplexity=float(min(30, max(2, (n - 1) // 3))),
                metric="cosine",
                init="pca",
                random_state=SEED,
            ).fit_transform(reduced)
        elif method == "umap":
            import umap

            xy = umap.UMAP(
                n_components=2,
                n_neighbors=min(15, n - 1),
                min_dist=0.1,
                metric="cosine",
                random_state=SEED,
                n_jobs=1,
                compatibility_layout=True,  # 0.6 기본 동작 유지 (경고 없앰, 같은 재료면 같은 좌표)
            ).fit_transform(data)
        else:
            raise ValueError(method)
    except Exception:  # noqa: BLE001 — 지도는 없어도 서비스 · 다른 보기는 돌아가야 한다
        log.exception("의미 지도 좌표 계산 실패 (%s)", method)
        return None
    return _normalize(xy.tolist())


def _cos(a: Sequence[float], b: Sequence[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


def desire_clusters(
    tags: list[tuple[str, str, int]],
    vectors: dict[str, list[float]],
    min_score: float = DESIRE_CLUSTER_MIN,
) -> dict[str, tuple[str, str]]:
    """욕망 태그 묶기. tags = [(name, label, 쓰인 상상 수)], vectors = {name: 벡터}
    → {name: (묶음 key, 묶음 이름 = 대표 태그 label)}.
    """
    out: dict[str, tuple[str, str]] = {}
    leaders: list[tuple[str, str, list[float]]] = []  # (key, label, 대표 벡터)
    for name, label, _ in sorted(tags, key=lambda t: (-t[2], t[1])):
        vec = vectors.get(name)
        best: tuple[float, str, str] | None = None
        if vec is not None:
            for key, lead_label, lead_vec in leaders:
                score = _cos(vec, lead_vec)
                if score >= min_score and (best is None or score > best[0]):
                    best = (score, key, lead_label)
        if best is not None:
            out[name] = (best[1], best[2])
            continue
        key = f"dc:{name}"
        out[name] = (key, label)
        if vec is not None:
            leaders.append((key, label, vec))
    return out
