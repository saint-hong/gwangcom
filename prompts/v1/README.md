# 프롬프트 (v1)

LLM 프롬프트는 코드와 분리해 이 폴더에 둔다 (Sprint 4~).

| 파일 | 기능 |
|---|---|
| tagging.md | 자동 태깅 — Sprint 4 에서 작성 · 실측, Sprint 5 에서 저장 연결 |
| shake.md | Shake it 혼합 — Sprint 4 에서 작성 · 실측, Sprint 5 에서 게시 연결 |
| similar_rerank.md | 비슷한 상상 리랭킹 — 벡터 후보 중 실제로 비슷한 것만 골라 순서 + 이유 (Sprint 5-C) |
| note_draft.md | Observe Note 초안 (Sprint 6) |

형식: `## system` 절 + `## user` 절. user 의 `{이름}` 자리에 값이 들어간다 (`app/infrastructure/llm/prompts.py`).
프롬프트를 크게 바꾸면 `v2/` 폴더를 새로 만들고 `prompts.py` 의 VERSION 을 바꾼다 (실측 결과를 비교할 수 있게).
