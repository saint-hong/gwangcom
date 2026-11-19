"""Sprint 7 — 홈 검색: 상상(글자 일치 + 뜻 검색) · 주제 · Dreamer · 검색 기록."""

from sqlalchemy import select

from app.domains.search.models import SearchLog
from app.domains.search.service import rank
from app.infrastructure.core.database import get_sessionmaker
from tests.conftest import auth, signup
from tests.test_tag_pages import set_ai, write


def search(client, kind: str, q: str, token=None, cursor: str | None = None):
    params = {"q": q} | ({"cursor": cursor} if cursor else {})
    res = client.get(f"/api/search/{kind}", params=params, headers=auth(token) if token else {})
    assert res.status_code == 200, res.text
    return res.json()


def titles(out: dict) -> list[str]:
    return [i["body"] for i in out["items"]]


def test_rank_puts_text_matches_first_then_meaning() -> None:
    # 글자 일치 3개(최신순 10, 11, 12) + 뜻 점수: 12 는 높고, 20 · 21 은 뜻으로만 찾음
    ids, meaning = rank([10, 11, 12], {12: 0.9, 21: 0.8, 20: 0.7})
    assert ids == [12, 10, 11, 21, 20]
    assert meaning == {20, 21}


def test_text_search_matches_body_desire_and_topic(client) -> None:
    a = signup(client, "writer")
    bus = write(client, a, body="하늘을 나는 학교 버스")
    farm = write(client, a, body="옥상마다 채소가 자라는 도시", domain="life")
    set_ai(farm["id"], ["수직 농장"])
    res = client.post(
        "/api/imaginations",
        data={"body": "달에서 보내는 여름 방학", "domain": "space", "desire": "아이와 긴 여행"},
        headers=auth(a),
    )
    moon = res.json()

    assert titles(search(client, "imaginations", "학교 버스")) == [bus["body"]]
    # 낱말은 모두 들어 있어야 한다
    assert search(client, "imaginations", "학교 우주선")["total"] == 0
    # 왜 원하나요 · 주제(띄어쓰기 달라도) 로도 찾는다
    assert titles(search(client, "imaginations", "긴 여행")) == [moon["body"]]
    assert titles(search(client, "imaginations", "#수직농장")) == [farm["body"]]
    # % · _ 는 글자 그대로 찾는다 (모든 글이 걸리지 않는다)
    assert search(client, "imaginations", "%")["total"] == 0


def test_search_skips_comments_hidden_and_deleted(client) -> None:
    a, b = signup(client, "writer"), signup(client, "other")
    item = write(client, a, body="바다 밑 도서관")
    gone = write(client, a, body="바다 밑 놀이터")
    client.post(
        f"/api/imaginations/{item['id']}/comments", json={"body": "바다 좋아요"}, headers=auth(b)
    )
    client.delete(f"/api/imaginations/{gone['id']}", headers=auth(a))

    out = search(client, "imaginations", "바다", b)
    assert titles(out) == [item["body"]]
    # 상상 응답 그대로 (actions · my 가 붙는다)
    assert out["items"][0]["actions"]["thunder"]["allowed"] is True


def test_meaning_search_finds_items_without_matching_words(client, monkeypatch) -> None:
    from app.infrastructure.core.config import get_settings

    a = signup(client, "writer")
    item = write(client, a, body="하늘을 나는 학교 버스")
    write(client, a, body="옥상마다 채소가 자라는 도시", domain="life")

    # 띄어쓰기가 달라 글자로는 안 맞지만 (가짜 임베딩은 빈칸을 빼고 비교) 뜻으로 찾는다
    out = search(client, "imaginations", "하늘을나는학교버스")
    assert titles(out) == [item["body"]]
    assert out["meaning_ids"] == [item["id"]]

    # 뜻 검색을 끄면 글자 일치만
    monkeypatch.setattr(get_settings(), "search_meaning", False)
    assert search(client, "imaginations", "하늘을나는학교버스")["total"] == 0


def test_search_pages_with_cursor(client) -> None:
    a = signup(client, "writer")
    with get_sessionmaker()() as db:
        from app.domains.policy.models import PolicySetting

        row = db.scalar(
            select(PolicySetting).where(
                PolicySetting.scope == "global", PolicySetting.key == "limit.post_daily"
            )
        )
        row.value = 100
        db.commit()
    for n in range(23):
        write(client, a, body=f"로봇 친구와 보내는 하루 {n}번째 이야기")

    first = search(client, "imaginations", "로봇 친구")
    assert first["total"] == 23 and len(first["items"]) == 20 and first["next_cursor"]
    second = search(client, "imaginations", "로봇 친구", cursor=first["next_cursor"])
    assert len(second["items"]) == 3 and second["next_cursor"] is None
    assert not {i["id"] for i in first["items"]} & {i["id"] for i in second["items"]}


def test_search_topics_and_dreamers(client) -> None:
    a, b = signup(client, "로봇팬", "robotfan@example.com"), signup(client, "gardener")
    client.patch("/api/users/me", data={"bio": "로봇과 사는 미래를 상상해요"}, headers=auth(b))
    one = write(client, a, body="청소를 대신 해 주는 친구")
    two = write(client, a, body="할머니 말동무", domain="life")
    set_ai(one["id"], ["가정용 로봇", "센서"], ["편한 집안일"])
    set_ai(two["id"], ["가정용 로봇", "로봇 팔"])

    out = search(client, "topics", "로봇")
    assert [(t["label"], t["count"]) for t in out["items"]] == [("가정용 로봇", 2), ("로봇 팔", 1)]
    # 낱말 하나만 맞아도 찾는다 ("배터리 휴대폰" → #고체 배터리, 2026-11-19 사용자). 맞는 낱말이 많은 주제가 먼저
    out = search(client, "topics", "로봇 센서")
    assert [t["label"] for t in out["items"]] == ["센서", "가정용 로봇", "로봇 팔"]
    # 검색어 안에 주제 이름이 통째로 들어 있어도 찾는다
    assert [t["label"] for t in search(client, "topics", "센서장갑")["items"]] == ["센서"]
    # 한 글자 낱말로는 찾지 않는다
    assert search(client, "topics", "팔 다리")["total"] == 0
    # 욕망 태그는 찾지 않는다 (화면에 보이지 않는 분석용)
    assert search(client, "topics", "집안일")["total"] == 0

    client.post("/api/users/gardener/follow", headers=auth(a))
    out = search(client, "dreamers", "로봇", a)
    # 닉네임이 맞는 사람이 먼저, 그다음 소개가 맞는 사람
    assert [d["author"]["nickname"] for d in out["items"]] == ["로봇팬", "gardener"]
    assert out["items"][1]["following"] is True
    assert search(client, "dreamers", "@GARDEN")["total"] == 1


def test_search_logs_first_page_only_and_rejects_bad_query(client) -> None:
    a = signup(client, "writer")
    write(client, a, body="하늘을 나는 학교 버스")

    search(client, "imaginations", "  학교   버스 ", a)
    search(client, "imaginations", "없는말")  # 로그인하지 않은 방문자
    search(client, "topics", "양자", a)

    with get_sessionmaker()() as db:
        logs = list(db.scalars(select(SearchLog).order_by(SearchLog.id)))
    assert [(x.query, x.norm, x.tab, x.result_count, x.user_id is None) for x in logs] == [
        ("학교 버스", "학교버스", "imaginations", 1, False),
        ("없는말", "없는말", "imaginations", 0, True),
        ("양자", "양자", "topics", 0, False),
    ]

    assert client.get("/api/search/imaginations", params={"q": "   "}).status_code == 400
    res = client.get("/api/search/imaginations", params={"q": "가" * 51})
    assert res.status_code == 400 and res.json()["detail"]["code"] == "query_too_long"


def test_related_topics_come_from_imagination_results(client) -> None:
    a = signup(client, "writer")
    one = write(client, a, body="한 달에 한 번만 충전하는 휴대폰")
    two = write(client, a, body="물에 빠져도 멀쩡한 휴대폰", domain="mobile")
    three = write(client, a, body="종이처럼 접는 휴대폰", domain="mobile")
    far = write(client, a, body="옥상마다 채소가 자라는 도시", domain="life")
    set_ai(one["id"], ["고체 배터리", "무선 충전"])
    set_ai(two["id"], ["고체 배터리", "방수 코팅"])
    set_ai(three["id"], ["고체 배터리", "휴대폰 화면"])
    set_ai(far["id"], ["수직 농장"])

    out = search(client, "topics", "휴대폰")
    # 이름이 맞는 주제는 items, 상상 검색 결과(3개)에 여러 번 쓰인 주제는 related
    assert [t["label"] for t in out["items"]] == ["휴대폰 화면"]
    # 한 번만 쓰인 주제(무선 충전 · 방수 코팅)와 검색되지 않은 상상의 주제(수직 농장)는 나오지 않는다
    assert [(t["label"], t["count"]) for t in out["related"]] == [("고체 배터리", 3)]
    assert search(client, "topics", "없는말")["related"] == []
