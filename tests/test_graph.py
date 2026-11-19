"""Sprint 7-B — 상상 네트워크 탐색기: 그래프 재료 모으기 · 비슷한 상상 묶음 규칙 · 시작점 찾기 · 꺼져 있을 때.

테스트는 개발용 Memgraph 를 건드리지 않는다 (GRAPH_ENABLED=false). 묶음 규칙은 graph.run 을 바꿔 끼워 확인한다.
"""

from sqlalchemy import func, select

from app.domains.graph import explore
from app.domains.graph.build import collect
from app.domains.imaginations.models import Imagination
from app.domains.search.models import SearchLog
from app.domains.similar.models import SimilarLink, SimilarSet
from app.infrastructure.core.database import get_sessionmaker
from tests.conftest import auth, signup
from tests.test_admin_moderation import hide, make_admin
from tests.test_tag_pages import set_ai, write


def link(a: int, b: int, score: float = 0.9, reason: str | None = "같은 문제를 풀어요") -> None:
    with get_sessionmaker()() as db:
        if db.get(SimilarSet, a) is None:
            db.add(SimilarSet(imagination_id=a, method="rerank", model="fake", candidate_count=1))
            db.flush()
        db.add(SimilarLink(imagination_id=a, similar_id=b, rank=1, score=score, reason=reason))
        db.commit()


def test_collect_snapshot_skips_comments_hidden_and_removed_tags(client) -> None:
    a, b, boss = signup(client, "writer"), signup(client, "other"), signup(client, "boss")
    make_admin(boss)
    one = write(client, a, body="한 달에 한 번만 충전하는 휴대폰")
    two = write(client, b, body="물에 빠져도 멀쩡한 휴대폰", domain="mobile")
    gone = write(client, b, body="숨길 상상")
    set_ai(one["id"], ["고체 배터리", "무선 충전"], ["오래 쓰기"])
    set_ai(two["id"], ["고체 배터리"])
    client.put(
        f"/api/imaginations/{one['id']}/tags", json={"tech": ["고체 배터리"]}, headers=auth(a)
    )
    client.post(f"/api/imaginations/{one['id']}/comments", json={"body": "좋아요"}, headers=auth(b))
    quote = client.post(
        f"/api/imaginations/{two['id']}/quote", json={"body": "저도요"}, headers=auth(a)
    ).json()
    hide(client, boss, gone["id"])
    link(one["id"], two["id"])
    link(one["id"], gone["id"])  # 숨긴 글로 가는 연결은 넣지 않는다

    with get_sessionmaker()() as db:
        snap = collect(db)
    assert sorted(r["id"] for r in snap.items) == sorted([one["id"], two["id"], quote["id"]])
    assert {r["nickname"] for r in snap.users} == {"writer", "other"}
    # 작성자가 지운 태그(무선 충전)는 빠지고, 욕망 태그는 들어간다 (운영자 분석용)
    keys = {(h["item"], h["key"]) for h in snap.has_tag}
    assert (one["id"], "tech:무선충전") not in keys
    assert {(one["id"], "tech:고체배터리"), (one["id"], "desire:오래쓰기")} <= keys
    assert snap.quotes == [{"item": quote["id"], "quoted": two["id"]}]
    assert [(s["a"], s["b"], s["reason"]) for s in snap.similar] == [
        (one["id"], two["id"], "같은 문제를 풀어요")
    ]
    # 글 하나만 모으기
    with get_sessionmaker()() as db:
        only = collect(db, only_id=one["id"])
        assert [r["id"] for r in only.items] == [one["id"]]
        assert collect(db, only_id=gone["id"]).items == []


def test_bundles_name_signal_and_rules(monkeypatch) -> None:
    """경향 다발 = 작성자가 다른 비슷한 상상 연결 → 상상 3개 · Dreamer 2명 이상. 이름 = 핵심 주제 × 핵심 욕망."""
    from datetime import date

    from app.domains.analytics.period import make_period

    p = make_period("2026-11-01~2026-11-10", None)
    since, until = int(p.start_utc.timestamp()), int(p.end_utc.timestamp())
    early, late = since + 3600, until - 3600  # 기간 앞 절반 · 뒤 절반
    props = {
        1: ("u1", early),
        2: ("u2", late),
        3: ("u3", late),  # 1-2-3: 서로 다른 셋 → 다발
        7: ("u7", late),
        8: ("u8", late),  # 7-8: 둘뿐 → 다발 아님
    }
    seen_min: list[float] = []

    def fake_run(query: str, **params):
        if "SIMILAR_TO" in query:
            seen_min.append(params["min"])
            return [
                {"a": 1, "b": 2, "score": 0.95, "reason": "같은 욕망"},
                {"a": 2, "b": 3, "score": 0.93, "reason": None},
                {"a": 3, "b": 1, "score": 0.94, "reason": "같은 기술"},
                {"a": 7, "b": 8, "score": 0.97, "reason": None},
            ]
        if "HAS_TAG" in query:
            return (
                [
                    {"i": i, "t": {"name": "드론", "label": "드론", "type": "tech"}}
                    for i in (1, 2, 3)
                ]
                + [{"i": 1, "t": {"name": "로켓", "label": "로켓", "type": "tech"}}]
                + [
                    {"i": i, "t": {"name": "빠른배송", "label": "빠른 배송", "type": "desire"}}
                    for i in (1, 2)
                ]
            )
        if "sum(CASE" in query:
            return [{"e": 10, "r": 10}]  # 앞 · 뒤 절반 전체 상상 수
        return [
            {
                "i": {
                    "id": i,
                    "title": f"상상 {i}",
                    "excerpt": "",
                    "author": a,
                    "author_id": i,
                    "domain": "ai",
                    "created": c,
                    "thunders": 0,
                }
            }
            for i, (a, c) in props.items()
            if i in params["ids"]
        ]

    monkeypatch.setattr(explore.graph, "run", fake_run)
    out = explore.bundles(explore.Filter(since=since, until=until), p)
    assert seen_min == [explore.BUNDLE_MIN_SCORE]  # 점수 0.92 이상 연결만 쓴다
    assert out.linked == 5 and out.unit == "day" and out.buckets[0] == date(2026, 11, 1).isoformat()
    assert len(out.bundles) == 1
    b = out.bundles[0]
    assert (b.key, b.name, b.size, b.dreamers) == ("A", "#드론 × 빠른 배송", 3, 3)
    # 앞 절반 1개 → 뒤 절반 2개 (전체 상상 수는 같음) = 비중 2배 → 떠오름은 3개 이상이어야 해서 꾸준함
    assert (b.earlier, b.recent, b.signal) == (1, 2, "steady")
    assert round(b.trend, 2) == 0.67 and b.share_growth == 1.0
    assert sum(b.series) == 3 and len(b.series) == 10
    assert [(t.label, t.count) for t in b.techs] == [("드론", 3), ("로켓", 1)]
    assert b.reasons == ["같은 욕망", "같은 기술"]
    assert b.members[0].id in (1, 2, 3)


def test_signal_rules() -> None:
    assert explore._signal(5, 0, 10, 10)[0] == "new"
    assert explore._signal(6, 2, 10, 10)[0] == "rising"  # 비중 3배 · 3개 이상
    assert explore._signal(1, 4, 10, 10)[0] == "cooling"  # 1/4 < 2/3
    assert explore._signal(4, 4, 20, 10)[0] == "cooling"  # 개수는 같아도 전체가 두 배 → 비중 절반
    assert explore._signal(3, 3, 10, 10) == ("steady", 0.0, 0.5)


def test_explorer_api_admin_only_search_and_graph_off(client) -> None:
    a, boss = signup(client, "writer"), signup(client, "boss")
    item = write(client, a, body="한 달에 한 번만 충전하는 휴대폰")
    set_ai(item["id"], ["고체 배터리"], ["오래 쓰는 휴대폰"])

    assert client.get("/api/admin/graph/status", headers=auth(a)).status_code == 403
    make_admin(boss)
    h = auth(boss)

    st = client.get("/api/admin/graph/status", headers=h).json()
    assert st["enabled"] is False and st["connected"] is False
    # 그래프를 쓸 수 없으면 탐색기 API 만 503 (나머지 서비스는 그대로)
    for path in ("/api/admin/graph/bundles", "/api/admin/graph/expand?node=t:tech:고체배터리"):
        res = client.get(path, headers=h)
        assert res.status_code == 503 and res.json()["detail"]["code"] == "graph_unavailable"
    assert client.post("/api/admin/graph/rebuild", headers=h).status_code == 503
    assert client.get("/api/admin/graph/bundles?period=bad", headers=h).status_code == 422

    # 시작점 찾기: 운영자 화면이라 욕망 태그도 찾는다. 검색 기록은 남기지 않는다
    hits = client.get("/api/admin/graph/search", params={"q": "휴대폰"}, headers=h).json()
    assert [(x["id"], x["kind"]) for x in hits] == [
        ("t:desire:오래쓰는휴대폰", "desire"),
        (f"i:{item['id']}", "imagination"),
    ]
    hits = client.get("/api/admin/graph/search", params={"q": "writer"}, headers=h).json()
    assert [x["kind"] for x in hits] == ["dreamer"]
    with get_sessionmaker()() as db:
        assert db.scalar(select(func.count()).select_from(SearchLog)) == 0
        assert db.get(Imagination, item["id"]) is not None


def test_bad_node_id() -> None:
    import pytest

    from app.shared.errors import AppError

    with pytest.raises(AppError):
        explore.expand("x:1", explore.Filter(since=0, until=1))
