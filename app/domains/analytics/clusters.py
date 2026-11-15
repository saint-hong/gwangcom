"""태그 네트워크 군집 찾기 (2026-11-15) — Louvain 방법을 짧게 직접 구현한다 (새 라이브러리 없이).

같은 상상에 함께 나온 태그끼리 선(굵기 = 횟수)으로 이은 그래프에서, 안쪽 연결이 촘촘한 묶음을 찾는다.
  1단계: 태그마다 자기 군집에서 출발해, 이웃 군집으로 옮기면 모듈성(안쪽 연결의 촘촘함)이 오를 때 옮긴다.
  2단계: 찾은 군집을 점 하나로 합쳐 같은 일을 되풀이한다. 더 바뀌지 않으면 끝.
순서를 정렬해 고정하므로 같은 데이터면 결과가 늘 같다. 군집에 이름(뜻)을 붙이지 않는다 — 해석은 운영자가 한다.
"""

from collections import defaultdict


def _one_level(adj: dict[int, dict[int, float]], m2: float) -> dict[int, int] | None:
    """점 → 군집. 아무도 옮기지 않으면 None."""
    nodes = sorted(adj)
    comm = {n: n for n in nodes}
    deg = {n: sum(adj[n].values()) for n in nodes}  # 자기 연결(합친 군집 안쪽)은 2배로 들어 있다
    tot = dict(deg)
    moved_any = False
    for _ in range(50):
        moved = False
        for n in nodes:
            cur = comm[n]
            links: dict[int, float] = defaultdict(float)
            for nb, w in adj[n].items():
                if nb != n:
                    links[comm[nb]] += w
            tot[cur] -= deg[n]
            best, best_gain = cur, links.get(cur, 0.0) - tot[cur] * deg[n] / m2
            for c in sorted(links):
                gain = links[c] - tot[c] * deg[n] / m2
                if gain > best_gain + 1e-12:
                    best, best_gain = c, gain
            tot[best] += deg[n]
            if best != cur:
                comm[n] = best
                moved = moved_any = True
        if not moved:
            break
    return comm if moved_any else None


def louvain(edges: dict[tuple[str, str], float], nodes: list[str]) -> dict[str, int]:
    """태그 → 군집 번호 (0 = 가장 큰 군집, 같으면 이름순). 선이 없는 태그는 혼자 한 군집."""
    names = sorted(set(nodes))
    idx = {n: i for i, n in enumerate(names)}
    member: dict[int, list[str]] = {i: [n] for n, i in idx.items()}
    adj: dict[int, dict[int, float]] = {i: {} for i in range(len(names))}
    for (a, b), w in edges.items():
        if a == b or a not in idx or b not in idx:
            continue
        i, j = idx[a], idx[b]
        adj[i][j] = adj[i].get(j, 0.0) + w
        adj[j][i] = adj[j].get(i, 0.0) + w
    m2 = sum(sum(v.values()) for v in adj.values())
    if m2 > 0:
        while True:
            comm = _one_level(adj, m2)
            if comm is None:
                break
            # 군집을 점 하나로 합친다 (안쪽 연결은 자기 연결로)
            ids = {c: k for k, c in enumerate(sorted(set(comm.values())))}
            new_adj: dict[int, dict[int, float]] = {k: {} for k in ids.values()}
            new_member: dict[int, list[str]] = defaultdict(list)
            for n, nbrs in adj.items():
                cn = ids[comm[n]]
                new_member[cn] += member[n]
                for nb, w in nbrs.items():
                    cb = ids[comm[nb]]
                    new_adj[cn][cb] = new_adj[cn].get(cb, 0.0) + w
            adj, member = new_adj, dict(new_member)
    groups = sorted(member.values(), key=lambda g: (-len(g), sorted(g)[0]))
    return {n: k for k, g in enumerate(groups) for n in g}


def cluster_name(k: int) -> str:
    """0 → A, 1 → B … 25 → Z, 26 → A2 … (뜻 없는 임의 이름)"""
    letter = chr(ord("A") + k % 26)
    return letter if k < 26 else f"{letter}{k // 26 + 1}"
