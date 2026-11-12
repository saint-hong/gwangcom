"""Claude (anthropic 공식 SDK) — 기본 글 생성 제공자 (기획안 v10 9-1장, Claude Haiku 5.5).

- JSON 은 구조화 출력(output_config.format, JSON 스키마)으로 받는다.
- temperature 같은 샘플링 값은 넣지 않는다 (최신 모델은 받지 않음). 추론 깊이는 effort 로 조절한다.
- 거절(stop_reason=refusal)은 LlmRefused, 그 밖의 실패는 LlmError.
"""

import json
from typing import Any

import anthropic

from app.infrastructure.llm.providers.base import JsonResult, LlmError, LlmRefused


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, api_key: str, *, effort: str, timeout: float, max_retries: int) -> None:
        self._client = anthropic.Anthropic(
            api_key=api_key, timeout=timeout, max_retries=max_retries
        )
        self._effort = effort

    def generate_json(
        self, *, model: str, system: str, user: str, schema: dict[str, Any], max_tokens: int
    ) -> JsonResult:
        try:
            res = self._client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user}],
                output_config={
                    "effort": self._effort,
                    "format": {"type": "json_schema", "schema": schema},
                },
            )
        except anthropic.RateLimitError as e:
            raise LlmError(f"요청이 너무 많아요 (429): {e.message}") from e
        except anthropic.APIStatusError as e:
            raise LlmError(f"Claude API 오류 ({e.status_code}): {e.message}") from e
        except anthropic.APIConnectionError as e:
            raise LlmError(f"Claude API 에 연결하지 못했어요: {e}") from e

        usage = (res.usage.input_tokens, res.usage.output_tokens)
        if res.stop_reason == "refusal":
            err = LlmRefused("모델이 응답을 거절했어요.")
            err.usage = usage  # type: ignore[attr-defined]
            raise err
        if res.stop_reason == "max_tokens":
            err = LlmError("응답이 max_tokens 에서 잘렸어요.")
            err.usage = usage  # type: ignore[attr-defined]
            raise err
        text = next((b.text for b in res.content if b.type == "text"), "")
        try:
            data = json.loads(text)
        except json.JSONDecodeError as e:
            raise LlmError(f"JSON 을 읽지 못했어요: {text[:120]!r}") from e
        return JsonResult(data=data, input_tokens=usage[0], output_tokens=usage[1])
