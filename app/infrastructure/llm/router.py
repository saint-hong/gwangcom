"""LLM 호출의 유일한 입구 (기획안 v10 9-1장).

서비스 코드는 기능 이름(tagging · shake · note_draft)만 넘긴다. 어떤 제공자 · 모델을 쓸지는 .env 가 정한다.
모든 호출은 llm_calls 에 남기고, 서비스 전체 하루 호출 한도를 넘으면 LlmLimited 를 던진다.
"""

import time
from decimal import Decimal
from typing import Any, Literal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.infrastructure.core.config import Settings, get_settings
from app.infrastructure.llm.models import LlmCall
from app.infrastructure.llm.providers.base import (
    JsonResult,
    LlmError,
    LlmLimited,
    LlmProvider,
    LlmRefused,
)
from app.infrastructure.llm.providers.fake import FakeProvider
from app.shared.time import kst_day_start

Feature = Literal["tagging", "shake", "note_draft", "similar_rerank", "user_summary"]

_providers: dict[str, LlmProvider] = {}


def route(feature: Feature, settings: Settings | None = None) -> tuple[str, str]:
    """기능 이름 → (제공자, 모델). 기능별 값이 비었으면 기본값."""
    s = settings or get_settings()
    key = {
        "tagging": "tagging",
        "shake": "shake",
        "note_draft": "note",
        "similar_rerank": "similar",
        "user_summary": "summary",
    }[feature]
    provider = getattr(s, f"llm_{key}_provider") or s.llm_provider
    model = getattr(s, f"llm_{key}_model") or s.llm_model
    return provider, model


def _provider(name: str, s: Settings) -> LlmProvider:
    if name not in _providers:
        if name == "anthropic":
            from app.infrastructure.llm.providers.anthropic import AnthropicProvider

            assert s.anthropic_api_key is not None
            _providers[name] = AnthropicProvider(
                s.anthropic_api_key.get_secret_value(),
                effort=s.llm_effort,
                timeout=s.llm_timeout_seconds,
                max_retries=s.llm_max_retries,
            )
        else:
            _providers[name] = FakeProvider()
    return _providers[name]


def calls_today(db: Session) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(LlmCall)
            .where(
                LlmCall.created_at >= kst_day_start(),
                LlmCall.status != "limited",
                LlmCall.feature != "embedding",  # 임베딩은 따로 (하루 한도에 넣지 않음)
            )
        )
        or 0
    )


def _cost(s: Settings, provider: str, inp: int, out: int) -> Decimal:
    if provider == "fake":
        return Decimal(0)
    usd = inp * s.llm_price_input_per_mtok / 1e6 + out * s.llm_price_output_per_mtok / 1e6
    return Decimal(str(round(usd, 6)))


def generate_json(
    db: Session,
    feature: Feature,
    *,
    system: str,
    user: str,
    schema: dict[str, Any],
    max_tokens: int = 4000,
    user_id: int | None = None,
    imagination_id: int | None = None,
    log_feature: str | None = None,
) -> JsonResult:
    """JSON 하나를 만든다. 성공 · 실패 · 거절 · 한도 모두 llm_calls 에 남기고 commit 한다."""
    s = get_settings()
    provider_name, model = route(feature, s)
    row = LlmCall(
        feature=log_feature or feature,
        provider=provider_name,
        model=model,
        user_id=user_id,
        imagination_id=imagination_id,
    )
    if calls_today(db) >= s.llm_daily_call_limit:
        row.status = "limited"
        row.error = f"하루 한도 {s.llm_daily_call_limit}회"
        db.add(row)
        db.commit()
        raise LlmLimited("오늘은 AI 기능을 잠시 쉬고 있어요. 내일 다시 시도해 주세요.")

    started = time.perf_counter()
    try:
        result = _provider(provider_name, s).generate_json(
            model=model, system=system, user=user, schema=schema, max_tokens=max_tokens
        )
    except LlmError as e:
        inp, out = getattr(e, "usage", (0, 0))
        row.status = "refused" if isinstance(e, LlmRefused) else "failed"
        row.error = str(e)[:500]
        row.input_tokens, row.output_tokens = inp, out
        row.est_cost_usd = _cost(s, provider_name, inp, out)
        row.latency_ms = int((time.perf_counter() - started) * 1000)
        db.add(row)
        db.commit()
        raise
    row.status = "success"
    row.input_tokens, row.output_tokens = result.input_tokens, result.output_tokens
    row.est_cost_usd = _cost(s, provider_name, result.input_tokens, result.output_tokens)
    row.latency_ms = int((time.perf_counter() - started) * 1000)
    db.add(row)
    db.commit()
    return result
