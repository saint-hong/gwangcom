"""app.infrastructure.core.exceptions — 앱 공통 예외."""


class ImagineError(Exception):
    """Imagine 앱 예외의 부모."""


class ConfigurationError(ImagineError):
    """필수 설정이 없거나 잘못됐을 때 (예: LLM 키 누락)."""
