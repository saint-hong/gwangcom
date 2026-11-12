"""Sprint 2 — 댓글·답글 = 게시글 (kind=comment, v10 반영목록 3장)."""

from tests.conftest import auth, signup


def write(client, token):
    return client.post(
        "/api/imaginations", data={"body": "바다 위 도시", "domain": "life"}, headers=auth(token)
    ).json()


def comment(client, token, target_id, body="좋아요"):
    res = client.post(
        f"/api/imaginations/{target_id}/comments", json={"body": body}, headers=auth(token)
    )
    assert res.status_code == 201, res.text
    return res.json()


def threads(client, item_id, token=None):
    return client.get(
        f"/api/imaginations/{item_id}/comments", headers=auth(token) if token else None
    ).json()


def test_comment_reply_and_counts(client) -> None:
    a, b = signup(client, "writer"), signup(client, "reader")
    item = write(client, a)
    c1 = comment(client, b, item["id"], "첫 댓글")
    c2 = comment(client, b, item["id"], "둘째 댓글")
    assert c1["kind"] == "comment" and c1["root_id"] == item["id"] and c1["parent_id"] == item["id"]
    assert c1["domain"]["slug"] == "life" and c1["reply_to"]["nickname"] == "writer"

    r1 = comment(client, a, c1["id"], "작성자 답글")
    # 답글에 답글을 달아도 같은 댓글 줄(1단계)로 모인다
    r2 = comment(client, b, r1["id"], "답글의 답글")
    assert (
        r1["parent_id"] == c1["id"] and r2["parent_id"] == c1["id"] and r2["root_id"] == item["id"]
    )
    assert r2["reply_to"]["nickname"] == "reader"

    # 댓글 수 = 답글 포함, 댓글 자체의 수 = 답글 수
    assert client.get(f"/api/imaginations/{item['id']}").json()["counts"]["comments"] == 4
    data = threads(client, item["id"])
    assert [t["id"] for t in data["items"]] == [c2["id"], c1["id"]]  # 최신순
    t1 = data["items"][1]
    assert t1["comment"]["counts"]["comments"] == 2
    assert [r["id"] for r in t1["replies"]] == [r1["id"], r2["id"]]  # 답글은 오래된 순

    # 댓글은 피드와 하루 상상 쓰기 수에 들어가지 않는다
    assert [x["id"] for x in client.get("/api/feed").json()["items"]] == [item["id"]]
    assert client.get("/api/me/limits", headers=auth(b)).json()["today"]["posts_used"] == 0


def test_comment_has_same_actions(client) -> None:
    a, b = signup(client, "writer"), signup(client, "reader")
    item = write(client, a)
    c = comment(client, b, item["id"])
    # 댓글 작성자에게는 own_post, 상상 작성자는 댓글에 Thunder 가능
    mine = threads(client, item["id"], b)["items"][0]["comment"]
    assert mine["actions"]["thunder"]["reason"] == "own_post"
    res = client.post(f"/api/imaginations/{c['id']}/thunder", headers=auth(a)).json()
    assert res["counts"]["thunders"] == 1
    t = threads(client, item["id"], a)["items"][0]["comment"]
    assert t["my"]["thunder"] is True
    assert client.post(f"/api/imaginations/{c['id']}/wave", headers=auth(a)).json()["my"]["wave"]
    # 비로그인은 읽기만
    assert (
        threads(client, item["id"])["items"][0]["comment"]["actions"]["comment"]["reason"]
        == "login_required"
    )
    assert (
        client.post(f"/api/imaginations/{item['id']}/comments", json={"body": "x"}).status_code
        == 401
    )
    # 댓글 id 로 상세를 열면 root_id 로 원글을 알 수 있다
    assert client.get(f"/api/imaginations/{c['id']}").json()["root_id"] == item["id"]


def test_delete_comment_keeps_place_when_replies(client) -> None:
    a, b = signup(client, "writer"), signup(client, "reader")
    item = write(client, a)
    c1 = comment(client, b, item["id"], "답글 있는 댓글")
    comment(client, a, c1["id"], "답글")
    c2 = comment(client, b, item["id"], "혼자인 댓글")

    assert client.delete(f"/api/imaginations/{c1['id']}", headers=auth(a)).status_code == 403
    assert client.delete(f"/api/imaginations/{c1['id']}", headers=auth(b)).status_code == 204
    assert client.delete(f"/api/imaginations/{c2['id']}", headers=auth(b)).status_code == 204

    data = threads(client, item["id"])
    assert len(data["items"]) == 1
    assert data["items"][0]["id"] == c1["id"] and data["items"][0]["comment"] is None
    assert len(data["items"][0]["replies"]) == 1
    assert client.get(f"/api/imaginations/{item['id']}").json()["counts"]["comments"] == 1


def test_comment_validation(client) -> None:
    a = signup(client, "writer")
    item = write(client, a)
    res = client.post(
        f"/api/imaginations/{item['id']}/comments", json={"body": "가" * 301}, headers=auth(a)
    )
    assert res.json()["detail"]["code"] == "too_long"
    res = client.post(
        f"/api/imaginations/{item['id']}/comments", json={"body": "  "}, headers=auth(a)
    )
    assert res.json()["detail"]["code"] == "body_required"
    assert client.get("/api/imaginations/999999/comments").status_code == 404
