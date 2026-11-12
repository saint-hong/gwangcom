"""app.main — FastAPI 앱 진입점.

실행:  uv run uvicorn app.main:app --reload   (http://localhost:8000, API 문서 /docs)
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import __version__
from app.domains.admin.router import router as admin_router
from app.domains.auth.router import router as auth_router
from app.domains.comments.router import router as comments_router
from app.domains.imaginations.router import router as imaginations_router
from app.domains.notifications.router import router as notifications_router
from app.domains.policy.router import router as policy_router
from app.domains.prompts.router import router as prompts_router
from app.domains.reactions.router import router as reactions_router
from app.domains.shake.router import router as shake_router
from app.domains.tags.router import router as domains_router
from app.domains.users.router import router as users_router
from app.infrastructure.core.config import get_settings
from app.infrastructure.core.database import check_database
from app.infrastructure.core.logging import get_logger, setup_logging
from app.infrastructure.storage.images import upload_root
from app.shared.errors import install_error_handlers

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    setup_logging()
    settings = get_settings()
    db_ok = check_database()
    logger.info(
        "Imagine API 시작 (env=%s, database=%s)", settings.app_env, "ok" if db_ok else "unavailable"
    )
    if not db_ok:
        logger.warning(
            "PostgreSQL 에 연결할 수 없습니다. `docker compose up -d postgres` 를 확인하세요."
        )
    if settings.jwt_secret_is_default:
        if settings.is_production:
            raise RuntimeError("운영 환경에서는 JWT_SECRET 을 반드시 바꿔야 합니다.")
        logger.warning("JWT_SECRET 이 개발용 기본값입니다. 공개 배포 전에 바꾸세요.")
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Imagine API", version=__version__, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    install_error_handlers(app)
    for router in (
        auth_router,
        policy_router,
        domains_router,
        imaginations_router,
        reactions_router,
        comments_router,
        users_router,
        notifications_router,
        shake_router,
        admin_router,
        prompts_router,
    ):
        app.include_router(router)
    # 업로드 이미지 (로컬 디스크). 개발 중에는 프론트(Vite)가 /uploads 를 백엔드로 넘긴다.
    app.mount(
        settings.upload_url_prefix,
        StaticFiles(directory=upload_root()),
        name="uploads",
    )

    @app.get("/health", tags=["system"])
    @app.get("/api/health", tags=["system"])
    def health() -> dict[str, str]:
        """서버 상태. DB 가 꺼져 있어도 200 을 돌려주고 database 값으로 알린다."""
        return {
            "status": "ok",
            "app": settings.app_name,
            "version": __version__,
            "env": settings.app_env,
            "database": "ok" if check_database() else "unavailable",
        }

    return app


app = create_app()
