"""네트워크 군집 찾기 (Louvain, 2026-11-15)"""

from app.domains.analytics.clusters import cluster_name, louvain


def test_two_groups_joined_by_weak_link():
    # 촘촘한 세 점 묶음 두 개를 약한 선 하나로 이음 → 군집 둘
    edges = {
        ("a", "b"): 5,
        ("b", "c"): 5,
        ("a", "c"): 5,
        ("x", "y"): 4,
        ("y", "z"): 4,
        ("x", "z"): 4,
        ("w", "x"): 4,
        ("c", "x"): 1,
    }
    comm = louvain(edges, ["a", "b", "c", "w", "x", "y", "z", "lonely"])
    assert comm["a"] == comm["b"] == comm["c"]
    assert comm["x"] == comm["y"] == comm["z"] == comm["w"]
    assert comm["a"] != comm["x"]
    assert comm["x"] == 0  # 큰 군집이 먼저 (A)
    assert comm["lonely"] not in (comm["a"], comm["x"])  # 선 없는 태그는 혼자
    # 같은 입력이면 늘 같은 결과
    assert louvain(edges, ["lonely", "z", "y", "x", "w", "c", "b", "a"]) == comm


def test_cluster_name():
    assert [cluster_name(k) for k in (0, 1, 25, 26)] == ["A", "B", "Z", "A2"]
