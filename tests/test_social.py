"""Sprint 3 — 팔로우 · 팔로잉 탭 · 프로필 · 알림 · 인기 상상 · 추천 Dreamer · 프로필 수정 (v10 반영목록 7장)."""

import io

from PIL import Image
from sqlalchemy import text

from app.infrastructure.core.database import get_engine
from tests.conftest import auth, signup


def write(client, token, body="하늘을 나는 학교 버스", domain="mobility"):
    res = client.post(
        "/api/imaginations", data={"body": body, "domain": domain}, headers=auth(token)
    )
    assert res.status_code == 201, res.text
    return res.json()


def ids(res) -> list[int]:
    return [x["id"] for x in res.json()["items"]]


def test_follow_and_profile(client) -> None:
    a, b = signup(client, "writer"), signup(client, "reader")
    write(client, a)
    res = client.post("/api/users/writer/follow", headers=auth(b)).json()
    assert res == {"following": True, "followers": 1}
    assert (
        client.post("/api/users/writer/follow", headers=auth(b)).json()["followers"] == 1
    )  # 두 번 눌러도 1
    assert client.post("/api/users/writer/follow", headers=auth(a)).status_code == 403  # 나 자신

    p = client.get("/api/users/writer", headers=auth(b)).json()
    assert p["counts"] == {"posts": 1, "following": 0, "followers": 1}
    assert p["following"] is True and p["is_me"] is False
    assert client.get("/api/users/writer", headers=auth(a)).json()["is_me"] is True
    assert client.get("/api/users/reader").json()["counts"]["following"] == 1

    assert client.delete("/api/users/writer/follow", headers=auth(b)).json() == {
        "following": False,
        "followers": 0,
    }
    assert client.get("/api/users/nobody").status_code == 404


def test_profile_tabs(client) -> None:
    a, b = signup(client, "writer"), signup(client, "reader")
    mine = write(client, a)
    other = write(client, b, body="바다 위 도시")
    c = client.post(
        f"/api/imaginations/{other['id']}/comments", json={"body": "멋져요"}, headers=auth(a)
    ).json()
    client.post(f"/api/imaginations/{other['id']}/wave", headers=auth(a))

    q = client.post(
        f"/api/imaginations/{other['id']}/quote", json={"body": "인용"}, headers=auth(a)
    ).json()

    tab = lambda t: client.get("/api/users/writer/imaginations", params={"tab": t})  # noqa: E731
    assert ids(tab("posts")) == [mine["id"]]  # 원본 · 혼합만 (인용은 따로)
    assert ids(tab("comments")) == [c["id"]]
    assert ids(tab("quotes")) == [q["id"]]
    assert tab("waves").status_code == 422  # Wave 탭은 서재로 옮김
    lib = client.get("/api/me/library", params={"tab": "waves"}, headers=auth(a)).json()["items"]
    assert [x["id"] for x in lib] == [other["id"]]


def test_following_feed_with_wave_line_and_via(client) -> None:
    a, b, c = signup(client, "writer"), signup(client, "waver"), signup(client, "reader")
    post = write(client, a)
    own_b = write(client, b, body="B 의 상상")
    client.post("/api/users/waver/follow", headers=auth(c))

    # C 는 B 만 팔로우: B 의 상상 + B 가 Wave 한 A 의 상상
    client.post(f"/api/imaginations/{post['id']}/wave", headers=auth(b))
    feed = client.get("/api/feed", params={"tab": "following"}, headers=auth(c)).json()["items"]
    assert [x["id"] for x in feed] == [post["id"], own_b["id"]]
    assert feed[0]["waved_by"]["nickname"] == "waver" and feed[1]["waved_by"] is None

    # 팔로잉 탭에서 본 Wave 를 보고 Wave → via 기록
    client.post(
        f"/api/imaginations/{post['id']}/wave",
        json={"via_user_id": feed[0]["waved_by"]["id"]},
        headers=auth(c),
    )
    with get_engine().connect() as conn:
        via = conn.execute(
            text("SELECT via_user_id FROM waves WHERE user_id = :u"), {"u": c["user"]["id"]}
        ).scalar()
    assert via == b["user"]["id"]
    assert client.get("/api/feed", params={"tab": "following"}).json()["items"] == []  # 비로그인


def test_notifications(client) -> None:
    a, b = signup(client, "writer"), signup(client, "reader")
    post = write(client, a)
    h = auth(b)
    client.post(f"/api/imaginations/{post['id']}/thunder", headers=h)
    client.delete(f"/api/imaginations/{post['id']}/thunder", headers=h)
    client.post(f"/api/imaginations/{post['id']}/thunder", headers=h)  # 껐다 켜도 알림은 한 번
    client.post(f"/api/imaginations/{post['id']}/wave", headers=h)
    client.post(f"/api/imaginations/{post['id']}/bookmark", headers=h)  # 북마크는 알리지 않음
    client.post(f"/api/imaginations/{post['id']}/quote", json={"body": "인용"}, headers=h)
    c1 = client.post(
        f"/api/imaginations/{post['id']}/comments", json={"body": "댓글"}, headers=h
    ).json()
    client.post("/api/users/writer/follow", headers=h)
    # A 가 자기 글에 댓글 → 알림 없음, B 의 댓글에 답글 → B 에게 reply
    client.post(
        f"/api/imaginations/{post['id']}/comments", json={"body": "내 댓글"}, headers=auth(a)
    )
    client.post(f"/api/imaginations/{c1['id']}/comments", json={"body": "답글"}, headers=auth(a))
    client.post(
        f"/api/imaginations/{c1['id']}/thunder", headers=auth(a)
    )  # 댓글에 받은 Thunder 도 알림

    res = client.get("/api/notifications", headers=auth(a)).json()["items"]
    assert [n["type"] for n in res] == ["follow", "comment", "quote", "wave", "thunder"]
    assert res[0]["item"] is None and res[0]["actor"]["nickname"] == "reader"
    assert res[1]["item"]["id"] == c1["id"] and res[3]["item"]["id"] == post["id"]
    assert client.get("/api/notifications/unread-count", headers=auth(a)).json() == {"count": 5}

    b_types = [n["type"] for n in client.get("/api/notifications", headers=h).json()["items"]]
    assert b_types == ["thunder", "reply"]
    assert [
        n["type"]
        for n in client.get("/api/notifications", params={"tab": "comments"}, headers=h).json()[
            "items"
        ]
    ] == ["reply"]

    assert client.post("/api/notifications/read", headers=auth(a)).status_code == 204
    assert client.get("/api/notifications/unread-count", headers=auth(a)).json() == {"count": 0}
    # 대상 글이 지워지면 알림도 보이지 않는다
    client.delete(f"/api/imaginations/{c1['id']}", headers=h)
    assert "comment" not in [
        n["type"] for n in client.get("/api/notifications", headers=auth(a)).json()["items"]
    ]
    assert client.get("/api/notifications").status_code == 401


def test_trending_and_recommended_tab(client) -> None:
    a, b, c = signup(client, "writer"), signup(client, "reader"), signup(client, "third")
    low = write(client, a, body="조용한 상상")
    high = write(client, a, body="인기 상상")
    newest = write(client, a, body="방금 올린 상상")
    for t in (b, c):
        client.post(f"/api/imaginations/{high['id']}/thunder", headers=auth(t))
    client.post(f"/api/imaginations/{low['id']}/wave", headers=auth(b))  # 2점
    with get_engine().begin() as conn:  # 8일 전 상상은 순위에서 빠진다
        conn.execute(
            text(
                "INSERT INTO imaginations (author_id, body, domain_id, thunder_count, created_at) "
                "VALUES (:u, '옛 상상', 1, 99, now() - interval '8 days')"
            ),
            {"u": a["user"]["id"]},
        )
    trending = ids(client.get("/api/trending"))
    assert trending == [high["id"], low["id"], newest["id"]]  # 같은 점수(0)면 최신순
    rec = client.get("/api/feed", params={"tab": "recommended"}).json()["items"]
    assert [x["id"] for x in rec[:3]] == trending and rec[3]["body"] == "옛 상상"


def test_recommended_dreamers(client) -> None:
    a, b, c = signup(client, "writer"), signup(client, "reader"), signup(client, "third")
    post = write(client, a)
    client.post(f"/api/imaginations/{post['id']}/thunder", headers=auth(c))
    names = [
        d["author"]["nickname"]
        for d in client.get("/api/users/recommended", headers=auth(b)).json()
    ]
    assert names[0] == "writer" and "reader" not in names
    client.post("/api/users/writer/follow", headers=auth(b))
    names = [
        d["author"]["nickname"]
        for d in client.get("/api/users/recommended", headers=auth(b)).json()
    ]
    assert "writer" not in names
    card = client.get("/api/users/writer/card", headers=auth(b)).json()
    assert card["following"] is True


def png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (60, 20), (40, 40, 40)).save(buf, format="PNG")
    return buf.getvalue()


def test_update_profile_and_password(client) -> None:
    a = signup(client, "writer")
    signup(client, "taken")
    h = auth(a)
    res = client.patch(
        "/api/users/me",
        data={"nickname": "new_name", "bio": "  상상하는 사람  "},
        files={"avatar": ("a.png", png(), "image/png"), "cover": ("c.png", png(), "image/png")},
        headers=h,
    )
    assert res.status_code == 200, res.text
    me = res.json()
    assert me["nickname"] == "new_name" and me["bio"] == "상상하는 사람"
    assert me["avatar_url"].startswith("/uploads/") and me["cover_url"].startswith("/uploads/")
    assert client.get("/api/users/new_name").json()["cover_url"] == me["cover_url"]
    assert client.get("/api/users/writer").status_code == 404  # 옛 주소

    assert (
        client.patch("/api/users/me", data={"nickname": "taken"}, headers=h).json()["detail"][
            "code"
        ]
        == "nickname_taken"
    )
    assert (
        client.patch("/api/users/me", data={"nickname": "a"}, headers=h).json()["detail"]["code"]
        == "invalid_nickname"
    )
    assert (
        client.patch("/api/users/me", data={"bio": "가" * 161}, headers=h).json()["detail"]["code"]
        == "too_long"
    )
    assert (
        client.patch("/api/users/me", data={"remove_cover": "true"}, headers=h).json()["cover_url"]
        is None
    )

    bad = client.post(
        "/api/users/me/password",
        json={"current_password": "nope", "new_password": "newpass123"},
        headers=h,
    )
    assert bad.json()["detail"]["code"] == "wrong_password"
    ok = client.post(
        "/api/users/me/password",
        json={"current_password": "password123", "new_password": "newpass123"},
        headers=h,
    )
    assert ok.status_code == 204
    login = client.post(
        "/api/auth/login", json={"email": "writer@example.com", "password": "newpass123"}
    )
    assert login.status_code == 200


def test_follow_lists(client) -> None:
    a, b, c = signup(client, "writer"), signup(client, "reader"), signup(client, "third")
    client.post("/api/users/writer/follow", headers=auth(b))  # reader → writer
    client.post("/api/users/writer/follow", headers=auth(c))  # third → writer
    client.post("/api/users/third/follow", headers=auth(a))  # writer → third (서로)

    followers = client.get("/api/users/writer/followers", headers=auth(a)).json()["items"]
    assert [f["author"]["nickname"] for f in followers] == ["third", "reader"]  # 최근 순
    by = {f["author"]["nickname"]: f for f in followers}
    # reader: 나를 팔로우하지만 나는 안 함 → [서로 팔로우하기]
    assert by["reader"]["follows_me"] is True and by["reader"]["following"] is False
    assert by["third"]["follows_me"] is True and by["third"]["following"] is True

    following = client.get("/api/users/writer/following", headers=auth(a)).json()["items"]
    assert [f["author"]["nickname"] for f in following] == ["third"]
    assert (
        client.get("/api/users/writer/followers").json()["items"][0]["following"] is False
    )  # 비로그인
