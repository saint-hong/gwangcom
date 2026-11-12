"""Sprint 5-B — Shake it: 선택 창 · 섞어서 게시 · 규칙 · 실패 처리 · 계보 · 하루 횟수."""

from sqlalchemy import select, text

from app.domains.imaginations.models import Imagination
from app.domains.shake import service as shake_service
from app.domains.shake.models import ImaginationParent, ShakeAttempt
from app.domains.tags.service import tag_all
from app.infrastructure.core.database import get_engine, get_sessionmaker
from app.infrastructure.llm import router
from app.infrastructure.llm.providers.base import LlmError
from tests.conftest import auth, signup


def write(client, token, body="하늘을 나는 학교 버스", domain="mobility"):
    res = client.post(
        "/api/imaginations", data={"body": body, "domain": domain}, headers=auth(token)
    )
    assert res.status_code == 201, res.text
    return res.json()


def shake(client, token, target, mine, ms=1500):
    return client.post(
        "/api/shake",
        json={"target_id": target["id"], "mine_id": mine["id"], "selection_ms": ms},
        headers=auth(token),
    )


def test_shake_publishes_blend(client) -> None:
    a, b = signup(client, "alice"), signup(client, "bob")
    theirs = write(client, a, "하늘을 나는 학교 버스", "mobility")
    mine = write(client, b, "달에 있는 기숙사", "space")
    client.post(f"/api/imaginations/{mine['id']}/comments", json={"body": "댓글"}, headers=auth(b))

    # 선택 창: 상대 글 + 내 상상(댓글 제외) + 남은 횟수
    cand = client.get(f"/api/shake/candidates?target_id={theirs['id']}", headers=auth(b)).json()
    assert cand["target"]["id"] == theirs["id"]
    assert [i["id"] for i in cand["items"]] == [mine["id"]]
    assert (cand["remaining"], cand["limit"]) == (10, 10)

    res = shake(client, b, theirs, mine)
    assert res.status_code == 201, res.text
    blend = res.json()
    assert blend["kind"] == "blend" and blend["author"]["nickname"] == "bob"
    assert blend["ai_assisted"] is True
    assert blend["domain"]["slug"] == "mobility" and blend["secondary_domain"]["slug"] == "space"
    assert [s["id"] for s in blend["sources"]] == [theirs["id"], mine["id"]]
    assert blend["actions"]["shake"]["reason"] == "own_post"

    # 재료 글의 Shake 수 · 상대에게 알림 · 남은 횟수 · 서재 Shake it 탭 · 홈 피드 맨 위
    detail = client.get(f"/api/imaginations/{theirs['id']}", headers=auth(a)).json()
    assert detail["counts"]["shakes"] == 1
    notes = client.get("/api/notifications", headers=auth(a)).json()["items"]
    assert notes[0]["type"] == "shaken" and notes[0]["item"]["id"] == blend["id"]
    cand = client.get(f"/api/shake/candidates?target_id={theirs['id']}", headers=auth(b)).json()
    assert cand["remaining"] == 9 and cand["items"][0]["id"] == blend["id"]
    lib = client.get("/api/me/library?tab=shakes", headers=auth(b)).json()["items"]
    assert [i["id"] for i in lib] == [blend["id"]]
    feed = client.get("/api/feed?tab=latest", headers=auth(b)).json()["items"]
    assert feed[0]["id"] == blend["id"]

    with get_sessionmaker()() as db:
        att = db.scalars(select(ShakeAttempt)).one()
        assert (att.status, att.published_id, att.selection_ms) == ("published", blend["id"], 1500)
        assert set(att.ai_elements) == {"tech", "desire"}
        assert db.get(Imagination, blend["id"]).tagging_status == "done"  # 혼합 글도 태깅


def test_shake_rules(client) -> None:
    a, b = signup(client, "alice"), signup(client, "bob")
    theirs = write(client, a)
    mine = write(client, b)
    other_of_a = write(client, a, "바다 속 도서관")
    comment = client.post(
        f"/api/imaginations/{theirs['id']}/comments", json={"body": "댓글"}, headers=auth(a)
    ).json()

    # 내 글끼리 · 댓글 · 남의 글을 내 재료로 · Shake 막힌 글
    assert shake(client, b, mine, mine).json()["detail"]["code"] == "own_post"
    assert shake(client, b, comment, mine).json()["detail"]["code"] == "not_material"
    assert shake(client, b, theirs, other_of_a).json()["detail"]["code"] == "mine_required"
    detail = client.get(f"/api/imaginations/{comment['id']}", headers=auth(b)).json()
    assert detail["actions"]["shake"]["reason"] == "not_material"  # 화면도 같은 규칙
    with get_engine().begin() as conn:
        conn.execute(
            text("UPDATE imaginations SET shake_allowed = false WHERE id = :i"),
            {"i": other_of_a["id"]},
        )
    assert shake(client, b, other_of_a, mine).json()["detail"]["code"] == "shake_disabled"
    assert client.post("/api/shake", json={"target_id": 1, "mine_id": 2}).status_code == 401

    # 하루 횟수: 개인 예외로 1번 → 두 번째는 429, actions 도 daily_limit
    me = client.get("/api/auth/me", headers=auth(b)).json()
    with get_engine().begin() as conn:
        conn.execute(
            text(
                "INSERT INTO policy_settings (scope, user_id, key, value) "
                "VALUES ('user', :u, 'limit.shake_daily', '1')"
            ),
            {"u": me["id"]},
        )
    assert shake(client, b, theirs, mine).status_code == 201
    res = shake(client, b, theirs, mine)
    assert res.status_code == 429 and res.json()["detail"]["code"] == "daily_limit"
    detail = client.get(f"/api/imaginations/{theirs['id']}", headers=auth(b)).json()
    assert detail["actions"]["shake"] == {"allowed": False, "reason": "daily_limit", "remaining": 0}


def test_ai_failure_does_not_publish_or_count(client, monkeypatch) -> None:
    a, b = signup(client, "alice"), signup(client, "bob")
    theirs, mine = write(client, a), write(client, b)

    class Broken:
        name = "fake"

        def generate_json(self, **_):
            raise LlmError("시간 초과")

    monkeypatch.setitem(router._providers, "fake", Broken())
    res = shake(client, b, theirs, mine)
    assert res.status_code == 502 and res.json()["detail"]["code"] == "shake_failed"
    monkeypatch.undo()

    # 출력 검사: 처음엔 빈 제목 → 한 번 다시 만들어 성공
    real = shake_service.run_blend
    calls = {"n": 0}

    def flaky(db, x, y):
        calls["n"] += 1
        out = real(db, x, y)
        return {**out, "title": ""} if calls["n"] == 1 else out

    monkeypatch.setattr(shake_service, "run_blend", flaky)
    assert shake(client, b, theirs, mine).status_code == 201 and calls["n"] == 2

    # 두 번 다 걸리면 게시하지 않는다
    monkeypatch.setattr(shake_service, "run_blend", lambda db, x, y: {"title": ""})
    assert shake(client, b, theirs, mine).status_code == 502

    with get_sessionmaker()() as db:
        statuses = [s for (s,) in db.execute(select(ShakeAttempt.status).order_by(ShakeAttempt.id))]
        blends = db.scalars(select(Imagination).where(Imagination.kind == "blend")).all()
    assert statuses == ["failed", "published", "failed"] and len(blends) == 1
    cand = client.get(f"/api/shake/candidates?target_id={theirs['id']}", headers=auth(b)).json()
    assert cand["remaining"] == 9  # 실패는 세지 않는다


def test_lineage_three_generations_and_delete(client) -> None:
    a, b, c = signup(client, "alice"), signup(client, "bob"), signup(client, "carol")
    x, y, z = write(client, a), write(client, b, "달 기숙사"), write(client, c, "바다 도서관")
    first = shake(client, b, x, y).json()  # 1세대 혼합 (bob)
    second = shake(client, c, first, z).json()  # 혼합을 다시 섞음 (carol)
    assert [s["id"] for s in second["sources"]] == [first["id"], z["id"]]
    with get_sessionmaker()() as db:
        edges = {(p.parent_id, p.child_id) for p in db.scalars(select(ImaginationParent))}
    assert edges == {
        (x["id"], first["id"]),
        (y["id"], first["id"]),
        (first["id"], second["id"]),
        (z["id"], second["id"]),
    }

    # 혼합 글을 지우면 재료 글의 Shake 수가 돌아오고, 남은 혼합 글의 재료 칸은 "삭제됨"
    assert client.delete(f"/api/imaginations/{first['id']}", headers=auth(b)).status_code == 204
    assert client.get(f"/api/imaginations/{x['id']}").json()["counts"]["shakes"] == 0
    src = client.get(f"/api/imaginations/{second['id']}").json()["sources"]
    assert src[0] == {**src[0], "id": first["id"], "deleted": True}


def test_tag_all_stops_after_repeated_failures(client, monkeypatch) -> None:
    a = signup(client, "alice")
    for i in range(5):
        write(client, a, f"상상 {i}")
    with get_engine().begin() as conn:
        conn.execute(text("UPDATE imaginations SET tagging_status = 'pending'"))
        conn.execute(text("DELETE FROM llm_calls"))

    class Broken:
        name = "fake"

        def generate_json(self, **_):
            raise LlmError("401")

    monkeypatch.setitem(router._providers, "fake", Broken())
    with get_sessionmaker()() as db:
        assert tag_all(db) == (0, 5)
    with get_engine().connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM llm_calls")).scalar() == 3
