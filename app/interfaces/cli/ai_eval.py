"""Sprint 4 모델 실측 (기획안 v10 12장) — 결과는 data/ai-eval/*.json, 요약은 docs/ai-models.md 에 옮긴다.

1) 태깅: 샘플 상상 N개 → 성공률 · 속도 · 토큰 · 비용 · 결과
2) Shake 혼합: 서로 다른 작성자 · 분야의 상상 쌍 N개 → 성공률 · 출력 검사 통과율 · 결과
3) 유사도: 임베딩 후 샘플 N개의 비슷한 상상 5개 + 전체 쌍 점수 분포 (기준값 0.85 조정용)
"""

import json
import statistics
import time
from datetime import datetime
from pathlib import Path

from sqlalchemy import select, text

from app.domains.imaginations.models import Imagination
from app.domains.shake.blend import problems, run_blend
from app.domains.similar.service import embed_all, find_similar
from app.domains.tags.tagging import run_tagging
from app.infrastructure.core.config import get_settings
from app.infrastructure.core.database import get_sessionmaker
from app.infrastructure.embeddings import get_embedder
from app.infrastructure.llm.providers.base import LlmError
from app.infrastructure.llm.router import route

OUT_DIR = Path("data/ai-eval")


def _pct(xs: list[float], q: float) -> float:
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(q * (len(xs) - 1)))] if xs else 0.0


def run(*, tagging_n: int, pairs_n: int, similar_n: int) -> int:
    s = get_settings()
    report: dict = {
        "at": datetime.now().isoformat(timespec="seconds"),
        "llm": {f: route(f) for f in ("tagging", "shake")},
        "effort": s.llm_effort,
        "embedding": {
            "provider": get_embedder().name,
            "model": get_embedder().model,
            "dim": s.embedding_dim,
        },
    }
    with get_sessionmaker()() as db:
        base = list(
            db.scalars(
                select(Imagination)
                .where(Imagination.kind == "original", Imagination.status == "visible")
                .order_by(Imagination.id)
            ).unique()
        )
        start_id = db.execute(text("SELECT COALESCE(MAX(id), 0) FROM llm_calls")).scalar()

        # 1) 태깅
        tag_rows = []
        for item in base[:tagging_n]:
            t0 = time.perf_counter()
            try:
                out, err = run_tagging(db, item, log_feature="eval_tagging"), None
            except LlmError as e:
                out, err = None, str(e)
            tag_rows.append(
                {
                    "id": item.id,
                    "title": item.display_title,
                    "desire": item.desire,
                    "out": out,
                    "error": err,
                    "ms": int((time.perf_counter() - t0) * 1000),
                }
            )
            print(f"태깅 [{item.id}] {'OK' if out else 'FAIL'} {out or err}")

        # 2) Shake: 서로 다른 작성자 · 가능하면 다른 분야끼리
        pairs, used = [], set()
        for a in base:
            for b in base:
                if len(pairs) >= pairs_n:
                    break
                if (
                    a.id < b.id
                    and a.author_id != b.author_id
                    and a.domain_id != b.domain_id
                    and a.id not in used
                    and b.id not in used
                ):
                    pairs.append((a, b))
                    used |= {a.id, b.id}
        shake_rows = []
        for a, b in pairs:
            t0 = time.perf_counter()
            try:
                out, err = run_blend(db, a, b, log_feature="eval_shake"), None
            except LlmError as e:
                out, err = None, str(e)
            bad = problems(out) if out else []
            shake_rows.append(
                {
                    "a": [a.id, a.display_title],
                    "b": [b.id, b.display_title],
                    "out": out,
                    "problems": bad,
                    "error": err,
                    "ms": int((time.perf_counter() - t0) * 1000),
                }
            )
            print(
                f"Shake [{a.id}+{b.id}] {'OK' if out and not bad else 'FAIL'} {(out or {}).get('title', err)} {bad}"
            )

        calls = db.execute(
            text(
                "SELECT feature, count(*), sum(input_tokens), sum(output_tokens), sum(est_cost_usd), "
                "avg(latency_ms), sum(CASE WHEN status='success' THEN 1 ELSE 0 END) "
                "FROM llm_calls WHERE id > :s GROUP BY feature"
            ),
            {"s": start_id},
        ).all()

        # 3) 유사도
        n_emb = embed_all(db)
        sim_rows = []
        for item in base[:: max(1, len(base) // max(1, similar_n))][:similar_n]:
            sims = find_similar(db, item.id, 5)
            sim_rows.append(
                {
                    "id": item.id,
                    "title": item.display_title,
                    "similar": [[x.item.id, x.item.display_title, x.score] for x in sims],
                }
            )
        scores = [
            float(r[0])
            for r in db.execute(
                text(
                    "SELECT 1 - (a.embedding <=> b.embedding) FROM imagination_embeddings a "
                    "JOIN imagination_embeddings b ON a.imagination_id < b.imagination_id"
                )
            )
        ]

    report["tagging"] = tag_rows
    report["shake"] = shake_rows
    report["calls"] = [
        {
            "feature": f,
            "calls": n,
            "input_tokens": int(i or 0),
            "output_tokens": int(o or 0),
            "cost_usd": float(c or 0),
            "avg_ms": int(ms or 0),
            "success": int(ok or 0),
        }
        for f, n, i, o, c, ms, ok in calls
    ]
    report["similar"] = {
        "embedded_now": n_emb,
        "samples": sim_rows,
        "pair_scores": {
            "n": len(scores),
            "mean": round(statistics.mean(scores), 4) if scores else 0,
            "p50": round(_pct(scores, 0.5), 4),
            "p90": round(_pct(scores, 0.9), 4),
            "p99": round(_pct(scores, 0.99), 4),
            "max": round(max(scores), 4) if scores else 0,
            "over_threshold": sum(1 for x in scores if x >= s.similar_threshold),
        },
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / f"{datetime.now():%Y%m%d-%H%M%S}.json"
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print("\n== 요약 ==")
    for c in report["calls"]:
        print(
            f"{c['feature']}: 성공 {c['success']}/{c['calls']} · 평균 {c['avg_ms']}ms · "
            f"토큰 {c['input_tokens']}/{c['output_tokens']} · ${c['cost_usd']:.4f}"
        )
    ok = sum(1 for r in shake_rows if r["out"] and not r["problems"])
    print(f"Shake 출력 검사 통과 {ok}/{len(shake_rows)}")
    print(f"유사도 쌍 {report['similar']['pair_scores']}")
    print(f"저장: {path}")
    return 0
