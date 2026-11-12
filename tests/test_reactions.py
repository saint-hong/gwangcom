"""Sprint 2 — Thunder · Wave · 북마크 · 인용 · 서재 (v9 F4 · F6 · F7, v10 반영목록 2장)."""

from sqlalchemy import text

from app.infrastructure.core.database import get_engine
from tests.conftest import auth, signup


def write(client, token, body="하늘을 나는 학교 버스", domain="mobility"):
    res = client.post(
        "/api/imaginations", data={"body": body, "domain": domain}, headers=auth(token)
    )
    assert res.status_code == 201, res.text
    return res.json()


def events() -> list[tuple[str, bool]]:
    with get_engine().connect() as conn:
        return [
            tuple(r)
            for r in conn.execute(text('SELECT type, "on" FROM reaction_events ORDER BY id'))
        ]


def test_thunder_toggle_counts_and_my(client) -> None:
    a, b = signup(client, "writer"), signup(client, "reader")
    item = write(client, a)
    url = f"/api/imaginations/{item['id']}/thunder"

    res = client.post(url, headers=auth(b)).json()
    assert res["my"]["thunder"] is True and res["counts"]["thunders"] == 1
    # 두 번 눌러도 한 번만 센다
    assert client.post(url, headers=auth(b)).json()["counts"]["thunders"] == 1

    # 새로 불러와도 켜진 상태가 남는다 (my)
    d = client.get(f"/api/imaginations/{item['id']}", headers=auth(b)).json()
    assert d["my"] == {"thunder": True, "wave": False, "bookmark": False}
    assert (
        client.get(f"/api/imaginations/{item['id']}", headers=auth(a)).json()["my"]["thunder"]
        is False
    )

    res = client.delete(url, headers=auth(b)).json()
    assert res["my"]["thunder"] is False and res["counts"]["thunders"] == 0
    assert client.delete(url, headers=auth(b)).json()["counts"]["thunders"] == 0
    assert events() == [("thunder", True), ("thunder", False)]


def test_own_post_and_login_rules(client) -> None:
    a = signup(client, "writer")
    item = write(client, a)
    for kind in ("thunder", "wave"):
        res = client.post(f"/api/imaginations/{item['id']}/{kind}", headers=auth(a))
        assert res.status_code == 403 and res.json()["detail"]["code"] == "own_post"
    # 북마크는 내 글도 가능
    assert client.post(f"/api/imaginations/{item['id']}/bookmark", headers=auth(a)).json()["my"][
        "bookmark"
    ]
    assert client.post(f"/api/imaginations/{item['id']}/thunder").status_code == 401
    assert client.post("/api/imaginations/999999/thunder", headers=auth(a)).status_code == 404


def test_wave_permission_and_via(client) -> None:
    a, b, c = signup(client, "writer"), signup(client, "reader"), signup(client, "third")
    item = write(client, a)
    res = client.post(
        f"/api/imaginations/{item['id']}/wave",
        json={"via_user_id": c["user"]["id"]},
        headers=auth(b),
    ).json()
    assert res["my"]["wave"] is True and res["counts"]["waves"] == 1
    with get_engine().connect() as conn:
        via = conn.execute(text("SELECT via_user_id FROM waves")).scalar()
    assert via == c["user"]["id"]

    with get_engine().begin() as conn:
        conn.execute(
            text(
                "INSERT INTO policy_settings (scope, user_id, key, value) VALUES ('user', :u, 'perm.can_wave', 'false')"
            ),
            {"u": c["user"]["id"]},
        )
    res = client.post(f"/api/imaginations/{item['id']}/wave", headers=auth(c))
    assert res.status_code == 403 and res.json()["detail"]["code"] == "not_allowed"
    d = client.get(f"/api/imaginations/{item['id']}", headers=auth(c)).json()
    assert d["actions"]["wave"]["reason"] == "not_allowed"


def test_quote_and_deleted_original(client) -> None:
    a, b = signup(client, "writer"), signup(client, "reader")
    item = write(client, a, domain="space")
    res = client.post(
        f"/api/imaginations/{item['id']}/quote", json={"body": "이거 진짜 좋다"}, headers=auth(b)
    )
    assert res.status_code == 201, res.text
    q = res.json()
    assert q["kind"] == "quote" and q["domain"]["slug"] == "space"
    assert q["title"] is None and q["desire"] is None
    assert q["quoted"]["id"] == item["id"] and q["quoted"]["deleted"] is False
    assert q["quoted"]["author"]["nickname"] == "writer"
    assert client.get(f"/api/imaginations/{item['id']}").json()["counts"]["quotes"] == 1

    too_long = client.post(
        f"/api/imaginations/{item['id']}/quote", json={"body": "가" * 301}, headers=auth(b)
    )
    assert too_long.json()["detail"]["code"] == "too_long"
    assert client.get("/api/me/limits", headers=auth(b)).json()["today"]["posts_used"] == 1

    # 원본이 삭제되면 인용 카드 자리에 "삭제된 상상"
    assert client.delete(f"/api/imaginations/{item['id']}", headers=auth(a)).status_code == 204
    feed = client.get("/api/feed").json()["items"]
    assert [x["kind"] for x in feed] == ["quote"]
    assert feed[0]["quoted"] == {
        **feed[0]["quoted"],
        "id": item["id"],
        "deleted": True,
        "body": None,
    }

    # 인용 글을 지우면 원본의 인용 수가 줄어든다
    other = write(client, a)
    q2 = client.post(
        f"/api/imaginations/{other['id']}/quote", json={"body": "또 인용"}, headers=auth(b)
    ).json()
    client.delete(f"/api/imaginations/{q2['id']}", headers=auth(b))
    assert client.get(f"/api/imaginations/{other['id']}").json()["counts"]["quotes"] == 0


def test_library_tabs(client) -> None:
    a, b = signup(client, "writer"), signup(client, "reader")
    first, second, third = (write(client, a, body=f"상상 {i}") for i in range(3))
    h = auth(b)
    client.post(f"/api/imaginations/{first['id']}/bookmark", headers=h)
    client.post(f"/api/imaginations/{third['id']}/bookmark", headers=h)
    client.post(f"/api/imaginations/{second['id']}/thunder", headers=h)
    comment = client.post(
        f"/api/imaginations/{first['id']}/comments", json={"body": "멋져요"}, headers=auth(a)
    ).json()
    client.post(f"/api/imaginations/{comment['id']}/bookmark", headers=h)
    client.post(f"/api/imaginations/{comment['id']}/thunder", headers=h)
    client.get(f"/api/imaginations/{second['id']}", headers=h)
    client.get(f"/api/imaginations/{first['id']}", headers=h)

    def lib(tab):
        return [
            x["id"]
            for x in client.get("/api/me/library", params={"tab": tab}, headers=h).json()["items"]
        ]

    # 북마크: 누른 순(최근 먼저), 댓글도 함께
    assert lib("bookmarks") == [comment["id"], third["id"], first["id"]]
    # Thunder: 상상만 (댓글 제외)
    assert lib("thunders") == [second["id"]]
    # 최근 본 상상: 본 순서
    assert lib("recent") == [first["id"], second["id"]]
    # Shake it: 내가 섞어 만든 혼합 글 (Shake it 은 Sprint 5 라 지금은 비어 있음)
    assert lib("shakes") == []
    assert client.get("/api/me/library").status_code == 401

    # 삭제된 글은 서재에서 빠진다
    client.delete(f"/api/imaginations/{third['id']}", headers=auth(a))
    assert lib("bookmarks") == [comment["id"], first["id"]]


def test_library_cursor(client) -> None:
    a, b = signup(client, "writer"), signup(client, "reader")
    with get_engine().begin() as conn:
        for i in range(25):
            iid = conn.execute(
                text(
                    "INSERT INTO imaginations (author_id, body, domain_id) VALUES (:u, :b, 1) RETURNING id"
                ),
                {"u": a["user"]["id"], "b": f"상상 {i}"},
            ).scalar()
            conn.execute(
                text(
                    "INSERT INTO bookmarks (user_id, imagination_id, created_at) VALUES (:u, :i, now() - make_interval(mins => :m))"
                ),
                {"u": b["user"]["id"], "i": iid, "m": i},
            )
    p1 = client.get("/api/me/library", params={"tab": "bookmarks"}, headers=auth(b)).json()
    assert len(p1["items"]) == 20 and p1["next_cursor"]
    p2 = client.get(
        "/api/me/library", params={"tab": "bookmarks", "cursor": p1["next_cursor"]}, headers=auth(b)
    ).json()
    assert len(p2["items"]) == 5 and p2["next_cursor"] is None
