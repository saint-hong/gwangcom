"""Sprint 6-E — Observe Note (운영자 인사이트 글: 만들기 · 고치기 · 지우기 · 이미지, 공개 목록 · 상세)."""

from tests.conftest import auth, signup
from tests.test_admin_moderation import make_admin
from tests.test_imaginations import png_bytes

BODY = "## 반복된 조합\n돌봄 로봇 상상이 많았어요.\n\n![돌봄 로봇 상상 모음](/uploads/x.png)\n\n## 운영자 해석\n..."


def test_note_create_publish_edit_delete(client) -> None:
    admin, user = signup(client, "boss"), signup(client, "reader")
    make_admin(admin)
    h = auth(admin)

    # 운영자만 쓸 수 있다
    assert (
        client.post("/api/admin/notes", json={"title": "x"}, headers=auth(user)).status_code == 403
    )

    # 임시 저장: 번호 없음, 공개 목록 · 상세에 안 보임 (운영자는 미리 볼 수 있음)
    res = client.post(
        "/api/admin/notes",
        json={"title": "돌봄 로봇", "lead": "한 줄 요약", "body_md": BODY},
        headers=h,
    )
    assert res.status_code == 201, res.text
    draft = res.json()
    assert (draft["status"], draft["number"], draft["author"]["nickname"]) == (
        "draft",
        None,
        "boss",
    )
    assert client.get("/api/notes").json()["items"] == []
    assert client.get(f"/api/notes/{draft['id']}").status_code == 404
    assert client.get(f"/api/notes/{draft['id']}", headers=h).status_code == 200

    # 발행: 번호 #1, 누구나 읽음
    pub = client.patch(
        f"/api/admin/notes/{draft['id']}", json={"status": "published"}, headers=h
    ).json()
    assert (pub["status"], pub["number"], pub["edited"]) == ("published", 1, False)
    assert pub["published_at"]
    listed = client.get("/api/notes").json()["items"]
    assert [n["id"] for n in listed] == [draft["id"]] and "body_md" not in listed[0]
    detail = client.get(f"/api/notes/{draft['id']}").json()
    assert detail["body_md"] == BODY and detail["lead"] == "한 줄 요약"

    # 바로 발행한 두 번째 노트는 #2
    second = client.post(
        "/api/admin/notes", json={"title": "두 번째", "status": "published"}, headers=h
    ).json()
    assert second["number"] == 2
    assert [n["number"] for n in client.get("/api/notes").json()["items"]] == [2, 1]

    # 고치기 (발행한 글도) · 요약 지우기 · 발행 취소 뒤 다시 발행해도 번호 그대로
    edit = client.patch(
        f"/api/admin/notes/{draft['id']}",
        json={"title": "돌봄 로봇 (고침)", "lead": None},
        headers=h,
    ).json()
    assert (edit["title"], edit["lead"], edit["number"]) == ("돌봄 로봇 (고침)", None, 1)
    client.patch(f"/api/admin/notes/{draft['id']}", json={"status": "draft"}, headers=h)
    assert [n["number"] for n in client.get("/api/notes").json()["items"]] == [2]
    again = client.patch(
        f"/api/admin/notes/{draft['id']}", json={"status": "published"}, headers=h
    ).json()
    assert again["number"] == 1

    # 운영자 목록: 임시 저장 포함 전체
    admin_list = client.get("/api/admin/notes", headers=h).json()
    assert admin_list["total"] == 2

    # 지우기 (발행한 글도). 다른 사람은 못 지움
    assert client.delete(f"/api/admin/notes/{second['id']}", headers=auth(user)).status_code == 403
    assert client.delete(f"/api/admin/notes/{second['id']}", headers=h).status_code == 204
    assert client.get(f"/api/notes/{second['id']}").status_code == 404
    assert client.get("/api/admin/notes", headers=h).json()["total"] == 1


def test_note_image_upload(client) -> None:
    admin, user = signup(client, "boss"), signup(client, "reader")
    make_admin(admin)
    files = {"file": ("a.png", png_bytes(), "image/png")}
    assert (
        client.post("/api/admin/notes/images", files=files, headers=auth(user)).status_code == 403
    )
    res = client.post(
        "/api/admin/notes/images",
        files={"file": ("a.png", png_bytes(), "image/png")},
        headers=auth(admin),
    )
    assert res.status_code == 201 and res.json()["url"].startswith("/uploads/")
    bad = client.post(
        "/api/admin/notes/images",
        files={"file": ("a.txt", b"hello", "text/plain")},
        headers=auth(admin),
    )
    assert bad.status_code == 400


def test_note_cover_summary_sources_views(client) -> None:
    """2026-11-17 (X · h사 긴 글 검토 뒤): 대표 이미지 · AI 요약(운영자가 고쳐 저장) · 출처 · 조회수."""
    admin, user = signup(client, "boss"), signup(client, "reader")
    make_admin(admin)
    h = auth(admin)

    # AI 요약 초안 (fake 제공자) — 저장하지 않고 돌려줌, llm_calls 에 note_summary 로 남음
    res = client.post(
        "/api/admin/notes/summary", json={"title": "돌봄", "body_md": BODY}, headers=h
    )
    assert res.status_code == 200 and res.json()["summary"] and res.json()["error"] is None
    assert (
        client.post(
            "/api/admin/notes/summary", json={"title": "x", "body_md": "y"}, headers=auth(user)
        ).status_code
        == 403
    )

    # 저장: 요약 · 출처는 줄마다 한 항목 (빈 줄 · 글머리 정리), 비면 None
    note = client.post(
        "/api/admin/notes",
        json={
            "title": "돌봄",
            "body_md": BODY,
            "cover_url": "/uploads/c.png",
            "summary": "- 첫째 요약\n\n• 둘째 요약 ",
            "sources": "\n뉴스 A, https://example.com/a\n",
            "status": "published",
        },
        headers=h,
    ).json()
    assert (
        note["summary"] == "첫째 요약\n둘째 요약"
        and note["sources"] == "뉴스 A, https://example.com/a"
    )
    assert note["cover_url"] == "/uploads/c.png" and note["view_count"] == 0
    cleared = client.patch(
        f"/api/admin/notes/{note['id']}", json={"sources": "  ", "cover_url": None}, headers=h
    ).json()
    assert (
        cleared["sources"] is None
        and cleared["cover_url"] is None
        and cleared["summary"] == "첫째 요약\n둘째 요약"
    )

    # 조회수: 운영자가 아닌 사람이 열 때만 1씩, "수정됨"과 섞이지 않음
    client.get(f"/api/notes/{note['id']}")
    viewed = client.get(f"/api/notes/{note['id']}", headers=auth(user)).json()
    assert viewed["view_count"] == 2
    assert client.get(f"/api/notes/{note['id']}", headers=h).json()["view_count"] == 2
    listed = client.get("/api/notes").json()["items"][0]
    assert listed["cover_url"] is None and listed["view_count"] == 2


def test_note_reactions_and_library(client) -> None:
    """2026-11-17: Observe Note 에 Thunder · Wave · 북마크 (로그인), 내 서재 북마크 탭에 상상과 함께."""
    admin, user = signup(client, "boss"), signup(client, "reader")
    make_admin(admin)
    note = client.post(
        "/api/admin/notes", json={"title": "흐름", "status": "published"}, headers=auth(admin)
    ).json()
    draft = client.post("/api/admin/notes", json={"title": "초안"}, headers=auth(admin)).json()
    nid = note["id"]

    # 로그인 전: 버튼은 login_required, 누르면 401
    guest = client.get(f"/api/notes/{nid}").json()
    assert guest["actions"]["thunder"] == {
        "allowed": False,
        "reason": "login_required",
        "remaining": None,
    }
    assert client.post(f"/api/notes/{nid}/thunder").status_code == 401

    h = auth(user)
    for kind in ("thunder", "wave", "bookmark"):
        res = client.post(f"/api/notes/{nid}/{kind}", headers=h)
        assert res.status_code == 200, res.text
    again = client.post(f"/api/notes/{nid}/thunder", headers=h).json()  # 두 번 눌러도 하나
    assert again["counts"] == {"thunders": 1, "waves": 1, "bookmarks": 1}
    assert again["my"] == {"thunder": True, "wave": True, "bookmark": True}
    assert (
        client.post(f"/api/notes/{draft['id']}/thunder", headers=h).status_code == 404
    )  # 임시 저장 글은 안 됨
    assert client.post(f"/api/notes/{nid}/like", headers=h).status_code == 422

    seen = client.get("/api/notes?size=50", headers=h).json()["items"][0]
    assert (
        seen["my"]["bookmark"] is True
        and seen["counts"]["thunders"] == 1
        and seen["actions"]["wave"]["allowed"]
    )
    assert (
        client.get("/api/notes").json()["items"][0]["my"]["thunder"] is False
    )  # 다른 사람(비로그인)

    # 내 서재 북마크 탭: 상상 북마크와 누른 순서대로 섞임 (after_id = 이 상상 바로 뒤, None = 맨 앞)
    from tests.test_tags import write

    first = write(client, user, "먼저 북마크한 상상")
    client.post(f"/api/imaginations/{first['id']}/bookmark", headers=h)
    client.delete(f"/api/notes/{nid}/bookmark", headers=h)
    client.post(f"/api/notes/{nid}/bookmark", headers=h)  # 노트를 나중에 북마크 → 맨 앞
    lib = client.get("/api/me/library?tab=bookmarks", headers=h).json()
    assert [i["id"] for i in lib["items"]] == [first["id"]]
    assert [(n["after_id"], n["note"]["id"]) for n in lib["notes"]] == [(None, nid)]
    later = write(client, user, "나중에 북마크한 상상")
    client.post(f"/api/imaginations/{later['id']}/bookmark", headers=h)
    lib = client.get("/api/me/library?tab=bookmarks", headers=h).json()
    assert [(n["after_id"], n["note"]["id"]) for n in lib["notes"]] == [(later["id"], nid)]
    # Thunder · Wave 탭에도 같은 방식으로 (북마크와 같음), 최근 본 상상 탭엔 없음
    for tab in ("thunders", "waves"):
        got = client.get(f"/api/me/library?tab={tab}", headers=h).json()["notes"]
        assert [n["note"]["id"] for n in got] == [nid]
    assert client.get("/api/me/library?tab=recent", headers=h).json()["notes"] == []

    off = client.delete(f"/api/notes/{nid}/bookmark", headers=h).json()
    assert off["my"]["bookmark"] is False and off["counts"]["bookmarks"] == 0
    assert client.get("/api/me/library?tab=bookmarks", headers=h).json()["notes"] == []


def test_note_wave_in_following_feed(client) -> None:
    """2026-11-17: 팔로우한 사람이 Wave 한 노트는 팔로잉 탭에 시간 순서대로 섞인다 (북마크 탭과 같은 방식) + via 기록."""
    from sqlalchemy import select

    from app.domains.notes.models import NoteReaction
    from app.infrastructure.core.database import get_sessionmaker
    from tests.test_tags import write

    admin, star, fan, other = (
        signup(client, "boss"),
        signup(client, "star"),
        signup(client, "fan"),
        signup(client, "other"),
    )
    make_admin(admin)
    note = client.post(
        "/api/admin/notes", json={"title": "흐름", "status": "published"}, headers=auth(admin)
    ).json()
    nid = note["id"]
    star_id = client.get("/api/users/star").json()["id"]
    client.post("/api/users/star/follow", headers=auth(fan))

    older = write(client, star, "먼저 쓴 상상")
    client.post(f"/api/notes/{nid}/wave", headers=auth(star))  # 노트 Wave
    client.post(
        f"/api/notes/{nid}/wave", headers=auth(other)
    )  # 팔로우 안 한 사람의 Wave 는 안 나옴
    newer = write(client, star, "나중에 쓴 상상")

    feed = client.get("/api/feed", params={"tab": "following"}, headers=auth(fan)).json()
    assert [i["id"] for i in feed["items"]] == [newer["id"], older["id"]]
    assert [(n["after_id"], n["note"]["id"], n["waved_by"]["nickname"]) for n in feed["notes"]] == [
        (newer["id"], nid, "star")
    ]
    # 분야를 고르면 넣지 않음 · 다른 탭에도 없음
    assert (
        client.get(
            "/api/feed", params={"tab": "following", "domain": "mobility"}, headers=auth(fan)
        ).json()["notes"]
        == []
    )
    assert (
        client.get("/api/feed", params={"tab": "latest"}, headers=auth(fan)).json()["notes"] == []
    )

    # 팔로잉 피드에서 보고 Wave → 확산 경로(via) 기록
    client.post(f"/api/notes/{nid}/wave", json={"via_user_id": star_id}, headers=auth(fan))
    with get_sessionmaker()() as db:
        row = db.scalars(
            select(NoteReaction).where(
                NoteReaction.kind == "wave", NoteReaction.via_user_id.is_not(None)
            )
        ).one()
        assert row.via_user_id == star_id
