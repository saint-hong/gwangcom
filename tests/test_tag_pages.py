"""Sprint 5-D — 화면 태그(기술만) · 작성자 태그 편집 · 주제 둘러보기 · 태그별 상상."""

from sqlalchemy import select

from app.domains.imaginations.models import Imagination
from app.domains.tags.models import ImaginationTag, Tag
from app.domains.tags.service import save_ai_tags
from app.infrastructure.core.database import get_sessionmaker
from tests.conftest import auth, signup


def write(client, token, body="하늘을 나는 학교 버스", domain="mobility"):
    res = client.post(
        "/api/imaginations", data={"body": body, "domain": domain}, headers=auth(token)
    )
    assert res.status_code == 201, res.text
    return res.json()


def set_ai(item_id: int, tech: list[str], desire: list[str] | None = None) -> None:
    """fake 태깅 결과 대신 정해진 AI 태그를 넣는다."""
    with get_sessionmaker()() as db:
        save_ai_tags(db, db.get(Imagination, item_id), {"tech": tech, "desire": desire or []})
        db.commit()


def labels(item: dict) -> list[str]:
    return [t["label"] for t in item["tags"]]


def test_response_has_tech_tags_only_and_edit_action(client) -> None:
    a, b = signup(client, "writer"), signup(client, "other")
    item = write(client, a)
    set_ai(item["id"], ["드론", "자율 비행"], ["편안한 등하교"])

    mine = client.get(f"/api/imaginations/{item['id']}", headers=auth(a)).json()
    # 욕망 태그는 화면에 내보내지 않는다 (2026-11-12 사용자 결정)
    assert mine["tags"] == [
        {"name": "드론", "label": "드론"},
        {"name": "자율비행", "label": "자율 비행"},
    ]
    assert mine["actions"]["edit_tags"] == {"allowed": True, "reason": None, "remaining": 3}

    other = client.get(f"/api/imaginations/{item['id']}", headers=auth(b)).json()
    assert other["actions"]["edit_tags"]["allowed"] is False
    feed = client.get("/api/feed?tab=latest").json()
    assert labels(feed["items"][0]) == ["드론", "자율 비행"]
    assert feed["items"][0]["actions"]["edit_tags"]["allowed"] is False  # 비로그인


def test_author_edits_tags_and_removed_ones_are_kept(client) -> None:
    a, b = signup(client, "writer"), signup(client, "other")
    item = write(client, a)
    set_ai(item["id"], ["드론", "자율 비행"], ["편안한 등하교"])

    # 드론을 빼고 "#배터리"를 더한다. 같은 이름("자율비행")은 한 번만
    res = client.put(
        f"/api/imaginations/{item['id']}/tags",
        json={"tech": ["자율비행", "#배터리", "자율 비행"]},
        headers=auth(a),
    )
    assert res.status_code == 200, res.text
    assert labels(res.json()) == ["자율 비행", "배터리"]

    with get_sessionmaker()() as db:
        rows = {
            r.tag.label: r
            for r in db.scalars(
                select(ImaginationTag).where(ImaginationTag.imagination_id == item["id"])
            ).unique()
        }
        assert rows["드론"].removed_at is not None and rows["드론"].source == "ai"  # 지운 기록
        assert rows["배터리"].source == "user" and rows["배터리"].removed_at is None
        assert rows["편안한 등하교"].removed_at is None  # 욕망 태그는 건드리지 않는다

    # 다시 태깅해도 작성자가 지운 태그는 되살아나지 않고, 작성자 태그는 남는다
    set_ai(item["id"], ["드론", "도심항공교통"])
    again = client.get(f"/api/imaginations/{item['id']}", headers=auth(a)).json()
    assert labels(again) == ["배터리", "도심항공교통"]

    # 지웠던 태그를 다시 넣으면 되살린다
    back = client.put(
        f"/api/imaginations/{item['id']}/tags", json={"tech": ["드론"]}, headers=auth(a)
    ).json()
    assert labels(back) == ["드론"]

    # 규칙: 남의 글 · 너무 많음 · 잘못된 태그
    assert (
        client.put(
            f"/api/imaginations/{item['id']}/tags", json={"tech": ["x"]}, headers=auth(b)
        ).status_code
        == 403
    )
    many = client.put(
        f"/api/imaginations/{item['id']}/tags",
        json={"tech": [f"태그{i}" for i in range(6)]},
        headers=auth(a),
    )
    assert many.status_code == 400 and many.json()["detail"]["code"] == "too_many_tags"
    bad = client.put(
        f"/api/imaginations/{item['id']}/tags", json={"tech": ["가" * 21]}, headers=auth(a)
    )
    assert bad.status_code == 400 and bad.json()["detail"]["code"] == "invalid_tag"


def test_topics_count_people_posts_by_domain(client) -> None:
    a, b = signup(client, "writer"), signup(client, "other")
    x = write(client, a, "하늘을 나는 버스", "mobility")
    y = write(client, b, "드론 택배", "mobility")
    z = write(client, b, "우주 드론", "space")
    set_ai(x["id"], ["드론", "배터리"])
    set_ai(y["id"], ["드론"])
    set_ai(z["id"], ["드론"])
    # 혼합 글은 주제 순위에서 뺀다
    with get_sessionmaker()() as db:
        db.get(Imagination, y["id"]).kind = "blend"
        db.commit()

    data = client.get("/api/topics").json()
    # 전체 인기 주제: 한 글을 한 번만 센다 (드론 = x · z, 혼합 y 제외)
    assert data["popular"] == [
        {"name": "드론", "label": "드론", "count": 2},
        {"name": "배터리", "label": "배터리", "count": 1},
    ]
    by = {d["slug"]: d["tags"] for d in data["domains"]}
    assert len(data["domains"]) == 8
    assert by["mobility"] == [
        {"name": "드론", "label": "드론", "count": 1},
        {"name": "배터리", "label": "배터리", "count": 1},
    ]
    assert by["space"] == [{"name": "드론", "label": "드론", "count": 1}]
    assert by["bio"] == []


def test_tag_feed_latest_first_with_blends(client) -> None:
    a = signup(client, "writer")
    first = write(client, a, "첫 번째")
    second = write(client, a, "두 번째")
    other = write(client, a, "태그 없음")
    set_ai(first["id"], ["AR/VR"])
    set_ai(second["id"], ["AR/VR"])
    set_ai(other["id"], ["배터리"])
    with get_sessionmaker()() as db:
        db.get(Imagination, second["id"]).kind = "blend"  # 혼합 글도 나온다
        db.commit()
        assert db.scalar(select(Tag.name).where(Tag.label == "AR/VR")) == "ar/vr"

    res = client.get("/api/tags/AR%2FVR/imaginations")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["tag"] == {"name": "ar/vr", "label": "AR/VR", "count": 2}
    assert [i["id"] for i in body["items"]] == [second["id"], first["id"]]
    assert body["next_cursor"] is None
    assert client.get("/api/tags/없는태그/imaginations").status_code == 404
