"""pytest 공통 설정.

- 테스트는 imagine_test DB 를 쓴다 (TEST_DATABASE_URL). 시작할 때 Alembic 으로 최신 구조를 만들고,
  테스트마다 사용자·상상 데이터를 비운다 (분야·등급·기본 한도 시드는 남긴다).
- DB 가 꺼져 있으면 DB 가 필요한 테스트는 건너뛴다.
- 업로드 이미지는 임시 폴더에 저장한다.
"""

import json
import os
import tempfile

# 앱 설정을 읽기 전에 테스트 값으로 바꿔 둔다
os.environ["APP_ENV"] = "test"
_TEST_DB = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://imagine:imagine_local_pw@localhost:5432/imagine_test",
)
os.environ["DATABASE_URL"] = _TEST_DB
os.environ["UPLOAD_DIR"] = tempfile.mkdtemp(prefix="imagine-test-uploads-")
# 테스트에서는 유료 API 를 부르지 않는다 (.env 에 키가 있어도 fake 로 덮어쓴다)
os.environ["LLM_PROVIDER"] = "fake"
for _f in ("TAGGING", "SHAKE", "NOTE", "SIMILAR"):
    os.environ[f"LLM_{_f}_PROVIDER"] = ""
os.environ["EMBEDDING_PROVIDER"] = "fake"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.infrastructure.core.database import check_database, get_engine  # noqa: E402


@pytest.fixture(scope="session")
def database_ready() -> bool:
    if not check_database():
        return False
    from alembic import command
    from alembic.config import Config

    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "alembic"))
    command.upgrade(cfg, "head")
    return True


@pytest.fixture()
def db_clean(database_ready: bool):
    if not database_ready:
        pytest.skip("테스트 DB(imagine_test)에 연결할 수 없어요 — docker compose up -d postgres")
    with get_engine().begin() as conn:
        conn.execute(text("DELETE FROM llm_calls"))
        conn.execute(text("DELETE FROM imaginations"))
        conn.execute(text("DELETE FROM prompts"))
        conn.execute(text("DELETE FROM tags"))
        conn.execute(text("DELETE FROM policy_settings WHERE scope <> 'global'"))
        conn.execute(text("DELETE FROM users"))  # 팔로우·알림·반응도 함께 지워진다
        # 6-B: 운영자가 바꾼 전체 기본값 · 등급을 시드 상태로 되돌린다
        conn.execute(text("DELETE FROM policy_change_logs"))
        conn.execute(text("DELETE FROM policy_settings WHERE scope = 'tier'"))
        conn.execute(
            text(
                "DELETE FROM user_tiers WHERE name NOT IN ('기본', '활발한 Dreamer', '테스트 그룹')"
            )
        )
        conn.execute(text("UPDATE user_tiers SET is_default = (name = '기본')"))
        from app.domains.policy.service import SAFE_DEFAULTS

        for key, value in SAFE_DEFAULTS.items():
            conn.execute(
                text(
                    "UPDATE policy_settings SET value = CAST(:v AS jsonb) "
                    "WHERE scope = 'global' AND key = :k"
                ),
                {"k": key, "v": json.dumps(value)},
            )
    yield


@pytest.fixture()
def client(db_clean) -> TestClient:
    from app.main import app

    return TestClient(app)


def signup(client: TestClient, nickname: str = "tester", email: str | None = None) -> dict:
    res = client.post(
        "/api/auth/signup",
        json={
            "email": email or f"{nickname}@example.com",
            "password": "password123",
            "nickname": nickname,
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


def auth(token_body: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {token_body['access_token']}"}
