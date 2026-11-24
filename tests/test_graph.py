"""Sprint 7-B — 상상 네트워크 탐색기 (2026-11-20 다시 짬): 그래프 재료 · 융합과 충돌 · 의미 지도 · 계보 · 확산 경로 · 근거함.

테스트는 개발용 Memgraph 를 건드리지 않는다 (GRAPH_ENABLED=false). 보기 계산은 load · graph.run 을 바꿔 끼워 확인한다.
"""

from sqlalchemy import func, select

from app.domains.graph import explore, semantic
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
    client.post(f"/api/imaginations/{two['id']}/thunder", headers=auth(a))
    client.post(f"/api/imaginations/{two['id']}/wave", json={"via_user_id": None}, headers=auth(a))
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
    # Wave · Thunder (확산 경로 · 공명) 와 욕망 묶음 (임베딩이 없으면 태그 하나가 한 묶음)
    assert [(w["item"], w["via"]) for w in snap.waves] == [(two["id"], None)]
    assert [t["item"] for t in snap.thunders] == [two["id"]]
    desire = next(t for t in snap.tags if t["key"] == "desire:오래쓰기")
    assert desire["cluster"] == "dc:오래쓰기" and desire["cluster_label"] == "오래 쓰기"
    # 글 하나만 모으기
    with get_sessionmaker()() as db:
        only = collect(db, only_id=one["id"])
        assert [r["id"] for r in only.items] == [one["id"]]
        assert collect(db, only_id=gone["id"]).items == []


def test_signal_rules() -> None:
    assert explore._signal(5, 0, 10, 10)[0] == "new"
    assert explore._signal(6, 2, 10, 10)[0] == "rising"  # 비중 3배 · 3개 이상
    assert explore._signal(1, 4, 10, 10)[0] == "cooling"  # 1/4 < 2/3
    assert explore._signal(4, 4, 20, 10)[0] == "cooling"  # 개수는 같아도 전체가 두 배 → 비중 절반
    assert explore._signal(3, 3, 10, 10) == ("steady", 0.0, 0.5)


def test_desire_clusters_and_map_projection() -> None:
    # 많이 쓰인 태그가 대표, 대표와 0.85 이상이면 같은 묶음, 임베딩 없으면 혼자
    tags = [
        ("시간절약", "시간 절약", 9),
        ("빠르게", "빠르게", 3),
        ("건강", "건강", 5),
        ("혼자", "혼자", 1),
    ]
    vec = {"시간절약": [1.0, 0.0], "빠르게": [0.95, 0.31], "건강": [0.0, 1.0]}
    out = semantic.desire_clusters(tags, vec)
    assert out["시간절약"] == out["빠르게"] == ("dc:시간절약", "시간 절약")
    assert out["건강"] == ("dc:건강", "건강")
    assert out["혼자"] == ("dc:혼자", "혼자")
    # 점이 너무 적으면 지도 없음, 충분하면 0~1 좌표 (같은 재료면 같은 좌표)
    assert semantic.project([[1.0, 0.0]] * 3, "tsne") is None
    pts = [[float((i * 7 + k) % 5), float(i % 3), float(k)] for i in range(4) for k in range(3)]
    xy = semantic.project(pts, "tsne")
    assert xy is not None and len(xy) == 12
    assert all(0 <= x <= 1 and 0 <= y <= 1 for x, y in xy)
    assert xy == semantic.project(pts, "tsne")


def _loaded(items: dict[int, tuple[str, int, list[tuple[str, str]]]]) -> explore.Loaded:
    """{id: (분야, 올린 때, [(종류, 이름)])} → Loaded (기간 0~100)."""
    L = explore.Loaded(f=explore.Filter(since=0, until=100))
    for iid, (domain, created, tags) in items.items():
        L.items[iid] = {
            "id": iid,
            "kind": "original",
            "title": f"상상 {iid}",
            "author": f"d{iid}",
            "author_id": iid,
            "domain": domain,
            "domain2": None,
            "created": created,
            "thunders": iid,
            "waves": 0,
        }
        L.tags[iid] = [
            {"type": t, "name": n, "label": n, "cluster": f"dc:{n}", "cluster_label": n}
            for t, n in tags
        ]
    L.r_total = sum(1 for i in L.items.values() if i["created"] >= 50)
    L.e_total = len(L.items) - L.r_total
    return L


def test_fusion_edges_collision_focus_and_expand(monkeypatch) -> None:
    L = _loaded(
        {
            1: ("bio", 10, [("tech", "bci"), ("tech", "렌즈"), ("desire", "편리")]),
            2: ("bio", 60, [("tech", "bci"), ("tech", "렌즈"), ("desire", "편리")]),
            3: ("bio", 70, [("tech", "렌즈"), ("tech", "칩"), ("desire", "편리")]),
            4: ("mobile", 80, [("tech", "렌즈"), ("tech", "칩"), ("desire", "건강")]),
            5: ("bio", 90, [("tech", "bci"), ("tech", "드론"), ("desire", "건강")]),
            6: ("mobile", 95, [("tech", "칩"), ("desire", "건강")]),
        }
    )
    monkeypatch.setattr(explore, "load", lambda f: L)
    f = explore.Filter(since=0, until=100)
    out, focus = explore.fusion(f, techs=3, desires=2)
    assert focus is None
    ids = {n.id for n in out.nodes}
    # 상상 2개 이상인 기술 3개(렌즈 4 · bci 3 · 칩 3) + 욕망 2개 — 드론(1개)은 빠짐
    assert ids == {"t:렌즈", "t:bci", "t:칩", "d:dc:편리", "d:dc:건강"}
    edges = {(e.source, e.target): e for e in out.edges}
    # 대표 분야가 다른 기술(렌즈 = bio, 칩 = mobile)이 2개 이상 함께 → 충돌. 같은 분야(bci · 렌즈)면 조합
    assert edges[("t:bci", "t:렌즈")].kind == "combo"
    assert edges[("t:렌즈", "t:칩")].kind == "collision"
    assert edges[("t:렌즈", "t:칩")].weight == 2
    assert (
        edges[("t:렌즈", "d:dc:편리")].weight == 3 and edges[("t:렌즈", "d:dc:편리")].rank_pct > 0
    )
    assert all(e.weight >= explore.EDGE_MIN for e in out.edges)
    lens = next(n for n in out.nodes if n.id == "t:렌즈")
    assert lens.count == 4 and lens.trend.recent == 3 and lens.trend.earlier == 1
    # 대시보드 · 찾기에서 온 시작점: 이름("tech:드론" · "desire:건강")을 점 id 로, 안 보이던 점은 더해 펼친다
    out, focus = explore.fusion(f, techs=3, desires=2, focus="desire:건강")
    assert focus == "d:dc:건강"
    out, focus = explore.fusion(f, techs=3, desires=2, focus="tech:bci")
    assert focus == "t:bci"
    more = explore.fusion_expand(f, "t:bci", ["t:bci", "t:렌즈"])
    assert all(n.extra for n in more.nodes) and "t:렌즈" not in {n.id for n in more.nodes}


def test_lineage_depth_cross_and_filters(monkeypatch) -> None:
    props = {
        1: {"kind": "original", "domain": "bio", "synergy": None, "created": 1},
        2: {"kind": "original", "domain": "energy", "synergy": None, "created": 2},
        3: {"kind": "blend", "domain": "bio", "synergy": 4.0, "created": 3},
        4: {"kind": "original", "domain": "bio", "synergy": None, "created": 4},
        5: {"kind": "blend", "domain": "bio", "synergy": 1.0, "created": 5},
        6: {"kind": "original", "domain": "life", "synergy": None, "created": 6},
        7: {"kind": "original", "domain": "life", "synergy": None, "created": 7},
        8: {"kind": "blend", "domain": "life", "synergy": -1.0, "created": 8},
    }
    links = [(1, 3), (2, 3), (3, 5), (4, 5), (6, 8), (7, 8)]

    def fake_run(query: str, **params):
        if "BLENDED_INTO" in query:
            return [{"p": p, "c": c} for p, c in links]
        if "i.id IN $ids" in query:
            return [
                {
                    "i": {
                        "id": i,
                        "title": f"상상 {i}",
                        "author": "d",
                        "domain2": None,
                        "thunders": i,
                        **p,
                    }
                }
                for i, p in props.items()
                if i in params["ids"]
            ]
        return [{"id": i} for i, p in props.items() if p["kind"] == "blend"]

    monkeypatch.setattr(explore.graph, "run", fake_run)
    f = explore.Filter(since=0, until=100)
    out = explore.lineage(f)
    nodes = {n.id: n for n in out.nodes}
    assert [t.size for t in out.trees] == [5, 3]  # 시너지가 큰 계보부터
    assert nodes[5].depth == 2 and nodes[3].depth == 1 and nodes[1].depth == 0
    assert nodes[3].cross and not nodes[5].cross and not nodes[8].cross  # 재료 분야가 둘 이상
    assert out.trees[0].best_synergy == 4.0 and out.trees[0].depth == 2
    assert out.blends_total == 3
    only = explore.lineage(f, cross_only=True)
    assert [t.size for t in only.trees] == [5]
    assert {n.id for n in only.nodes if n.match} == {3}
    assert explore.lineage(f, min_synergy=2).blends_total == 1


def test_cascade_tree_roles() -> None:
    # 작성자 1. 2 · 3 은 직접, 4 는 2 를 보고, 5 는 4 를 보고, 6 은 아직 Wave 하지 않은 9 를 거쳤다고 함 → 작성자 밑으로
    waves = [(2, None, 10), (3, None, 11), (4, 2, 12), (5, 4, 13), (6, 9, 14), (1, None, 15)]
    tree = explore.build_cascade(1, waves)
    assert tree[1] == (None, 0)
    assert tree[4] == (2, 2) and tree[5] == (4, 3) and tree[6] == (1, 1)
    below = explore._subtree(tree)
    assert below[2] == {4, 5} and below[1] == {2, 3, 4, 5, 6}


def test_explorer_api_admin_only_search_and_graph_off(client) -> None:
    a, boss = signup(client, "writer"), signup(client, "boss")
    item = write(client, a, body="한 달에 한 번만 충전하는 휴대폰")
    set_ai(item["id"], ["고체 배터리"], ["오래 쓰는 휴대폰"])

    assert client.get("/api/admin/graph/status", headers=auth(a)).status_code == 403
    assert client.get("/api/admin/graph/pins", headers=auth(a)).status_code == 403
    make_admin(boss)
    h = auth(boss)

    st = client.get("/api/admin/graph/status", headers=h).json()
    assert st["enabled"] is False and st["connected"] is False
    assert st["desire_tags"] == 1 and st["tag_embedded"] == 0
    # 그래프를 쓸 수 없으면 탐색기 보기만 503 (나머지 서비스 · 근거함은 그대로)
    for path in (
        "/api/admin/graph/fusion",
        "/api/admin/graph/map?method=umap",
        "/api/admin/graph/lineage",
        "/api/admin/graph/cascades",
        "/api/admin/graph/fusion/inspect?a=t:고체배터리",
    ):
        res = client.get(path, headers=h)
        assert res.status_code == 503 and res.json()["detail"]["code"] == "graph_unavailable"
    assert client.post("/api/admin/graph/rebuild", headers=h).status_code == 503
    assert client.get("/api/admin/graph/fusion?period=bad", headers=h).status_code == 422
    assert client.get("/api/admin/graph/map?method=pca", headers=h).status_code == 422

    # 시작점 찾기: 운영자 화면이라 욕망 태그도 찾는다. 검색 기록은 남기지 않는다
    hits = client.get("/api/admin/graph/search", params={"q": "휴대폰"}, headers=h).json()
    assert [(x["id"], x["kind"]) for x in hits] == [
        ("desire:오래쓰는휴대폰", "desire"),
        (f"i:{item['id']}", "imagination"),
    ]
    with get_sessionmaker()() as db:
        assert db.scalar(select(func.count()).select_from(SearchLog)) == 0
        assert db.get(Imagination, item["id"]) is not None


def test_pins_per_admin(client) -> None:
    boss, other = signup(client, "boss"), signup(client, "other")
    make_admin(boss)
    make_admin(other)
    h, h2 = auth(boss), auth(other)
    body = {
        "kind": "collision",
        "title": "#BCI × #스마트렌즈",
        "summary": "분야가 다른 두 기술이 상상 9개에 함께 나와요.",
        "stat": "상상 9 · 상위 3%",
        "ref": {"view": "fusion", "a": "t:bci", "b": "t:스마트렌즈"},
    }
    first = client.post("/api/admin/graph/pins", json=body, headers=h)
    assert first.status_code == 201
    again = client.post("/api/admin/graph/pins", json=body, headers=h).json()
    assert again["id"] == first.json()["id"]  # 두 번 담아도 하나
    client.post("/api/admin/graph/pins", json={**body, "kind": "quote", "title": "원문"}, headers=h)
    assert [p["title"] for p in client.get("/api/admin/graph/pins", headers=h).json()] == [
        "원문",
        "#BCI × #스마트렌즈",
    ]
    # 근거함은 운영자마다 따로 — 다른 운영자는 보지도 지우지도 못한다
    assert client.get("/api/admin/graph/pins", headers=h2).json() == []
    pin_id = first.json()["id"]
    assert client.delete(f"/api/admin/graph/pins/{pin_id}", headers=h2).status_code == 404
    assert client.delete(f"/api/admin/graph/pins/{pin_id}", headers=h).status_code == 204
    assert (
        client.post("/api/admin/graph/pins", json={**body, "kind": "nope"}, headers=h).status_code
        == 422
    )
    assert client.delete("/api/admin/graph/pins", headers=h).status_code == 204
    assert client.get("/api/admin/graph/pins", headers=h).json() == []


def test_desire_cluster_map_threshold(client) -> None:
    """화면 설정의 욕망 묶기 기준 — 저장된 태그 임베딩으로 요청마다 다시 묶는다. 1 이면 묶지 않음."""
    from app.domains.graph.models import TagEmbedding
    from app.domains.tags.models import Tag

    a = signup(client, "writer")
    one = write(client, a, body="출근길이 짧아지는 상상")
    set_ai(one["id"], ["자율주행"], ["시간 절약", "편리함", "건강"])
    with get_sessionmaker()() as db:
        ids = dict(db.execute(select(Tag.name, Tag.id).where(Tag.type == "desire")).all())
        pad = [0.0] * 766
        for name, vec in {
            "시간절약": [1.0, 0.0],
            "편리함": [0.89, 0.456],
            "건강": [0.0, 1.0],
        }.items():
            db.add(TagEmbedding(tag_id=ids[name], model="fake", embedding=vec + pad))
        db.commit()
        loose = explore.desire_cluster_map(db, 0.85)
        assert loose["편리함"] == loose["시간절약"] != loose["건강"]
        strict = explore.desire_cluster_map(db, 0.9)
        assert strict["편리함"] != strict["시간절약"]
        assert explore.desire_cluster_map(db, 1)["편리함"] == ("dc:편리함", "편리함")


def test_start_search_per_tab(monkeypatch) -> None:
    """시작점 찾기를 탭마다 (2026-11-20): 태그 → 상상 id, 계보 only · first."""
    L = _loaded(
        {
            1: ("bio", 10, [("tech", "드론"), ("desire", "편리")]),
            2: ("bio", 60, [("tech", "렌즈")]),
            3: ("bio", 70, [("tech", "드론")]),
        }
    )
    monkeypatch.setattr(explore, "load", lambda f: L)
    f = explore.Filter(since=0, until=100)
    assert explore.find_ids(f, "tech:드론") == [
        3,
        1,
    ]  # Thunder 많은 순 (테스트 데이터는 id = Thunder)
    assert explore.find_ids(f, "desire:편리") == [1]
    import pytest

    from app.shared.errors import AppError

    with pytest.raises(AppError):
        explore.find_ids(f, "dreamer:x")

    # 계보: A = 1,2 → 3 (시너지 4) · B = 4,5 → 6 (시너지 -1, 조건 밖)
    props = {
        1: {"kind": "original", "domain": "bio", "synergy": None, "created": 1},
        2: {"kind": "original", "domain": "life", "synergy": None, "created": 2},
        3: {"kind": "blend", "domain": "bio", "synergy": 4.0, "created": 3},
        4: {"kind": "original", "domain": "bio", "synergy": None, "created": 4},
        5: {"kind": "original", "domain": "bio", "synergy": None, "created": 5},
        6: {"kind": "blend", "domain": "bio", "synergy": -1.0, "created": 6},
    }

    def fake_run(query: str, **params):
        if "BLENDED_INTO" in query:
            return [{"p": p, "c": c} for p, c in [(1, 3), (2, 3), (4, 6), (5, 6)]]
        if "i.id IN $ids" in query:
            return [
                {"i": {"id": i, "title": "t", "author": "d", "domain2": None, "thunders": 0, **p}}
                for i, p in props.items()
                if i in params["ids"]
            ]
        return [{"id": i} for i, p in props.items() if p["kind"] == "blend"]

    monkeypatch.setattr(explore.graph, "run", fake_run)
    only = explore.lineage(f, only={5})
    assert {n.id for n in only.nodes} == {4, 5, 6}
    # first: 거르기(시너지 2 이상)에 안 맞아도 그 상상의 계보를 맨 앞에
    first = explore.lineage(f, min_synergy=2, first=4)
    assert [n.tree for n in first.nodes if n.id == 4] == ["A"] and len(first.trees) == 2


def test_node_links_counts_hidden_neighbors() -> None:
    """융합과 충돌 점 상세의 연결 수 — 종류별 선 수 + 그림에 없는 이웃 수 (2026-11-24)."""
    from app.domains.graph.explore import _node_links

    pairs = {
        "desire": {("t:a", "d:x"): {1, 2}, ("t:b", "d:x"): {3, 4}},
        "collision": {("t:a", "t:b"): {1, 3}, ("t:c", "t:a"): {2, 5}},
        "combo": {},
    }
    got = _node_links(pairs, "t:a", ["t:a", "d:x"])
    assert (got.collision, got.desire, got.combo, got.hidden) == (
        2,
        1,
        0,
        2,
    )  # 숨은 이웃 = t:b · t:c
    assert _node_links(pairs, "d:x", ["t:a", "t:b", "d:x"]).hidden == 0
    # 이름은 함께 나온 상상이 많은 순 (같으면 id 순)
    assert got.collision_with == ["t:b", "t:c"] and got.hidden_with == ["t:b", "t:c"]
    assert got.desire_with == ["d:x"] and got.combo_with == []
