"""Sprint 5-C — 비슷한 상상 리랭킹 (벡터 후보 → LLM 이 고름) · 계보 그래프."""

import re

import pytest
from sqlalchemy import text

from app.domains.similar.models import SimilarSet
from app.domains.similar.rerank import compute_all
from app.infrastructure.core.database import get_engine, get_sessionmaker
from app.infrastructure.llm import router
from app.infrastructure.llm.providers.base import JsonResult, LlmError
from app.infrastructure.llm.providers.fake import FakeProvider
from tests.conftest import auth, signup


class Picker(FakeProvider):
    """리랭킹 때만 후보 번호를 골라 준다: 후보를 거꾸로 + 없는 번호 · 겹친 번호를 섞어 보낸다."""

    def generate_json(self, *, model, system, user, schema, max_tokens):
        if "picks" not in schema.get("properties", {}):
            return super().generate_json(
                model=model, system=system, user=user, schema=schema, max_tokens=max_tokens
            )
        ids = [int(x) for x in re.findall(r"^\[(\d+)\]$", user, re.M)]
        picks = [{"id": i, "reason": f"이유 {i}"} for i in reversed(ids)]
        picks += [{"id": 999999, "reason": "없는 번호"}, *picks[:1]]
        return JsonResult(data={"picks": picks}, input_tokens=100, output_tokens=20)


@pytest.fixture()
def picker(monkeypatch):
    monkeypatch.setitem(router._providers, "fake", Picker())


def write(client, token, body, domain="mobility"):
    res = client.post(
        "/api/imaginations", data={"body": body, "domain": domain}, headers=auth(token)
    )
    assert res.status_code == 201, res.text
    return res.json()


def test_post_computes_reranked_similar(client, picker) -> None:
    a, b = signup(client, "alice"), signup(client, "bob")
    others = [write(client, b, f"하늘을 나는 버스 {i}") for i in range(3)]
    base = write(client, a, "하늘을 나는 학교 버스")  # 올릴 때 이 글의 목록을 계산한다

    res = client.get(f"/api/imaginations/{base['id']}/similar").json()
    assert res["method"] == "rerank"
    ids = [x["item"]["id"] for x in res["items"]]
    # LLM 이 고른 순서 그대로 (없는 번호 · 겹친 번호는 버림)
    assert sorted(ids) == sorted(o["id"] for o in others) and len(ids) == 3
    assert all(x["reason"].startswith("이유") and x["score"] is not None for x in res["items"])

    # 지운 글은 보이지 않는다
    client.delete(f"/api/imaginations/{ids[0]}", headers=auth(b))
    res = client.get(f"/api/imaginations/{base['id']}/similar").json()
    assert ids[0] not in [x["item"]["id"] for x in res["items"]]


def test_llm_failure_falls_back_to_vector_then_recomputes(client, monkeypatch) -> None:
    a, b = signup(client, "alice"), signup(client, "bob")
    write(client, b, "하늘을 나는 버스")

    class Broken(FakeProvider):
        def generate_json(self, *, schema, **kw):
            if "picks" in schema.get("properties", {}):
                raise LlmError("시간 초과")
            return super().generate_json(schema=schema, **kw)

    monkeypatch.setitem(router._providers, "fake", Broken())
    base = write(client, a, "하늘을 나는 학교 버스")
    res = client.get(f"/api/imaginations/{base['id']}/similar").json()
    assert res["method"] == "vector" and len(res["items"]) == 1
    assert res["items"][0]["reason"] is None

    monkeypatch.setitem(router._providers, "fake", Picker())
    with get_sessionmaker()() as db:
        counts = compute_all(db)  # 벡터로만 저장된 것을 다시 계산
        assert counts["rerank"] >= 1 and counts["vector"] == 0
        assert db.get(SimilarSet, base["id"]).method == "rerank"
        assert compute_all(db) == {"rerank": 0, "vector": 0}  # 이미 했으면 건너뜀


def test_similar_targets_and_fallbacks(client, picker) -> None:
    a, b = signup(client, "alice"), signup(client, "bob")
    x = write(client, b, "바다 속 도서관", "life")
    y = write(client, a, "하늘 버스")
    blend = client.post(
        "/api/shake", json={"target_id": x["id"], "mine_id": y["id"]}, headers=auth(a)
    ).json()
    comment = client.post(
        f"/api/imaginations/{x['id']}/comments", json={"body": "댓글"}, headers=auth(a)
    ).json()
    for i in (blend, comment):  # 혼합 · 댓글은 대상이 아니다
        assert client.get(f"/api/imaginations/{i['id']}/similar").json() == {
            "items": [],
            "method": "none",
        }

    # 저장된 결과도 임베딩도 없으면 → 같은 분야 · 태그
    z = write(client, b, "바다 위 학교", "life")
    with get_engine().begin() as conn:
        conn.execute(text("DELETE FROM similar_sets"))
        conn.execute(
            text("DELETE FROM imagination_embeddings WHERE imagination_id = :i"), {"i": y["id"]}
        )
    res = client.get(f"/api/imaginations/{y['id']}/similar").json()
    assert res["method"] == "tags" and {i["item"]["id"] for i in res["items"]} >= {x["id"], z["id"]}
    # 저장된 결과가 없고 임베딩은 있으면 → 벡터
    assert client.get(f"/api/imaginations/{x['id']}/similar").json()["method"] == "vector"


def test_lineage_graph(client) -> None:
    a, b, c = signup(client, "alice"), signup(client, "bob"), signup(client, "carol")
    x, y, z = write(client, a, "원본 x"), write(client, b, "원본 y"), write(client, c, "원본 z")

    def shake(token, target, mine):
        return client.post(
            "/api/shake",
            json={"target_id": target["id"], "mine_id": mine["id"]},
            headers=auth(token),
        ).json()

    first = shake(b, x, y)
    second = shake(c, first, z)

    res = client.get(f"/api/imaginations/{first['id']}/lineage").json()
    depth = {n["id"]: n["depth"] for n in res["nodes"]}
    assert res["center_id"] == first["id"] and not res["truncated"]
    # z 는 second 의 다른 재료일 뿐 first 의 조상 · 자손이 아니라서 나오지 않는다
    assert depth == {x["id"]: -1, y["id"]: -1, first["id"]: 0, second["id"]: 1}
    edges = {(e["source"], e["target"], e["position"]) for e in res["edges"]}
    assert {
        (x["id"], first["id"], 0),
        (y["id"], first["id"], 1),
        (first["id"], second["id"], 0),
    } <= edges

    # 맨 아래 글에서 위로 2단계: 원본까지 보인다. up=0 이면 자기 자신만
    res = client.get(f"/api/imaginations/{second['id']}/lineage?up=2&down=0").json()
    assert {x["id"], y["id"], z["id"], first["id"]} <= {n["id"] for n in res["nodes"]}
    res = client.get(f"/api/imaginations/{second['id']}/lineage?up=0&down=0").json()
    assert [n["id"] for n in res["nodes"]] == [second["id"]] and res["edges"] == []

    # 지운 글도 자리는 남는다
    client.delete(f"/api/imaginations/{first['id']}", headers=auth(b))
    res = client.get(f"/api/imaginations/{second['id']}/lineage").json()
    gone = next(n for n in res["nodes"] if n["id"] == first["id"])
    assert gone["deleted"] is True and gone["display_title"] is None
