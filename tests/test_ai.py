"""Sprint 4 — LLM · 임베딩 구조 (모두 fake 제공자, 비용 0)."""

import pytest
from sqlalchemy import select, text

from app.domains.imaginations.models import Imagination
from app.domains.shake.blend import problems, run_blend
from app.domains.similar.service import embed_all, find_similar
from app.domains.tags.tagging import clean_tags, run_tagging
from app.infrastructure.core.config import Settings, get_settings
from app.infrastructure.core.database import get_engine, get_sessionmaker
from app.infrastructure.llm import prompts, router
from app.infrastructure.llm.models import LlmCall
from app.infrastructure.llm.providers.base import LlmLimited, LlmRefused
from tests.conftest import auth, signup


def write(client, token, body, domain="mobility", title=None, desire=None):
    data = {"body": body, "domain": domain}
    if title:
        data["title"] = title
    if desire:
        data["desire"] = desire
    res = client.post("/api/imaginations", data=data, headers=auth(token))
    assert res.status_code == 201, res.text
    return res.json()


def test_route_and_settings_guard() -> None:
    s = Settings(llm_provider="fake", llm_shake_provider="fake", llm_shake_model="other-model")
    assert router.route("tagging", s) == ("fake", "claude-haiku-5-5")
    assert router.route("shake", s) == ("fake", "other-model")
    with pytest.raises(ValueError, match="ANTHROPIC_API_KEY"):
        Settings(llm_provider="anthropic", anthropic_api_key=None, _env_file=None)
    with pytest.raises(ValueError, match="GEMINI_API_KEY"):
        Settings(embedding_provider="gemini", gemini_api_key=None, _env_file=None)
    assert get_settings().llm_provider == "fake"  # 테스트는 언제나 fake


def test_prompts_render_fills_values() -> None:
    system, user = prompts.render("tagging", domain="AI", title="제목", body="본문", desire="욕망")
    assert "기술 요소" in system and "{" not in user and "본문" in user
    system, user = prompts.render(
        "shake",
        **{f"{p}_{k}": f"{p}{k}" for p in "ab" for k in ("domain", "title", "body", "desire")},
    )
    assert "어린이" in system and "{" not in user


def test_tagging_and_blend_with_fake_log_calls(client) -> None:
    a, b = signup(client, "writer"), signup(client, "other")
    x = write(client, a, "하늘을 나는 학교 버스", title="드론 버스", desire="아침잠")
    y = write(client, b, "스스로 자라는 집", domain="life")
    with get_engine().begin() as conn:  # 글쓰기 뒤 자동 태깅 · 임베딩 기록은 지우고 본다
        conn.execute(text("DELETE FROM llm_calls"))
    with get_sessionmaker()() as db:
        ix, iy = db.get(Imagination, x["id"]), db.get(Imagination, y["id"])
        tags = run_tagging(db, ix)
        assert tags["tech"] and len(tags["tech"]) <= 5 and tags["desire"]
        out = run_blend(db, ix, iy)
        assert set(out) == {"title", "body", "desire", "merged_tech", "merged_desire"}
        rows = list(db.scalars(select(LlmCall).order_by(LlmCall.id)))
    assert [(r.feature, r.provider, r.status) for r in rows] == [
        ("tagging", "fake", "success"),
        ("shake", "fake", "success"),
    ]
    assert rows[0].imagination_id == x["id"] and float(rows[0].est_cost_usd) == 0


def test_clean_tags_and_blend_problems() -> None:
    assert clean_tags(["#드론", "드론", " 배터리 ", "", "a", "b", "c", "d"]) == [
        "드론",
        "배터리",
        "a",
        "b",
        "c",
    ]
    ok = {"title": "새 상상", "body": "본문", "desire": "욕망"}
    assert problems(ok) == []
    assert "title 비어 있음" in problems({**ok, "title": " "})
    assert any("body" in p for p in problems({**ok, "body": "가" * 301}))
    assert any("금지어" in p for p in problems({**ok, "body": "마약 이야기"}))


def test_daily_limit_and_refusal(client, monkeypatch) -> None:
    monkeypatch.setattr(get_settings(), "llm_daily_call_limit", 1)
    with get_sessionmaker()() as db:
        router.generate_json(db, "tagging", system="s", user="u", schema={"type": "object"})
        with pytest.raises(LlmLimited):
            router.generate_json(db, "tagging", system="s", user="u", schema={"type": "object"})

    monkeypatch.setattr(get_settings(), "llm_daily_call_limit", 100)

    class Refuser:
        name = "fake"

        def generate_json(self, **_):
            err = LlmRefused("거절")
            err.usage = (10, 2)
            raise err

    monkeypatch.setitem(router._providers, "fake", Refuser())
    with get_sessionmaker()() as db, pytest.raises(LlmRefused):
        router.generate_json(db, "shake", system="s", user="u", schema={"type": "object"})
    with get_engine().connect() as conn:
        statuses = [r[0] for r in conn.execute(text("SELECT status FROM llm_calls ORDER BY id"))]
    assert statuses == ["success", "limited", "refused"]


def test_embeddings_and_similar(client) -> None:
    a, b = signup(client, "writer"), signup(client, "other")
    base = write(client, a, "하늘을 나는 학교 버스를 타고 등교해요")
    near = write(client, b, "하늘을 나는 학교 버스로 친구들과 등교")
    far = write(client, b, "바다 속 도서관에서 고래와 책 읽기", domain="life")
    mine = write(client, a, "하늘을 나는 학교 버스 두 번째 이야기")  # 같은 작성자는 빼고 찾는다
    client.post(
        f"/api/imaginations/{base['id']}/comments",
        json={"body": "댓글은 임베딩 안 함"},
        headers=auth(b),
    )
    with get_sessionmaker()() as db:
        assert embed_all(db) == 0  # 글을 올릴 때 이미 만들어졌다 (Sprint 5-A)
        assert embed_all(db, force=True) == 4  # 원본·인용만 (댓글 제외)
        sims = find_similar(db, base["id"])
        ids = [s.item.id for s in sims]
        assert mine["id"] not in ids and ids[0] == near["id"] and far["id"] in ids
        assert sims[0].score > sims[1].score
        emb = db.scalar(select(LlmCall).where(LlmCall.feature == "embedding"))
        assert emb is not None and emb.provider == "fake"
