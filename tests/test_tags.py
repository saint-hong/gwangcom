"""Sprint 5-A — 글 저장 뒤 자동 태깅 · 임베딩, 태그 정규화, tag-all."""

from sqlalchemy import select, text

from app.domains.imaginations.models import Imagination
from app.domains.similar.models import ImaginationEmbedding
from app.domains.tags.models import ImaginationTag, Tag
from app.domains.tags.service import save_ai_tags, tag_all, tags_of, to_label, to_name
from app.infrastructure.core.config import get_settings
from app.infrastructure.core.database import get_engine, get_sessionmaker
from app.infrastructure.llm import router
from app.infrastructure.llm.models import LlmCall
from app.infrastructure.llm.providers.base import LlmError
from tests.conftest import auth, signup


def write(client, token, body="하늘을 나는 학교 버스", domain="mobility"):
    res = client.post(
        "/api/imaginations", data={"body": body, "domain": domain}, headers=auth(token)
    )
    assert res.status_code == 201, res.text
    return res.json()


def test_normalize_rules() -> None:
    # 화면 표기는 띄어쓰기를 한 칸으로 남기고, 비교용 이름은 띄어쓰기를 없앤다
    assert to_label("#자율 주행") == "자율 주행" and to_name("자율 주행") == "자율주행"
    assert to_label("  AI  비서 ") == "AI 비서" and to_name("AI 비서") == "ai비서"
    # 자모가 나뉜(NFD) 한글도 같은 글자로 맞춘다
    assert to_label("\u1100\u1161") == "\uac00"
    # 기술 20자 · 욕망 40자 (욕망은 문장이어도 받는다)
    assert to_label("가" * 20) is not None and to_label("가" * 21) is None
    assert to_label("가" * 40, "desire") is not None and to_label("가" * 41, "desire") is None
    assert to_label(" # ") is None


def test_post_runs_tagging_and_embedding_in_background(client) -> None:
    a, b = signup(client, "writer"), signup(client, "other")
    item = write(client, a)
    quote = client.post(
        f"/api/imaginations/{item['id']}/quote", json={"body": "저도 타고 싶어요"}, headers=auth(b)
    ).json()
    client.post(f"/api/imaginations/{item['id']}/comments", json={"body": "댓글"}, headers=auth(b))

    with get_sessionmaker()() as db:
        for i in (item, quote):
            row = db.get(Imagination, i["id"])
            assert row.tagging_status == "done"
            assert {t.type for t in tags_of(db, i["id"])} == {"tech", "desire"}
            assert db.get(ImaginationEmbedding, i["id"]) is not None
        comment = db.scalar(select(Imagination).where(Imagination.kind == "comment"))
        assert comment.tagging_status == "pending"  # 댓글은 태깅 · 임베딩 하지 않는다
        assert db.get(ImaginationEmbedding, comment.id) is None
        features = sorted(f for (f,) in db.execute(select(LlmCall.feature)))
    # 인용 글은 원글(다른 작성자)이 후보라 리랭킹도 한 번 부른다 (5-C)
    assert features == ["embedding", "embedding", "similar_rerank", "tagging", "tagging"]


def test_ai_failure_does_not_break_posting(client, monkeypatch) -> None:
    class Broken:
        name = "fake"

        def generate_json(self, **_):
            raise LlmError("시간 초과")

    monkeypatch.setitem(router._providers, "fake", Broken())
    a = signup(client, "writer")
    item = write(client, a)  # AI 가 실패해도 글은 올라간다
    with get_sessionmaker()() as db:
        assert db.get(Imagination, item["id"]).tagging_status == "failed"

    monkeypatch.undo()
    with get_sessionmaker()() as db:
        assert tag_all(db) == (1, 1)  # 실패한 글을 다시 태깅
        assert db.get(Imagination, item["id"]).tagging_status == "done"
        assert tag_all(db) == (0, 0)


def test_daily_limit_keeps_pending(client, monkeypatch) -> None:
    monkeypatch.setattr(get_settings(), "llm_daily_call_limit", 0)
    a = signup(client, "writer")
    item = write(client, a)
    with get_sessionmaker()() as db:
        assert db.get(Imagination, item["id"]).tagging_status == "pending"
        assert tag_all(db) == (0, 1)  # 한도에 걸리면 멈춘다


def test_same_tag_is_shared_and_user_tags_are_kept(client) -> None:
    a = signup(client, "writer")
    x, y = write(client, a), write(client, a, "바다 속 학교")
    with get_engine().begin() as conn:
        conn.execute(text("DELETE FROM imagination_tags"))
    with get_sessionmaker()() as db:
        ix, iy = db.get(Imagination, x["id"]), db.get(Imagination, y["id"])
        save_ai_tags(db, ix, {"tech": ["AI  비서", "드론"], "desire": ["안전"]})
        save_ai_tags(db, iy, {"tech": ["ai비서"], "desire": []})
        db.commit()
        tag = db.scalars(select(Tag).where(Tag.name == "ai비서")).one()
        assert tag.label == "AI 비서"  # 처음 표기를 화면에 쓴다 (띄어쓰기는 한 칸)
        assert db.scalar(
            select(ImaginationTag).where(
                ImaginationTag.imagination_id == iy.id, ImaginationTag.tag_id == tag.id
            )
        )
        # 작성자 태그(source=user)는 AI 태깅을 다시 해도 남는다 (편집 화면은 5-D)
        drone = db.scalars(select(Tag).where(Tag.name == "드론")).one()
        db.execute(
            ImaginationTag.__table__.update()
            .where(ImaginationTag.imagination_id == ix.id, ImaginationTag.tag_id == drone.id)
            .values(source="user")
        )
        save_ai_tags(db, ix, {"tech": ["배터리"], "desire": []})
        db.commit()
        assert sorted(t.label for t in tags_of(db, ix.id)) == ["드론", "배터리"]
