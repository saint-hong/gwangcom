"""Sprint 6-B — 기본 정책 · 등급 · 사용자 관리 · 변경 기록 (기획안 v11 F20 · A5 · A6)."""

from datetime import timedelta

from app.shared.time import now_utc
from tests.conftest import auth, signup
from tests.test_admin_moderation import make_admin, write


def tier_id(data: dict, name: str) -> int:
    return next(t["id"] for t in data["tiers"] if t["name"] == name)


def test_policy_view_and_tiers(client) -> None:
    admin = signup(client, "boss")
    make_admin(admin)
    data = client.get("/api/admin/policy", headers=auth(admin)).json()
    assert [t["name"] for t in data["tiers"]] == ["기본", "활발한 Dreamer", "테스트 그룹"]
    assert data["global_values"]["limit.shake_daily"] == 10
    assert data["tier_values"] == {}  # 처음에는 모든 등급이 전체 기본값을 따른다
    assert {k["key"] for k in data["keys"]} >= {"limit.shake_daily", "perm.can_shake"}

    # 등급 만들기 · 이름 중복 · 기본 바꾸기 · 지우기
    made = client.post("/api/admin/tiers", json={"name": "새 등급"}, headers=auth(admin))
    assert made.status_code == 201
    new_id = tier_id(made.json(), "새 등급")
    dup = client.post("/api/admin/tiers", json={"name": "새 등급"}, headers=auth(admin))
    assert dup.status_code == 409
    after = client.patch(
        f"/api/admin/tiers/{new_id}", json={"is_default": True}, headers=auth(admin)
    ).json()
    assert [t["name"] for t in after["tiers"] if t["is_default"]] == ["새 등급"]
    assert client.delete(f"/api/admin/tiers/{new_id}", headers=auth(admin)).status_code == 400
    basic = tier_id(after, "기본")
    client.patch(f"/api/admin/tiers/{basic}", json={"is_default": True}, headers=auth(admin))
    gone = client.delete(f"/api/admin/tiers/{new_id}", headers=auth(admin)).json()
    assert "새 등급" not in [t["name"] for t in gone["tiers"]]


def test_global_and_tier_values_apply_and_are_logged(client) -> None:
    admin, user = signup(client, "boss"), signup(client, "writer")
    make_admin(admin)
    data = client.get("/api/admin/policy", headers=auth(admin)).json()
    active = tier_id(data, "활발한 Dreamer")

    def put(body):
        return client.put("/api/admin/policy", json=body, headers=auth(admin))

    # 전체 기본값: 범위 검사 · 비울 수 없음
    assert put({"scope": "global", "key": "limit.shake_daily", "value": 12}).status_code == 200
    assert client.get("/api/me/limits", headers=auth(user)).json()["limits"]["shake_daily"] == 12
    bad = put({"scope": "global", "key": "limit.shake_daily", "value": -1})
    assert bad.status_code == 400 and bad.json()["detail"]["code"] == "invalid_value"
    assert put({"scope": "global", "key": "limit.shake_daily", "value": None}).status_code == 400
    assert put({"scope": "global", "key": "perm.can_shake", "value": 3}).status_code == 400
    assert put({"scope": "global", "key": "nope", "value": 1}).status_code == 400

    # 등급 값: 그 등급 사용자에게만, null 이면 지우고 전체 기본값을 따른다
    res = put({"scope": "tier", "tier_id": active, "key": "limit.shake_daily", "value": 30})
    assert res.json()["tier_values"][str(active)] == {"limit.shake_daily": 30}
    client.patch(
        f"/api/admin/users/{user['user']['id']}", json={"tier_id": active}, headers=auth(admin)
    )
    assert client.get("/api/me/limits", headers=auth(user)).json()["limits"]["shake_daily"] == 30
    put({"scope": "tier", "tier_id": active, "key": "limit.shake_daily", "value": None})
    assert client.get("/api/me/limits", headers=auth(user)).json()["limits"]["shake_daily"] == 12

    logs = client.get("/api/admin/policy", headers=auth(admin)).json()["logs"]
    assert [(lg["target_scope"], lg["old_value"], lg["new_value"]) for lg in logs] == [
        ("tier", 30, None),
        ("tier", None, 30),
        ("global", 10, 12),
    ]
    assert logs[0]["admin"] == "boss" and logs[0]["tier"] == "활발한 Dreamer"


def test_user_list_detail_and_exception(client) -> None:
    """완료 기준: 특정 사용자 Shake 한도를 20회로 올리면 그 사용자 화면(actions · limits)에 반영."""
    admin, a, b = signup(client, "boss"), signup(client, "writer"), signup(client, "other")
    make_admin(admin)
    write(client, a)
    target = write(client, b, "남의 상상")
    uid = a["user"]["id"]

    users = client.get("/api/admin/users?q=writer", headers=auth(admin)).json()
    assert [u["nickname"] for u in users["items"]] == ["writer"]
    assert users["items"][0]["posts"] == 1 and users["items"][0]["tier"] == "기본"
    sorted_ = client.get("/api/admin/users?sort=nickname&order=asc", headers=auth(admin)).json()
    assert [u["nickname"] for u in sorted_["items"]] == ["boss", "other", "writer"]
    admins = client.get("/api/admin/users?role=admin", headers=auth(admin)).json()
    assert [u["nickname"] for u in admins["items"]] == ["boss"]

    detail = client.get(f"/api/admin/users/{uid}", headers=auth(admin)).json()
    shake = next(r for r in detail["limits"] if r["key"] == "limit.shake_daily")
    assert (shake["value"], shake["source"]) == (10, "global")
    assert detail["activity"]["posts"] == 1

    res = client.put(
        f"/api/admin/users/{uid}/policy",
        json={"key": "limit.shake_daily", "value": 20},
        headers=auth(admin),
    )
    assert res.status_code == 200, res.text
    shake = next(r for r in res.json()["limits"] if r["key"] == "limit.shake_daily")
    assert (shake["value"], shake["source"], shake["exception"]) == (20, "user", 20)
    # 그 사용자 화면: 남의 상상 카드의 Shake 남은 횟수 · 내 한도
    card = client.get(f"/api/imaginations/{target['id']}", headers=auth(a)).json()
    assert card["actions"]["shake"]["remaining"] == 20
    assert client.get("/api/me/limits", headers=auth(a)).json()["limits"]["shake_daily"] == 20

    # 만료일은 미래만 · 해제하면 기본값 · 기록이 남는다
    past = (now_utc() - timedelta(days=1)).isoformat()
    assert (
        client.put(
            f"/api/admin/users/{uid}/policy",
            json={"key": "limit.shake_daily", "value": 20, "expires_at": past},
            headers=auth(admin),
        ).status_code
        == 400
    )
    cleared = client.delete(f"/api/admin/users/{uid}/policy/limit.shake_daily", headers=auth(admin))
    shake = next(r for r in cleared.json()["limits"] if r["key"] == "limit.shake_daily")
    assert (shake["value"], shake["exception"]) == (10, None)
    assert [(lg["key"], lg["new_value"]) for lg in cleared.json()["logs"]] == [
        ("limit.shake_daily", None),
        ("limit.shake_daily", 20),
    ]


def test_role_and_tier_changes(client) -> None:
    admin, a = signup(client, "boss"), signup(client, "writer")
    make_admin(admin)
    uid = a["user"]["id"]
    data = client.get("/api/admin/policy", headers=auth(admin)).json()
    test_group = tier_id(data, "테스트 그룹")

    res = client.patch(
        f"/api/admin/users/{uid}",
        json={"role": "admin", "tier_id": test_group},
        headers=auth(admin),
    ).json()
    assert res["user"]["role"] == "admin" and res["user"]["tier"] == "테스트 그룹"
    assert {lg["key"] for lg in res["logs"]} == {"user.role", "user.tier"}
    back = client.patch(f"/api/admin/users/{uid}", json={"tier_id": None}, headers=auth(admin))
    assert back.json()["user"]["tier"] == "기본"
    # 내 운영자 역할은 뺄 수 없다
    me = client.patch(
        f"/api/admin/users/{admin['user']['id']}", json={"role": "user"}, headers=auth(admin)
    )
    assert me.status_code == 400 and me.json()["detail"]["code"] == "self_role"
    # 일반 사용자는 막힌다
    assert client.get("/api/admin/users", headers=auth(signup(client, "x1"))).status_code == 403
