"""LLM 제공자 공통 인터페이스 (기획안 v10 9-1장). 제공자마다 같은 모양으로 JSON 을 돌려준다."""

from dataclasses import dataclass
from typing import Any, Protocol


class LlmError(Exception):
    """제공자 호출 실패 (네트워크 · 시간 초과 · 형식 오류 등). 서비스는 실패로 처리한다."""


class LlmRefused(LlmError):
    """모델이 응답을 거절함 (stop_reason=refusal). 게시하지 않고, 하루 횟수도 차감하지 않는다."""


class LlmLimited(LlmError):
    """서비스 전체 하루 AI 호출 한도(LLM_DAILY_CALL_LIMIT)에 걸림."""


@dataclass
class JsonResult:
    data: dict[str, Any]
    input_tokens: int = 0
    output_tokens: int = 0


class LlmProvider(Protocol):
    name: str

    def generate_json(
        self, *, model: str, system: str, user: str, schema: dict[str, Any], max_tokens: int
    ) -> JsonResult: ...
