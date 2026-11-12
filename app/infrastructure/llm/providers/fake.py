"""가짜 제공자 — 테스트와 키 없는 개발용 (비용 0, 네트워크 없음).

JSON 스키마를 보고 그 모양에 맞는 값을 채워 돌려준다. 같은 입력이면 같은 결과.
"""

from typing import Any

from app.infrastructure.llm.providers.base import JsonResult


def _fill(schema: dict[str, Any], key: str = "") -> Any:
    t = schema.get("type")
    if "enum" in schema:
        return schema["enum"][0]
    if t == "object":
        props = schema.get("properties", {})
        return {k: _fill(v, k) for k, v in props.items()}
    if t == "array":
        n = max(1, min(int(schema.get("minItems", 2)), int(schema.get("maxItems", 2))))
        return [_fill(schema.get("items", {"type": "string"}), key) for _ in range(n)]
    if t == "integer":
        return 1
    if t == "number":
        return 0.5
    if t == "boolean":
        return False
    return f"가짜 {key or '값'}"


class FakeProvider:
    name = "fake"

    def generate_json(
        self, *, model: str, system: str, user: str, schema: dict[str, Any], max_tokens: int
    ) -> JsonResult:
        return JsonResult(data=_fill(schema), input_tokens=len(user) // 2, output_tokens=20)
