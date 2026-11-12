import io

from PIL import Image
from sqlalchemy import text

from app.infrastructure.core.database import get_engine
from tests.conftest import auth, signup


def post(client, token, **fields):
    data = {"body": "하늘을 나는 학교 버스", "domain": "mobility", **fields}
    files = fields.pop("files", None)
    data.pop("files", None)
    return client.post("/api/imaginations", data=data, files=files, headers=auth(token))


def png_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (32, 18), (109, 40, 217)).save(buf, format="PNG")
    return buf.getvalue()


def test_create_and_detail_with_actions(client) -> None:
    me = signup(client, "writer")
    res = post(client, me, title="드론 버스", desire="아침잠을 더 자고 싶어서", ai_assisted="true")
    assert res.status_code == 201, res.text
    item = res.json()
    assert item["display_title"] == "드론 버스"
    assert item["domain"] == {"slug": "mobility", "name": "Mobility"}
    assert item["ai_assisted"] is True
    assert item["counts"] == {"thunders": 0, "waves": 0, "comments": 0, "quotes": 0, "shakes": 0}
    # 내 글: Thunder·Wave·Shake 는 own_post, 삭제는 가능
    a = item["actions"]
    assert a["thunder"] == {"allowed": False, "reason": "own_post", "remaining": None}
    assert a["shake"]["reason"] == "own_post"
    assert a["delete"]["allowed"] is True

    # 다른 사람이 보면
    other = signup(client, "reader")
    d = client.get(f"/api/imaginations/{item['id']}", headers=auth(other)).json()
    assert d["actions"]["thunder"]["allowed"] is True
    assert d["actions"]["shake"] == {"allowed": True, "reason": None, "remaining": 10}
    assert d["actions"]["delete"]["allowed"] is False

    # 비로그인
    anon = client.get(f"/api/imaginations/{item['id']}").json()
    assert anon["actions"]["thunder"]["reason"] == "login_required"

    # 조회 기록 (최근 본 상상)
    with get_engine().connect() as conn:
        n = conn.execute(text("SELECT count(*) FROM imagination_views")).scalar()
    assert n == 1


def test_title_falls_back_to_first_line(client) -> None:
    me = signup(client, "writer")
    item = post(client, me, body="첫 줄이 제목\n둘째 줄").json()
    assert item["title"] is None
    assert item["display_title"] == "첫 줄이 제목"


def test_length_limits_come_from_policy(client) -> None:
    me = signup(client, "writer")
    assert post(client, me, body="가" * 500).status_code == 201
    res = post(client, me, body="가" * 501)
    assert res.status_code == 400 and res.json()["detail"]["code"] == "too_long"

    # 개인별 예외로 본문 한도를 1000자로 올리면 통과 (F20)
    with get_engine().begin() as conn:
        conn.execute(
            text(
                "INSERT INTO policy_settings (scope, user_id, key, value) "
                "VALUES ('user', :uid, 'limit.body_chars', '1000')"
            ),
            {"uid": me["user"]["id"]},
        )
    assert post(client, me, body="가" * 1000).status_code == 201
    limits = client.get("/api/me/limits", headers=auth(me)).json()
    assert limits["limits"]["body_chars"] == 1000
    assert limits["limits"]["title_chars"] == 40
    assert limits["today"]["posts_used"] == 2


def test_daily_post_limit(client) -> None:
    me = signup(client, "writer")
    with get_engine().begin() as conn:
        conn.execute(
            text(
                "INSERT INTO policy_settings (scope, user_id, key, value) "
                "VALUES ('user', :uid, 'limit.post_daily', '1')"
            ),
            {"uid": me["user"]["id"]},
        )
    assert post(client, me).status_code == 201
    res = post(client, me)
    assert res.status_code == 429 and res.json()["detail"]["code"] == "daily_limit"


def test_validation_errors(client) -> None:
    me = signup(client, "writer")
    assert post(client, me, domain="unknown").json()["detail"]["code"] == "domain_required"
    assert post(client, me, body="   ").json()["detail"]["code"] == "body_required"
    assert client.post("/api/imaginations", data={"body": "x", "domain": "ai"}).status_code == 401


def test_image_upload(client) -> None:
    me = signup(client, "writer")
    res = post(client, me, files={"image": ("a.png", png_bytes(), "image/png")})
    assert res.status_code == 201, res.text
    url = res.json()["image_url"]
    assert url.startswith("/uploads/") and url.endswith(".png")
    assert client.get(url).status_code == 200

    bad = post(client, me, files={"image": ("a.png", b"not an image", "image/png")})
    assert bad.status_code == 400 and bad.json()["detail"]["code"] == "invalid_image"


def test_feed_cursor_and_domain_filter(client) -> None:
    me = signup(client, "writer")
    with get_engine().begin() as conn:  # 하루 한도에 걸리지 않게 직접 넣는다
        for i in range(25):
            conn.execute(
                text(
                    "INSERT INTO imaginations (author_id, body, domain_id, created_at) "
                    "VALUES (:uid, :body, :dom, now() - make_interval(mins => :m))"
                ),
                {"uid": me["user"]["id"], "body": f"상상 {i}", "dom": 1 if i % 5 else 3, "m": i},
            )
    page1 = client.get("/api/feed").json()
    assert len(page1["items"]) == 20 and page1["next_cursor"]
    assert page1["items"][0]["body"] == "상상 0"
    page2 = client.get("/api/feed", params={"cursor": page1["next_cursor"]}).json()
    assert len(page2["items"]) == 5 and page2["next_cursor"] is None
    ids = [x["id"] for x in page1["items"] + page2["items"]]
    assert len(set(ids)) == 25

    space = client.get("/api/feed", params={"domain": "space"}).json()
    assert len(space["items"]) == 5
    assert client.get("/api/feed", params={"tab": "following"}).json() == {
        "items": [],
        "next_cursor": None,
    }
    assert client.get("/api/feed", params={"cursor": "broken"}).status_code == 400


def test_delete_only_own_and_hides(client) -> None:
    me = signup(client, "writer")
    other = signup(client, "reader")
    item = post(client, me).json()
    assert client.delete(f"/api/imaginations/{item['id']}", headers=auth(other)).status_code == 403
    assert client.delete(f"/api/imaginations/{item['id']}", headers=auth(me)).status_code == 204
    assert client.get(f"/api/imaginations/{item['id']}").status_code == 404
    assert client.get("/api/feed").json()["items"] == []


def test_domains(client) -> None:
    res = client.get("/api/domains").json()
    assert [d["name"] for d in res] == [
        "AI",
        "Semiconductor",
        "Space",
        "Mobility",
        "Bio",
        "Energy",
        "Mobile",
        "Life",
    ]
