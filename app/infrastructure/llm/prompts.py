"""프롬프트 로더 — prompts/v1/*.md 를 읽는다 (코드와 프롬프트를 분리, 기획안 v10 9장).

파일 형식: "## system" 절과 "## user" 절. user 의 {이름} 자리에 값을 넣는다.
"""

from functools import lru_cache
from pathlib import Path

PROMPT_DIR = Path(__file__).resolve().parents[3] / "prompts"
VERSION = "v1"


@lru_cache(maxsize=32)
def _load(name: str) -> dict[str, str]:
    text = (PROMPT_DIR / VERSION / f"{name}.md").read_text(encoding="utf-8")
    parts: dict[str, list[str]] = {}
    current = None
    for line in text.splitlines():
        if line.startswith("## "):
            current = line[3:].strip().lower()
            parts[current] = []
        elif current is not None:
            parts[current].append(line)
    return {k: "\n".join(v).strip() for k, v in parts.items()}


def render(name: str, **values: str) -> tuple[str, str]:
    """(system, user) 를 돌려준다."""
    p = _load(name)
    user = p["user"]
    for k, v in values.items():
        user = user.replace("{" + k + "}", v)
    return p["system"], user
