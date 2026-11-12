"""Sprint 6-A — 운영자 게시물 관리 · 숨김 (기획안 v11 F19 · A4)."""

from sqlalchemy import select

from app.domains.admin.models import ModerationLog
from app.domains.imaginations.models import Imagination
from app.domains.users.models import User
from app.infrastructure.core.database import get_sessionmaker
from tests.conftest import auth, signup


def make_admin(token: dict) -> None:
    with get_sessionmaker()() as db:
        db.get(User, token["user"]["id"]).role = "admin"
        db.commit()


def write(client, token, body="하늘을 나는 학교 버스", domain="mobility"):
    res = client.post(
        "/api/imaginations", data={"body": body, "domain": domain}, headers=auth(token)
    )
    assert res.status_code == 201, res.text
    return res.json()


def hide(client, admin, item_id, status="hidden", reason=None):
    return client.patch(
        f"/api/admin/imaginations/{item_id}",
        json={"status": status, "reason": reason},
        headers=auth(admin),
    )


def test_admin_only(client) -> None:
    user = signup(client, "writer")
    item = write(client, user)
    assert client.get("/api/admin/imaginations").status_code == 401
    res = client.get("/api/admin/imaginations", headers=auth(user))
    assert res.status_code == 403 and res.json()["detail"]["code"] == "admin_only"
    assert hide(client, user, item["id"]).status_code == 403


def test_list_filters_and_search(client) -> None:
    admin, a = signup(client, "boss"), signup(client, "writer")
    make_admin(admin)
    first = write(client, a, "바다 위 자전거")
    second = write(client, a, "하늘을 나는 버스")
    comment = client.post(
        f"/api/imaginations/{first['id']}/comments", json={"body": "좋아요"}, headers=auth(admin)
    ).json()
    hide(client, admin, second["id"])

    def ids(query: str) -> list[int]:
        res = client.get(f"/api/admin/imaginations{query}", headers=auth(admin))
        assert res.status_code == 200, res.text
        return [i["id"] for i in res.json()["items"]]

    assert ids("") == [comment["id"], second["id"], first["id"]]  # 최신순, 댓글 포함
    assert ids("?status=hidden") == [second["id"]]
    assert ids("?kind=comment") == [comment["id"]]
    assert ids("?q=자전거") == [first["id"]]
    assert ids("?q=writer") == [second["id"], first["id"]]  # 작성자 닉네임으로도 찾는다

    # 정렬: 칸마다 오름차순 · 내림차순 (같은 값이면 최신 먼저)
    client.post(f"/api/imaginations/{first['id']}/thunder", headers=auth(admin))
    assert ids("?sort=thunders&order=desc")[0] == first["id"]
    assert ids("?sort=created&order=asc") == [first["id"], second["id"], comment["id"]]
    assert ids("?sort=kind&order=desc")[0] == comment["id"]  # 원본 → 인용 → Shake it → 댓글
    assert ids("?sort=status&order=desc")[0] == second["id"]  # 숨김 먼저
    assert ids("?sort=author&order=asc")[0] == comment["id"]  # boss < writer
    assert ids("?sort=reactions&order=desc")[0] == first["id"]  # Thunder 1 + 댓글 1
    bad = client.get("/api/admin/imaginations?sort=nope", headers=auth(admin))
    assert bad.status_code == 422

    # 페이지 번호: 한 페이지 20 · 50 · 100개, 범위를 넘으면 마지막 페이지
    for i in range(22):
        write(client, a, f"상상 {i}")
    page = client.get("/api/admin/imaginations?page=2&size=20", headers=auth(admin)).json()
    assert (page["total"], page["page"], page["size"], len(page["items"])) == (25, 2, 20, 5)
    assert client.get("/api/admin/imaginations?page=9", headers=auth(admin)).json()["page"] == 2
    bad = client.get("/api/admin/imaginations?size=7", headers=auth(admin))
    assert bad.status_code == 400 and bad.json()["detail"]["code"] == "invalid_size"


def test_hide_and_unhide(client) -> None:
    admin, a, b = signup(client, "boss"), signup(client, "writer"), signup(client, "other")
    make_admin(admin)
    item = write(client, a)
    quote = client.post(
        f"/api/imaginations/{item['id']}/quote", json={"body": "저도요"}, headers=auth(b)
    ).json()

    res = hide(client, admin, quote["id"], reason="  테스트로 숨김 ")
    assert res.status_code == 200, res.text
    row = res.json()
    assert row["status"] == "hidden"
    assert row["last_moderation"]["action"] == "hide"
    assert row["last_moderation"]["admin"] == "boss"
    assert row["last_moderation"]["reason"] == "테스트로 숨김"

    # 피드에서 빠지고, 원글의 인용 수도 줄어든다
    feed_ids = [i["id"] for i in client.get("/api/feed?tab=latest").json()["items"]]
    assert quote["id"] not in feed_ids
    assert client.get(f"/api/imaginations/{item['id']}").json()["counts"]["quotes"] == 0

    # 상세: 다른 사람 · 비로그인은 404, 작성자 · 운영자는 hidden=true (반응은 막히고 작성자는 지울 수 있다)
    assert client.get(f"/api/imaginations/{quote['id']}").status_code == 404
    assert client.get(f"/api/imaginations/{quote['id']}", headers=auth(a)).status_code == 404
    mine = client.get(f"/api/imaginations/{quote['id']}", headers=auth(b)).json()
    assert mine["hidden"] is True
    assert mine["actions"]["comment"]["allowed"] is False
    assert mine["actions"]["delete"]["allowed"] is True
    assert client.get(f"/api/imaginations/{quote['id']}", headers=auth(admin)).json()["hidden"]
    # 숨긴 글에는 반응할 수 없다
    assert (
        client.post(f"/api/imaginations/{quote['id']}/thunder", headers=auth(a)).status_code == 404
    )

    # 줄을 펼친 자세한 내용: 숨긴 글도 보이고, 조회 기록(최근 본 상상)은 남기지 않는다
    opened = client.get(f"/api/admin/imaginations/{quote['id']}", headers=auth(admin))
    assert opened.status_code == 200 and opened.json()["hidden"] is True
    assert client.get(f"/api/admin/imaginations/{quote['id']}", headers=auth(a)).status_code == 403
    recent = client.get("/api/me/library?tab=recent", headers=auth(admin)).json()["items"]
    assert quote["id"] not in [i["id"] for i in recent]

    # 다시 보이기 → 피드 · 인용 수 되돌아옴, 기록은 2줄
    again = hide(client, admin, quote["id"], status="visible").json()
    assert again["status"] == "visible" and again["last_moderation"]["action"] == "unhide"
    assert client.get(f"/api/imaginations/{item['id']}").json()["counts"]["quotes"] == 1
    assert client.get(f"/api/imaginations/{quote['id']}").json()["hidden"] is False
    # 같은 상태로 다시 바꿔도 기록이 늘지 않는다
    hide(client, admin, quote["id"], status="visible")
    with get_sessionmaker()() as db:
        actions = list(
            db.scalars(
                select(ModerationLog.action)
                .where(ModerationLog.imagination_id == quote["id"])
                .order_by(ModerationLog.id)
            )
        )
    assert actions == ["hide", "unhide"]


def test_author_can_delete_hidden_post_and_counts_stay_right(client) -> None:
    admin, a, b = signup(client, "boss"), signup(client, "writer"), signup(client, "other")
    make_admin(admin)
    item = write(client, a)
    comment = client.post(
        f"/api/imaginations/{item['id']}/comments", json={"body": "멋져요"}, headers=auth(b)
    ).json()
    hide(client, admin, comment["id"])
    assert client.get(f"/api/imaginations/{item['id']}").json()["counts"]["comments"] == 0

    # 숨긴 내 댓글을 지워도 댓글 수가 두 번 줄지 않는다
    assert client.delete(f"/api/imaginations/{comment['id']}", headers=auth(b)).status_code == 204
    assert client.get(f"/api/imaginations/{item['id']}").json()["counts"]["comments"] == 0
    with get_sessionmaker()() as db:
        assert db.get(Imagination, comment["id"]).status == "deleted"
    # 지운 글은 운영자도 바꿀 수 없다
    assert hide(client, admin, comment["id"], status="visible").status_code == 404
