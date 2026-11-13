"""Sprint 6-D — 분석 대시보드 API (기획안 v11 F18 · A1)."""

from sqlalchemy import text

from app.domains.analytics.period import make_period
from app.domains.imaginations.models import Imagination
from app.domains.tags.service import save_ai_tags
from app.infrastructure.core.database import get_engine, get_sessionmaker
from tests.conftest import auth, signup
from tests.test_admin_moderation import make_admin
from tests.test_tags import write

TABS = ("overview", "tech", "cross", "engagement", "shake", "ai")


def test_period_buckets() -> None:
    p7 = make_period("7d", None)
    assert p7.unit == "day" and len(p7.buckets) == 7 and p7.has_prev
    assert p7.days == 7 and p7.buckets[-1] == p7.end
    p90 = make_period("90d", None)
    assert p90.unit == "week" and all(b.weekday() == 0 for b in p90.buckets)
    assert make_period("all", None).has_prev is False


def test_dashboard_numbers(client) -> None:
    admin, writer, fan = signup(client, "boss"), signup(client, "writer"), signup(client, "fan")
    make_admin(admin)
    for tab in TABS:
        assert client.get(f"/api/admin/analytics/{tab}", headers=auth(writer)).status_code == 403
    assert (
        client.get("/api/admin/analytics/overview?period=1y", headers=auth(admin)).status_code
        == 422
    )

    a = write(client, writer, "하늘을 나는 드론 택배", "mobility")
    b = write(client, writer, "말하면 알아듣는 AI 비서", "ai")
    c = write(client, fan, "일주일 가는 배터리", "energy")
    # 가짜 태깅 결과 대신 정한 태그로 (태그 · 교차 지표를 확인하려고)
    with get_engine().begin() as conn:
        conn.execute(text("DELETE FROM imagination_tags"))
    with get_sessionmaker()() as db:
        tags = {
            a["id"]: {"tech": ["AI", "드론"], "desire": ["안전"]},
            b["id"]: {"tech": ["AI"], "desire": ["안전", "편리함"]},
            c["id"]: {"tech": ["배터리"], "desire": ["편리함"]},
        }
        for iid, t in tags.items():
            save_ai_tags(db, db.get(Imagination, iid), t)
        db.commit()
    client.post(f"/api/imaginations/{a['id']}/thunder", headers=auth(fan))
    client.post(f"/api/imaginations/{a['id']}/thunder", headers=auth(admin))

    def get(tab, period="7d"):
        res = client.get(f"/api/admin/analytics/{tab}?period={period}", headers=auth(admin))
        assert res.status_code == 200, res.text
        return res.json()

    ov = get("overview")
    kpi = {k["key"]: k for k in ov["kpis"]}
    assert kpi["posts"]["value"] == 3 and kpi["posts"]["prev"] == 0
    assert kpi["thunders"]["value"] == 2 and sum(kpi["thunders"]["series"]) == 2
    assert kpi["new_tech"]["value"] == 3
    assert {d["slug"]: d["count"] for d in ov["domains"]}["mobility"] == 1
    assert len(ov["domains"]) == 8 and ov["tagged_ratio"] == 1.0
    assert ov["signals"][0]["label"] == "AI" and ov["signals"][0]["signal"] == "new"

    tech = {t["label"]: t for t in get("tech")["techs"]}
    assert tech["AI"]["count"] == 2 and tech["AI"]["authors"] == 1
    assert tech["AI"]["thunders"] == 2 and tech["AI"]["thunder_avg"] == 1.0
    assert tech["AI"]["desires"][0] == "안전"

    cross = get("cross")
    assert [(x["a"], x["b"], x["count"]) for x in cross["pairs"]] == [("AI", "드론", 1)]
    r, col = cross["matrix_rows"].index("안전"), cross["matrix_cols"].index("AI")
    assert cross["matrix"][r][col] == {"count": 2, "thunders": 2}
    assert {"d:mobility", "t:AI", "x:안전"} <= {n["id"] for n in cross["sankey_nodes"]}
    assert {"source": "t:AI", "target": "x:안전", "weight": 2} in cross["net_edges"]

    eng = get("engagement")
    assert eng["top"][0]["id"] == a["id"] and eng["top"][0]["thunders"] == 2
    assert sum(sum(row) for row in eng["punch_reactions"]) == 2
    assert sum(eng["free_series"]) == 3 and sum(eng["prompt_series"]) == 0

    assert get("shake")["blends"] == 0
    ai = get("ai")
    assert {f["feature"] for f in ai["features"]} >= {"tagging", "shake", "embedding"}
    assert ai["daily_limit"] > 0

    # 전체 기간 · CSV 원자료
    assert get("overview", "all")["period"]["has_prev"] is False
    res = client.get("/api/admin/analytics/export.csv?period=30d", headers=auth(admin))
    assert res.status_code == 200 and res.headers["content-type"].startswith("text/csv")
    lines = res.content.decode("utf-8-sig").strip().splitlines()
    assert lines[0].startswith("id,작성(한국 시간)") and len(lines) == 4
    assert "AI | 드론" in res.text


def test_visits_and_activation(client) -> None:
    """하루 접속 기록 + 신규 Dreamer 활성화 (첫 7일 단계 · 첫 주 경험 비교 · 목록)."""
    from app.domains.users import visits

    visits._seen.clear()
    admin, early, idle, new = (signup(client, n) for n in ("boss", "early", "idle", "newbie"))
    make_admin(admin)
    post = write(client, early, "바다 위를 걷는 신발", "life")
    client.post(f"/api/imaginations/{post['id']}/thunder", headers=auth(admin))
    client.get("/api/auth/me", headers=auth(new))  # 로그인 요청 = 오늘 접속 기록

    with get_engine().begin() as conn:
        ids = dict(conn.execute(text("SELECT nickname, id FROM users")).all())
        # early · idle 은 20일 전 가입 (계속 활동 판정 대상), 첫 상상은 가입 다음 날, Thunder 는 이틀째
        conn.execute(
            text("UPDATE users SET created_at = now() - interval '20 days' WHERE id IN (:a, :b)"),
            {"a": ids["early"], "b": ids["idle"]},
        )
        conn.execute(
            text("UPDATE imaginations SET created_at = now() - interval '19 days' WHERE id = :i"),
            {"i": post["id"]},
        )
        conn.execute(text("UPDATE thunders SET created_at = now() - interval '18 days'"))
        days = dict(
            conn.execute(text("SELECT user_id, count(*) FROM user_visits GROUP BY 1")).all()
        )
    assert days.get(ids["newbie"]) == 1 and ids["idle"] not in days

    res = client.get("/api/admin/analytics/activation?period=30d", headers=auth(admin))
    assert res.status_code == 200, res.text
    d = res.json()
    assert d["new_users"] == 3 and d["eligible"] == 2
    steps = {s["key"]: (s["users"], s["base"]) for s in d["steps"]}
    assert steps["posted"] == (1, 3) and steps["got_thunder"] == (1, 3)
    assert steps["kept"] == (1, 2)  # early 은 오늘(20일째) 접속 · 활동, idle 은 없음
    posted = next(c for c in d["compare"] if c["key"] == "posted")
    assert (posted["yes_n"], posted["yes_kept"], posted["no_n"], posted["no_kept"]) == (1, 1, 1, 0)
    status = {u["nickname"]: u["status"] for u in d["users"]}
    assert status == {"early": "active", "idle": "not_started", "newbie": "not_started"}
    assert d["first_post_hours_median"] == 24.0
    assert client.get("/api/admin/analytics/activation", headers=auth(idle)).status_code == 403


def test_share_growth_rule() -> None:
    """기술 신호는 비중으로 비교한다 — 전체 상상이 늘어도 비중이 같으면 떠오름이 아니다."""
    from app.domains.analytics.insights import RISING, _share_growth

    assert _share_growth(20, 200, 10, 100) == 0.0  # 개수는 2배지만 비중은 같음
    assert _share_growth(30, 100, 10, 100) + 1 >= RISING
    assert _share_growth(5, 100, 10, 100) == -0.5
    assert _share_growth(5, 100, 0, 100) is None and _share_growth(5, 100, 3, 0) is None


def test_summary_totals(client) -> None:
    """전체 현황 — 기간과 상관없이 처음부터 지금까지 (보이는 글만, 운영자 제외, 탈퇴는 아직 없음)."""
    admin, writer, fan = signup(client, "boss"), signup(client, "writer"), signup(client, "fan")
    make_admin(admin)
    a = write(client, writer, "구름 위 도서관", "life")
    write(client, fan, "물속 기차", "mobility")
    client.post(f"/api/imaginations/{a['id']}/thunder", headers=auth(fan))
    assert client.get("/api/admin/analytics/summary", headers=auth(writer)).status_code == 403
    d = client.get("/api/admin/analytics/summary", headers=auth(admin)).json()
    assert (d["imaginations"], d["thunders"], d["users"], d["admins"]) == (2, 1, 2, 1)
    assert d["withdrawn"] is None and d["today"]["imaginations"] == 2
