"""Sprint 6-C — 이번 주 질문 (기획안 v11 F13 · A3)."""

from datetime import timedelta

from app.shared.time import now_utc
from tests.conftest import auth, signup
from tests.test_admin_moderation import make_admin


def iso(delta_days: float) -> str:
    return (now_utc() + timedelta(days=delta_days)).isoformat()


def make_prompt(
    client, admin, title="10년 뒤 학교는?", start=-1.0, end: float | None = 6.0, **extra
):
    res = client.post(
        "/api/admin/prompts",
        json={
            "title": title,
            "starts_at": iso(start),
            "ends_at": iso(end) if end is not None else None,
            **extra,
        },
        headers=auth(admin),
    )
    assert res.status_code == 201, res.text
    return res.json()


def post(client, token, prompt_id=None, body="하늘을 나는 학교"):
    data = {"body": body, "domain": "life"}
    if prompt_id is not None:
        data["prompt_id"] = str(prompt_id)
    return client.post("/api/imaginations", data=data, headers=auth(token))


def test_current_prompt_and_answer(client) -> None:
    admin, user = signup(client, "boss"), signup(client, "writer")
    make_admin(admin)
    assert client.get("/api/prompts/current").json() is None

    old = make_prompt(client, admin, "지난 질문", start=-10, end=-3)
    later = make_prompt(client, admin, "다음 질문", start=3, end=10)
    now = make_prompt(client, admin, "지금 질문", start=-1, end=None)
    off = make_prompt(client, admin, "꺼진 질문", start=-1, end=5, is_active=False)
    assert [old["status"], later["status"], now["status"], off["status"]] == [
        "ended",
        "scheduled",
        "open",
        "off",
    ]
    cur = client.get("/api/prompts/current").json()
    assert cur["id"] == now["id"] and cur["open"] is True and cur["answer_count"] == 0

    # 지금 질문에 답하면 prompt_id 가 붙고 응답에 질문이 보인다
    res = post(client, user, now["id"])
    assert res.status_code == 201, res.text
    assert res.json()["prompt"] == {"id": now["id"], "title": "지금 질문"}
    assert client.get("/api/prompts/current").json()["answer_count"] == 1
    # 끝난 · 예정 · 꺼진 · 없는 질문으로는 답할 수 없다
    for pid in (old["id"], later["id"], off["id"], 999999):
        bad = post(client, user, pid)
        assert bad.status_code == 400 and bad.json()["detail"]["code"] == "prompt_closed"
    # 글쓰기 화면 질문 카드: 끝난 질문은 open=false, 예정 · 꺼진 질문은 404
    assert client.get(f"/api/prompts/{old['id']}").json()["open"] is False
    assert client.get(f"/api/prompts/{later['id']}").status_code == 404
    assert client.get(f"/api/prompts/{off['id']}").status_code == 404
    # 자유 상상은 prompt 가 없다
    assert post(client, user).json()["prompt"] is None


def test_admin_list_update_delete(client) -> None:
    admin, user = signup(client, "boss"), signup(client, "writer")
    make_admin(admin)
    a = make_prompt(client, admin, "우주 여행", start=-2, end=5)
    b = make_prompt(client, admin, "바다 도시", start=1, end=8)
    post(client, user, a["id"])

    def items(query=""):
        res = client.get(f"/api/admin/prompts{query}", headers=auth(admin))
        assert res.status_code == 200, res.text
        return res.json()

    assert [p["id"] for p in items()["items"]] == [b["id"], a["id"]]  # 시작 늦은 순
    assert [p["id"] for p in items("?status=open")["items"]] == [a["id"]]
    assert [p["id"] for p in items("?q=바다")["items"]] == [b["id"]]
    top = items("?sort=answers&order=desc")["items"][0]
    assert top["id"] == a["id"] and top["answer_count"] == 1 and top["created_by"] == "boss"
    # 이 질문에 답한 상상 (A4 목록 재사용)
    answers = client.get(f"/api/admin/imaginations?prompt_id={a['id']}", headers=auth(admin)).json()
    assert answers["total"] == 1

    # 고치기 · 끄기 · 기간 검사
    off = client.patch(
        f"/api/admin/prompts/{a['id']}", json={"is_active": False}, headers=auth(admin)
    )
    assert off.json()["status"] == "off"
    assert client.get("/api/prompts/current").json() is None
    bad = client.patch(
        f"/api/admin/prompts/{b['id']}", json={"ends_at": iso(0)}, headers=auth(admin)
    )
    assert bad.status_code == 400 and bad.json()["detail"]["code"] == "invalid_period"
    edited = client.patch(
        f"/api/admin/prompts/{b['id']}",
        json={"title": "바다 위 도시", "ends_at": None},
        headers=auth(admin),
    ).json()
    assert edited["title"] == "바다 위 도시" and edited["ends_at"] is None

    # 답한 상상이 있으면 못 지우고, 없으면 지운다
    has = client.delete(f"/api/admin/prompts/{a['id']}", headers=auth(admin))
    assert has.status_code == 400 and has.json()["detail"]["code"] == "has_answers"
    assert client.delete(f"/api/admin/prompts/{b['id']}", headers=auth(admin)).status_code == 204
    assert client.get("/api/admin/prompts", headers=auth(user)).status_code == 403
