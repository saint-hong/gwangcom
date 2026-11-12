from fastapi.testclient import TestClient

from app import __version__
from app.main import app


def test_health_returns_ok_even_without_database() -> None:
    client = TestClient(app)
    for path in ("/health", "/api/health"):
        res = client.get(path)
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "ok"
        assert body["app"] == "Imagine"
        assert body["version"] == __version__
        assert body["database"] in {"ok", "unavailable"}


def test_settings_defaults_point_to_postgres(monkeypatch) -> None:
    from app.infrastructure.core.config import Settings

    monkeypatch.delenv("DATABASE_URL", raising=False)  # conftest 가 테스트 DB 로 바꿔 둔 값 제외
    s = Settings(_env_file=None)
    assert s.database_url.startswith("postgresql+psycopg://")
    assert s.database_url.endswith("/imagine_dev")
    assert s.test_database_url.endswith("/imagine_test")
