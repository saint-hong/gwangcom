"""app.shared.errors — API 오류 형식.

모든 오류 응답은 {"detail": {"code": "...", "message": "사용자에게 보여 줄 한국어 문장"}} (기획안 v9 8장).
"""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    """서비스 코드에서 던지는 오류. 라우터가 그대로 HTTP 응답으로 바꾼다."""

    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def bad_request(code: str, message: str) -> AppError:
    return AppError(400, code, message)


def unauthorized(message: str = "로그인이 필요해요.") -> AppError:
    return AppError(401, "login_required", message)


def forbidden(code: str, message: str) -> AppError:
    return AppError(403, code, message)


def not_found(message: str = "찾을 수 없어요.") -> AppError:
    return AppError(404, "not_found", message)


def conflict(code: str, message: str) -> AppError:
    return AppError(409, code, message)


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _handle(_: Request, exc: AppError) -> JSONResponse:
        headers = {"WWW-Authenticate": "Bearer"} if exc.status == 401 else None
        return JSONResponse(
            status_code=exc.status,
            content={"detail": {"code": exc.code, "message": exc.message}},
            headers=headers,
        )
