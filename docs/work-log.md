# 작업 기록

최신 작업이 위에 온다.

---

## 2026-11-11 — 하루 마감 점검

- 하루 요약: `summary_imagine/논의요약_1111.txt` (결정 · 5-A~C 결과 · 기본값 · 남은 일)
- 문서 맞춤: sprint.md 히스토리 표(Sprint 5 진행 중 5-A~C ✅) · Sprint 0 줄 글꼴 변경 표시, design-system 의 Shake 선택 창 화면 번호 S7 → S5(기획안 기준), v11 반영목록 7장(구현 중 바뀐 API · 데이터 · 화면) 추가
- 확인 필요: 코드 주석(ShakeModal.tsx · .module.css)도 "S7" 로 적혀 있음 → 다음 작업 때 S5 로 고친다
- 상태: Sprint 5 진행(5-D 남음). `uv run pytest` 54 passed · ruff check · format 통과 · `npm run build` 통과

---

## 2026-11-11 — Sprint 5-C ✅ 계보 그래프 · 비슷한 상상(리랭킹)

### 결정 (사용자)
- Shake it 혼합 방식(말투 · 강조할 것 등)은 가장 중요한 놀이 기능이 될 수 있어 추후 따로 논의 (v11 반영목록 6장)

### 백엔드
| 영역 | 내용 |
|---|---|
| DB | 마이그레이션 0008: `similar_sets` · `similar_links` |
| 리랭킹 | `similar/rerank.py` — 벡터 후보 20 → LLM `similar_rerank`(프롬프트 `prompts/v1/similar_rerank.md`) → 최대 5개 + 이유 저장, 실패 시 벡터 순서 |
| 설정 | `LLM_SIMILAR_PROVIDER/MODEL` · `SIMILAR_CANDIDATES` · `SIMILAR_SHOW` (`.env.example`) |
| API | `/api/imaginations/{id}/similar` (저장 → 벡터 → 분야·태그 순으로 대체) · `/api/imaginations/{id}/lineage` |
| 자동 실행 | `ai_jobs.after_post`: 태깅 → 임베딩 → 비슷한 상상 계산 |
| CLI | `similar-all [--force]` · `similar --id N --rerank` |

### 프론트
- `SimilarBlock`(오른쪽 컬럼, 좁은 화면은 상세 아래) · `LineagePage`(S15) · 상세 [계보 그래프 보기] 링크 · 라우트 연결

### 문제와 조치
- 프롬프트 로더는 user 절의 {이름}만 바꿈 → 최대 개수 {limit} 를 user 절로 옮김
- 인용 글을 올리면 원글이 후보가 되어 리랭킹 호출이 하나 더 생김 → test_tags 의 호출 목록 기대값 갱신
- 계보 판에서 누르자마자 포인터를 붙잡으면 노드 클릭이 판으로 넘어갈 수 있음 → 실제로 끌기 시작했을 때만 붙잡도록

### 검증
- `uv run pytest` 54 passed · ruff check · format 통과 · 0008 올리기 → 내리기 → 다시 올리기 · 개발 DB 적용 · `npm run build` 통과
- 실제 API 1건(177): 후보 20 → 4개, "우주 엘리베이터 커피"(표현만 비슷) 빠짐, $0.00043 · 3.9초
- 개발 DB 의 나머지 글 리랭킹(`similar-all`, 약 $0.025)은 사용자 확인 후. 화면 확인 요청: 계보 그래프 · 비슷한 상상

---

## 2026-11-11 — Sprint 5-B ✅ Shake it

### 결정 (사용자)
- 비슷한 상상은 2단계 검색(벡터 후보 → LLM 리랭킹)으로 5-C 에 넣는다 (`business_archy/v11_반영목록.txt` 5장)

### 백엔드
| 영역 | 내용 |
|---|---|
| DB | 마이그레이션 0007: `imagination_parents` · `shake_attempts` |
| Shake | `shake/service.py` 선택 창 · 섞어서 게시(출력 검사 → 1회 재생성 → 게시 · 계보 · 알림), `shake/router.py` `/api/shake` · `/api/shake/candidates` |
| 규칙 | `actions.shake`: 댓글이면 `not_material` 추가. 하루 횟수는 policy 가 `shake_attempts`(published)로 셈 |
| 응답 | `ImaginationOut.sources` (혼합 글의 재료 2개). 혼합 글 삭제 시 재료 `child_count` -1 |
| 기타 | `tag-all` 연달아 3번 실패하면 멈춤 · `alembic/env.py` 가 HNSW 인덱스를 비교에서 뺌 |

### 프론트
- `ShakeModal`(선택 창 + 섞는 중 애니메이션) · ActionBar 연결(“Sprint 5 에서 열려요” 안내 삭제)
- 홈: Shake 후 `/?tab=latest` 로 가서 새 혼합 글을 맨 위에 강조(`fresh`)
- 카드 재료 줄 · 상세 "재료 상상 2개" · 알림 `shaken` 줄 · 이유 `not_material` 안내
- 토큰 추가: `--color-danger` · `--color-on-shake`

### 문제와 조치
- autogenerate 가 다시 HNSW 인덱스를 지우려 함 → 매번 손으로 빼지 않게 `include_object` 로 비교에서 제외

- (사용자 화면 확인 a~g 완료 후 수정) 선택 창 오른쪽 모서리가 직각 → 창 전체가 스크롤돼서 스크롤바가 둥근 모서리를 덮음. 창 틀은 고정하고 가운데 목록만 스크롤하도록 바꿈([완료] 줄은 항상 보임)
- (사용자 요청) 선택 창 제목 아래 한 줄 설명 추가: "선택한 상상과 내 상상을 AI가 섞어서 새로운 상상으로 만들어 드려요!"

### 검증
- `uv run pytest` 50 passed · ruff check · format 통과 · 0007 올리기 → 내리기 → 다시 올리기 · 개발 DB 적용 · `npm run build` 통과
- 사용자 브라우저 확인: 선택 창 · 애니메이션 · 홈 강조 · 재료 표시 · 알림 · 서재 탭 · 모바일/다크 모드 (a~g) 완료 → 위 두 가지 수정
- 실제 Shake 호출은 사용자가 화면에서 확인 (1회 약 $0.0003). 화면 확인 요청: 선택 창 · 애니메이션 · 홈 강조 · 알림 · 모바일 · 다크 모드

---

## 2026-11-11 — Sprint 5-A ✅ 글 저장 뒤 태깅 · 임베딩 자동

### 결정 (사용자: 추천안대로 · `business_archy/v11_반영목록.txt` 3장)
- 댓글은 Shake 재료로 쓰지 않음 · 태그 정규화 규칙 · 태깅 · 임베딩은 저장 뒤 백그라운드
- Sprint 5 를 5-A → 5-B → 5-C → 5-D 로 나눠 순서대로

### 백엔드
| 영역 | 내용 |
|---|---|
| DB | 마이그레이션 0006: `tags`(name · label · type, unique(name, type)) · `imagination_tags`(source ai/user) |
| 태그 | `tags/service.py` 정규화 · 저장 · `tag_all`, `tagging.py` 의 `clean_tags` 가 같은 정규화 사용 |
| 자동 실행 | `imaginations/ai_jobs.py` `after_post` — 상상 쓰기 · 인용 라우터가 `BackgroundTasks` 로 등록. 새 DB 세션을 열어 처리 |
| CLI | `tag-all [--pending-only]` |
| 테스트 | `tests/test_tags.py` 5개. 기존 `test_ai.py` 2개는 글쓰기 때 태깅 · 임베딩이 자동으로 되는 것에 맞춰 고침, conftest 가 tags 도 비움 |

### 문제와 조치
- Alembic autogenerate 가 0005 에서 SQL 로 만든 HNSW 인덱스를 지우려고 잡음 → 0006 에서 그 줄을 뺌
- 다듬지 않은 표기("AI 비서")가 저장 함수에 바로 들어오면 다른 태그로 갈라짐 → 저장 함수(`get_or_create`) 안에서 다시 정규화

- 첫 `tag-all` 이 모두 401 → `.env` 가 저장되지 않아 옛 키가 남아 있었음(사용자가 저장 후 다시 실행해 해결). 이때 `tag-all` 이 56번을 끝까지 시도함 → 연속 실패면 멈추도록 5-B 때 고친다
- 첫 태깅 결과에서 띄어쓰기를 없앤 긴 태그("지구를밖에서바라보고싶은욕구")가 읽기 어려움 → 사용자 결정: 화면 표기는 띄어쓰기를 남기고 비교용 name 만 없앤다. 욕망 태그는 문장이어도 그대로 쓰고(최대 40자) 분석 때 한 번 더 정제한다 (v11 반영목록 3장)
  · 개발 DB 의 AI 태그를 비우고 다시 태깅

### 검증
- `uv run pytest` 45 passed · ruff check · format 통과 · 0006 올리기 → 내리기 → 다시 올리기 · 개발 DB 에 0006 적용
- 실제 API(사용자 승인): 개발 DB 원본 51 · 인용 5 태깅 56/56 성공, 첫 실행 $0.0059 + 다시 태깅 $0.0058. 태그 기술 136종 · 욕망 118종
  · 예) 하늘을 나는 학교 버스 → 기술: 드론 · 자율비행 · 도심항공교통 / 욕망: 시간 절약 · 수면 확보 · 편안한 등하교

---

## 2026-11-11 — 글꼴 Pretendard 로 변경 (Sprint 5 전)

- 결정(사용자): 본문 글꼴을 웹에서 많이 쓰는 **Pretendard** 로 바꾼다. 더 나은 글꼴이 있으면 추후 다시 바꾼다
- 변경: npm `pretendard@1.3.9` 설치 → `main.tsx` 에서 가변 글꼴 dynamic subset CSS 를 불러옴, `tokens.css` 의 `--font-sans` 첫 글꼴을 `Pretendard Variable` 로, 나눔스퀘어 네오 가변 글꼴 `@font-face` 삭제
- 로고는 그대로 나눔스퀘어 네오 Heavy (첫 글자 I 의 SVG 위치를 이 글꼴 수치에 맞춰 둠, 서비스 정체성 논의 때 다시 정함)
- 문서: design-system.md 2장 · README 갱신
- 검증: `npm run build` 통과 (글꼴 조각이 dist/assets 에 함께 묶임). 화면 확인은 사용자 몫 (글자 폭이 달라져 줄바꿈 · 버튼 폭 확인 필요)

---

## 2026-11-10 — 하루 마감 점검

- 하루 요약 작성: `summary_imagine/논의요약_1110.txt` (용어 · 문서 체계 · 화면 구조 · Sprint 1~4 · AI 모델 · 기본값 · 주의 · 남은 일)
- 문서 맞춤: app-structure · design-system 갱신 표시, db-guide 샘플 데이터 설명(팔로우 · 알림 포함), CLAUDE.md 문서 위치 표에 ai-models.md 추가
- 상태: Sprint 4 완료, 다음 Sprint 5. 테스트 40 passed · ruff 통과 (Sprint 4 마감 때 확인)

---

## 2026-11-10 — Sprint 4 ✅ AI 모델 기반

### 결정 (사용자 · `business_archy/v11_반영목록.txt` 1장)
- 로컬 sLLM 실험은 추후 (자체 LLM 논의와 함께, 노트북 사양 문제) · 글 생성 = Claude Haiku 5.5 · 임베딩 = Gemini
- Anthropic 은 자체 임베딩 모델이 없음(공식 문서 확인) → 임베딩 회사 비교표를 드리고 사용자가 Gemini 선택
- 사용자가 고른 `text-embedding-004` 는 서비스 종료(404) → `gemini-embedding-001`(768 차원)로 적용

### 백엔드
| 영역 | 내용 |
|---|---|
| 설정 | `config.py` LLM · 임베딩 항목 + 키 검사, `.env.example` 정리 (키는 `.env` 에만, 권한 600) |
| LLM | `infrastructure/llm/` router · providers(anthropic · fake) · prompts · models(LlmCall) |
| 임베딩 | `infrastructure/embeddings/` gemini · fake, `domains/similar/` models · service |
| 기능 | `domains/tags/tagging.py` · `domains/shake/blend.py` (호출 + 검사, 저장은 Sprint 5) |
| DB | 마이그레이션 0005: llm_calls · imagination_embeddings (pgvector 768, HNSW) |
| CLI | embed-all · similar · ai-eval |
| 의존성 | `anthropic` · `pgvector` 추가 |

### 문제와 조치
- `text-embedding-004` 404 → 사용 가능한 모델 목록을 조회해 `gemini-embedding-001` · `gemini-embedding-2` 확인 후 001 적용
- gemini-embedding-001 기본 3072 차원은 pgvector HNSW 한도(2000)를 넘음 → `outputDimensionality=768` + 직접 정규화
- Gemini 임베딩 응답에 토큰 수가 없음 → 글자 수로 어림해 llm_calls 에 기록 (어림값이라고 표시)
- 테스트가 .env 의 실제 키로 유료 API 를 부르지 않도록 conftest 에서 fake 로 덮어씀
- API 키가 대화에 그대로 붙여 넣어짐 → `.env` 에만 넣고 화면에 출력하지 않음, 새 키로 바꾸기를 권함

### 검증
- pytest 40 passed · ruff 통과 · 실측(실제 API): 태깅 20/20 · Shake 10/10 · 약 $0.005 · 결과는 `docs/ai-models.md`

---

## 2026-11-10 — 문서 기록 명령 2개 · 문서 최신화

- 커스텀 명령 추가 (`gwangcom/.claude/commands/`)
  · **`/doc-log`** — 방금 한 수정을 해당 문서(work-log 는 항상, 반영목록 · sprint · design-system · app-structure · db-guide · README · CLAUDE.md · 메모리는 해당할 때)에 기록
  · **`/doc-check`** — 하루 마감 때 최신 기획안 · 반영목록 · README · CLAUDE.md · docs 를 훑어 서로 다른 곳을 맞추고 `summary_imagine/논의요약_MMDD.txt` 작성
- CLAUDE.md "작업 방식"에 두 명령 안내 한 줄
- 문서 최신화: app-structure(갱신 표시 · 서재/프로필 탭 · 인기 상상 · 팔로워 목록), design-system(0장 요약 · 6장 캡처와 다른 점)

---

## 2026-11-10 — 기획안 v10

- `business_archy/플랫폼_기획안_v10.txt` 생성 (v9 는 그대로). 맨 위 "v0.10 변경 사항" 12개 항목
- 반영: `v10_반영목록.txt` 1~12장 — X 구조(상세 · 댓글 · 프로필 · 알림 · 인용 · 팔로워 목록 S17), 댓글 = 게시글(kind=comment),
  my · reaction_events, 서재 · 프로필 탭, 상상하기 유도 영역 · 버튼 이름, 뱃지 보기, 인기 상상 = 풍향계(점수식 고도화는 남은 결정),
  아이콘(인기 = 번개), 데이터 모델(comments · comment_likes 삭제, parent_id · root_id · cover_url, notifications.comment_id 삭제), API, Sprint 1~3 완료, 13장 추후 과제
- `v10_반영목록.txt` 에 ✅ 표시, 다음 변경은 `v11_반영목록.txt` 에 모은다. CLAUDE.md · sprint.md · README 가 v10 을 가리키게 바꿈

---

## 2026-11-10 — 인용하기 창을 X 구조로

- 확인: Sprint 4(AI 모델 기반)에는 인용하기 화면 작업이 없음 → Sprint 2 의 `QuoteModal` 을 X 인용하기 캡처대로 바꿈
- [×] 만 있는 윗줄(제목 없음) → (아바타) 입력 20px → 원본 카드(둥근 모서리 16, 본문 4줄, 이미지는 아래에 카드 폭 가득, 누를 수 없음) → 글자 수 …… **[게시하기]**
- 입력칸 보라 포커스 테두리 없앰. X 의 [초안] · 이미지 · GIF · 이모지 · 일정 · 위치 도구는 넣지 않음(기본 기능만)
- `QuoteEmbed` 에 `preview` 모양 추가 (피드·상세의 인용 카드는 그대로)
- 검증: `npm run build` 통과. 화면은 사용자 브라우저 확인. 기획 반영 목록: `business_archy/v10_반영목록.txt` 12장

---

## 2026-11-10 — 서재 · 프로필 탭 다시 정리

| 요청 | 조치 |
|---|---|
| 북마크할 때 "서재에 담았어요" 메시지 | 없앰 (켤 때·끌 때 모두) — `ActionBar` |
| 인기 상상 순위 숫자 색 | 1~3위 보라색 없앰, 모두 같은 회색 — `TrendingPage.module.css` (화면 고도화는 추후 논의) |
| 서재에 Wave 탭 · 순서 | [Thunder · Wave · Shake it · 북마크 · 최근 본 상상], 처음 탭 Thunder, 탭 폭 고르게(`Tabs even`) — `LibraryPage` · `/api/me/library?tab=waves` |
| 프로필 Wave 탭 → 인용 탭 | [상상 · 댓글 · 인용], 상상 = 원본 + 혼합, 인용 = 인용 글 — `ProfilePage` · `users/service.py` |

- 검증: pytest 34 passed(프로필 인용 탭 · 서재 Wave 탭 검사로 바꿈) · ruff · `npm run build` 통과. 화면은 사용자 브라우저 확인
- 기획 반영 목록: `business_archy/v10_반영목록.txt` 11장

---

## 2026-11-10 — 인기 상상에 액션 바 (욕망의 풍향계)

- 인기 상상 줄마다 숫자만 보이던 자리를 **다른 화면과 같은 `ActionBar`** 로 바꿈 — Thunder · Wave · 댓글 · Shake it …… 북마크 · 공유, 같은 순서 · 간격 · 움직임 (사용자: "인기 상상은 욕망의 방향을 알려 주는 풍향계")
- 줄 구성: 순위 | 아바타 · 닉네임 · 시간 …… ⋯ / 제목 · 요약 | 썸네일 / 액션 바 — `TrendingPage`
- 점수 계산식은 추후 고도화로 기록 (`business_archy/v10_반영목록.txt` 10장), 화면 부제는 "최근 7일, Dreamer 들의 마음이 모인 상상"
- 검증: `npm run build` 통과. 화면은 사용자 브라우저 확인

---

## 2026-11-10 — 분야 뱃지를 ⋯ 메뉴로

- 카드의 분야 뱃지 제거 — 한 상상이 여러 분야에 속하면 뱃지가 늘어나 보기 어려워서 (사용자 의견)
- ⋯ 메뉴에 **[뱃지 보기]** 추가 → 메뉴가 그 상상의 분야 뱃지 목록으로 바뀜(누르면 그 분야 피드), [‹ 뱃지]로 돌아감 — `ItemMenu`
- 상세 시간 줄: 시각 · 날짜 · **원본 / Shake it** 만 (분야 빠짐). 인용 글은 "인용", AI 도움 표시는 남김 — `ImaginationPage`
- 검증: `npm run build` 통과. 기획 반영 목록: `business_archy/v10_반영목록.txt` 9장

---

## 2026-11-10 — Sprint 3 확인 후 수정 (사용자 캡처 피드백)

| 요청 | 조치 |
|---|---|
| 프로필 수정에서 이름·자기소개 칸이 이중 테두리 | 안쪽 입력칸의 전역 포커스 테두리(`:focus-visible`)를 끄고 바깥 상자만 강조 — `EditProfileModal.module.css` |
| 인기 상상 화면에 오른쪽 컬럼이 없음 | 다른 화면처럼 오른쪽 컬럼 표시 (`AppShell` WIDE_PATHS 비움, 넓은 본문 구조는 남겨 둠) |
| 상상하기 유도 영역 구조 | 분야 칩 · 별 아이콘 제거, (프로필 이미지) "오늘 상상한 미래의 모습을 사람들과 공유해보세요!" …… [상상하기] — `ImaginePrompt` |
| 오른쪽 인기 상상 블록에 버튼 요약 | 작성자 옆에 Thunder · Wave · 댓글 · Shake it 아이콘 + 수 (액션 바와 같은 순서) — `RightRail` |
| 팔로잉 · 팔로워를 누르면 목록 | `/@닉네임/following` · `/followers` (X), 탭 [팔로워 | 팔로잉], "나를 팔로우합니다" 표시, [팔로잉] / [서로 팔로우하기] / [팔로우] — `FollowListPage` · API `GET /api/users/{nickname}/followers|following` |
| "왜 원하나요" 상자 색 | 보라 세로줄 없이 회색 배경, 제목 글자 회색 — `ImaginationPage.module.css` |

- 검증: pytest 34 passed(팔로우 목록 테스트 추가) · ruff · `npm run build` 통과 · 개발 서버로 팔로워 목록 API · 화면 경로 200 확인. 화면은 사용자 브라우저 확인
- 기획 반영 목록: `business_archy/v10_반영목록.txt` 8장

---

## 2026-11-10 — Sprint 3 ✅ 관계와 탐색 (X 구조 반영)

### 결정 (`business_archy/v10_반영목록.txt` 7장)
- 홈 탭 줄 아래 상상하기 유도 영역(X 의 글쓰기 자리, 누르면 상상하기 화면) · 프로필·알림·프로필 수정은 X 구조
- 프로필 탭 [상상 | 댓글 | Wave] (미디어 없음) · 위치·가입일·인증 배지·생년월일 없음 · 알림 [전체 | 댓글] (멘션은 추후)
- 기본값: 알림 comment_id 없음 · 인기 = 최근 7일 상상 점수 순 · 추천 Dreamer = 받은 Thunder 순 · 닉네임 바꾸면 주소도 바뀜 · 댓글 Thunder 도 알림

### 백엔드
| 영역 | 내용 |
|---|---|
| DB | 마이그레이션 0004: follows · notifications · users.cover_url |
| users | `service.py` 프로필 · 프로필 탭 · 팔로우 · 추천 Dreamer · 카드 · 프로필 수정(이미지 2장) · 비밀번호, `router.py` `/api/users/*` |
| 피드 | 추천 탭 점수 순(순번 커서 `encode_offset`) · 팔로잉 탭 = 상상 + Wave (UNION + DISTINCT ON) · `waved_by` · 인기 `/api/trending` |
| 알림 | `notifications/` — `notify()` 를 반응·인용·댓글·팔로우에서 부름, 같은 Thunder·Wave·팔로우는 한 번, 목록·안 읽은 수·모두 읽음 |
| 기타 | 닉네임·비밀번호 규칙을 `check_nickname` · `check_password` 로 빼서 가입·수정이 같이 씀, seed 팔로우·알림 |

### 프론트
- `ImaginePrompt`(홈 유도 영역) · 상상하기 화면 `?domain=` 미리 고르기 · 카드 Wave 줄 · Wave 할 때 via 보내기
- `ProfilePage` · `EditProfileModal` · `NotificationsPage` · `TrendingPage`(넓은 본문, `AppShell` WIDE_PATHS) · `SettingsPage`
- `FollowButton`(팔로잉 hover → 언팔로우) · `useUnread`(60초) · `useDreamerCard`(상세 작성자 ↔ 오른쪽 블록) · `usePaged` 제네릭
- `RightRail`: 인기 상상 1~5 · 추천 Dreamer · 이 상상의 Dreamer

### 문제와 조치
- `select().distinct(col)` 이 SQLAlchemy 에서 deprecated 경고 → `postgresql.distinct_on` 으로 교체
- 넓은 본문(인기 상상)이 900px 아래에서 사이드바 폭을 잘못 받음 → 미디어 쿼리 순서 정리
- **`seed-demo --reset` 을 다시 실행해서 샘플 계정으로 쓴 테스트 글이 또 지워졌을 수 있음** (Sprint 2 때와 같은 문제) → 다음부터는 실행 전에 묻는다

### 검증
- pytest 33 passed · ruff 통과 · `npm run build` 통과 · 개발 서버 API 확인. 화면은 사용자 브라우저 확인

---

## 2026-11-10 — 글쓰기 버튼 이름 "상상하기"로 통일

- 사이드바 [상상 쓰기] → **[상상하기]** — 오른쪽 "이번 주 질문"의 [상상하기] 버튼과 같은 이름 (사용자: "쓰기"보다 생동감이 있다)
- 같이 바꾼 곳: 접힌 사이드바 둥근 버튼 · 모바일 상단 바 아이콘의 이름, 글쓰기 화면 제목, 홈 빈 화면 버튼("가입하고 상상하기")
- 검증: `npm run build` 통과. 기획 반영 목록: `business_archy/v10_반영목록.txt` 6장

---

## 2026-11-10 — Sprint 2 확인 후 수정 (사용자 피드백)

| 요청 | 조치 |
|---|---|
| 서재에서 북마크를 해제하면 안내 메시지가 뜸 | 해제할 때는 안내하지 않음 (담을 때만 "서재에 담았어요") — `ActionBar` |
| 서재에 Shake it 기록 탭 | 서재 탭 [북마크 · Thunder · **Shake it** · 최근 본 상상]. 내가 섞어 만든 혼합 글 목록(`/api/me/library?tab=shakes`), Sprint 5 전에는 빈 상태 문구 — `LibraryPage` · `reactions/service.py` |
| 사이드바 "인기 상상" 아이콘 불꽃 → 번개 | lucide `Zap` (크기 26 · 선 굵기 1.8 — 다른 메뉴와 같음). 모바일 하단 탭 "인기"도 같이 바꿈 — `navItems` · `BottomTabBar` |
| 로고 I 앞이 메뉴 아이콘보다 왼쪽 | 로고 왼쪽 여백 14px (메뉴 안쪽 여백 12 + 아이콘 안 빈 가장자리 약 2) — `SideNav .logo`. 접힌 사이드바(700~900px)는 가운데 정렬 그대로 |

- 검증: pytest 26 passed(서재 Shake it 탭 검사 추가) · ruff · `npm run build` 통과. 화면은 사용자 브라우저 확인
- 기획 반영 목록: `business_archy/v10_반영목록.txt` 5장

---

## 2026-11-10 — Sprint 2 ✅ 반응 + 댓글(X 구조) + 서재

### 결정 (Sprint 2 검토 → `business_archy/v10_반영목록.txt` 2~4장)
- 상상 응답에 `my`(내가 눌렀는지) 추가 · Wave 줄·확산 경로는 Sprint 3 · 인용은 본문만(300자, 분야는 원본) · 알림은 Sprint 3
- 반응을 켜고 끈 기록 `reaction_events` (기록 범위는 추후 검토)
- 상상 상세·댓글은 하이젠버그가 아닌 **X 게시물 상세 구조** (`etc_datas/x_로그인_카드상세_1~4`): 액션 바는 글 아래 한 번, 댓글 패널 없음, ⋯ 옵션 메뉴 제외 → CLAUDE.md 예외 한 줄 추가
- **댓글도 게시글로 저장**(kind=comment) — 댓글에도 게시글과 같은 액션 바, 댓글 좋아요 = 번개(같은 thunders 표, kind 로 구분)
- 댓글 정렬은 최신순만, 답글은 1단계(깊이는 고도화 때), 글자만 입력. AI 호출 답글(@grok 같은)은 추후 과제 후보

### 백엔드
| 영역 | 내용 |
|---|---|
| DB | 마이그레이션 0003: imaginations.kind 에 comment · parent_id · root_id, thunders · waves · bookmarks · reaction_events |
| 반응 | `POST/DELETE /api/imaginations/{id}/thunder\|wave\|bookmark` → `{my, counts}`. 내 글 Thunder·Wave 막기, Wave 권한, 이미 켜진 걸 또 켜면 수·기록 그대로 |
| 응답 | `service.present()` 가 목록 단위로 actions · my · 인용 원본(quoted) · 답글 대상(reply_to) 을 한 번에 채운다 |
| 인용 | `POST /api/imaginations/{id}/quote {body}` — 하루 상상 쓰기 한도 포함, 원본 삭제 시 `quoted.deleted` |
| 댓글 | `GET/POST /api/imaginations/{id}/comments` — 최신순 · 답글 오래된 순 · 답글의 답글은 같은 댓글 줄로 · 답글 남은 삭제 댓글은 자리 유지 |
| 서재 | `GET /api/me/library?tab=bookmarks\|thunders\|recent` — 북마크는 댓글 포함, Thunder 는 상상만, 최근 본 상상 최대 100 |
| 기타 | 피드·하루 쓰기 수에서 댓글 제외, 댓글 id 상세 → root_id, seed-demo 에 반응·댓글·답글·인용·조회 추가 |

### 프론트
- `ActionBar`: my 로 켜짐 색, 누르면 바로 반영 후 실패 시 되돌림, 켜질 때 한 번 움직임, `WaveMenu`·`QuoteModal`, 댓글 공유 = `/i/원글#c댓글`
- `ImaginationPage`: X 구조로 재배치(작성자 줄 → 제목 → 본문 → 왜 원하나요 → 이미지 → 인용 카드 → 시간 줄 → 액션 바 → 댓글), 하단 작성자 카드 제거
- `components/comments/`: 입력창(접힘 → 펼침) · 댓글 줄(X) + 같은 액션 바 · 답글 세로선 · "삭제된 댓글이에요"
- `LibraryPage`(/library), `usePaged`(피드·서재 공통), `QuoteEmbed`, 카드에 인용·댓글 모양

### 문제와 조치
- 버튼이 켜질 때 움직임이 hover 움직임에 가려짐 → 켜짐 움직임 CSS 우선순위를 올림
- 댓글을 달아 상세의 댓글 수가 바뀌면 방금 누른 Thunder 가 옛 상태로 돌아갈 수 있음 → 액션 바가 부모에게서 댓글 수만 따로 받도록 나눔
- 마이그레이션 자동 생성이 CHECK 제약(kind) 변경을 못 잡고 FK 이름이 비어 있음 → 손으로 이름 · 제약 변경 추가, 내리기까지 확인
- `seed-demo --reset` 은 샘플 계정의 글을 모두 지운다 → 사용자가 샘플 계정으로 쓴 테스트 상상도 함께 지워짐

### 검증
- pytest 26 passed · ruff 통과 · `npm run build` 통과 · 개발 서버 API 확인. 화면은 사용자 브라우저 확인

---

## 2026-11-10 — 화면 다듬기: 탭 가로 스크롤 바 · 오른쪽 카드 잘림 (사용자 캡처 피드백)

| 문제 | 원인 | 조치 |
|---|---|---|
| 로그인 후 홈 분야 칩 줄에서 Life 가 안 보임 | 칩이 본문 폭(600)을 넘는데 스크롤 바를 숨겨 둠 | 칩 줄·글자 탭 아래에 **가는 가로 스크롤 바**(6px, 넘칠 때만) — `DomainChips` · `Tabs` |
| 검색창 아래 "이번 주 질문" 카드 윗테두리가 잘려 보임 | 오른쪽 컬럼 전체가 스크롤되면서 카드가 고정된 검색창 밑으로 들어감 | 검색창은 고정, **그 아래 카드 영역만 스크롤** + 위쪽 12px 흐려짐 — `AppShell .right` · `RightRail .scroll` |

- 로그인 전 분야 탭(추천 + 8개)도 넘치면 같은 스크롤 바가 생긴다. 로그인 후 [추천|팔로잉|최신]은 넘치지 않아 바가 없다.
- 검증: `npm run build` 통과. 화면은 사용자 브라우저 확인

---

## 2026-11-10 — 기획안 v9 + Sprint 1 ✅

### 기획안 v9 (`business_archy/플랫폼_기획안_v9.txt`)
- 하이젠버그 **로그인 이후** 화면 캡처(`etc_datas/heisenberg_로그인_*.png`) 반영: 로그인 전·후 사이드바, [상상 쓰기] 버튼(로그인 후, 가입하면 누구나 — 에디터 신청 없음), 계정 칩·메뉴(내 활동은 계정 메뉴로), 로그인 모달, 홈 [추천|팔로잉|최신] + 분야 칩, 서재·알림·프로필·인기 상상 구조
- 용어(Thunder · Observe Note · Dreamer), 11-09·10 UI 결정, actions 원칙, 연령대 제거, 인증 PyJWT + bcrypt, 제목·글자 수·수정 불가 결정, 스프린트 재조정
- v9 반영 목록은 `v9_반영목록.txt`(완료 표시), 다음 변경은 `v10_반영목록.txt` 에 모은다

### Sprint 1 — 백엔드
| 영역 | 내용 |
|---|---|
| DB | 마이그레이션 0002: users · user_tiers · policy_settings · domains · imaginations · imagination_views + 시드(분야 8 · 기본 등급 · 한도 기본값 14개) |
| 인증 | `auth/security.py`(bcrypt · PyJWT) · `deps.py`(optional_user · current_user · admin_user) · 가입/로그인/내 정보 |
| 이용 한도 | `policy/service.py` — 개인(만료 확인) → 등급 → 전체 → 코드 안전값, 오늘 쓴 상상 수(한국 시간 자정), `GET /api/me/limits` |
| 상상 | `imaginations/` — 쓰기(multipart · 글자 수 · 하루 횟수 · 이미지) · 피드(커서) · 상세(조회 기록) · 삭제(status=deleted) |
| actions | `imaginations/actions.py` — 버튼별 allowed/reason/remaining |
| 공통 | `shared/errors.py`(오류 형식) · `shared/cursor.py` · `shared/time.py` · `infrastructure/storage/images.py` |
| CLI | `python -m app.interfaces.cli create-admin` · `seed-demo [--reset]` |
| 테스트 | `tests/conftest.py` 가 imagine_test 를 Alembic 으로 준비, 테스트마다 사용자 데이터 비움 · 16 passed |

### Sprint 1 — 프론트
| 영역 | 내용 |
|---|---|
| 로그인 | `hooks/useAuth.tsx`(토큰 localStorage) · `components/auth/AuthModal` · `/login` `/signup` = 홈 + 모달 |
| 사이드바 | `navItems.sideNav()` 로그인 전·후 메뉴 · [상상 쓰기] · `AccountChip`(계정 메뉴, 이메일 일부 가림) · 더 보기 = 다크 모드만 |
| 홈 | `useFeed`(커서 · 무한 스크롤) · `DomainChips` · 주소 `?tab=&domain=` |
| 화면 | `pages/write/WritePage`(S3) · `pages/imagination/ImaginationPage`(S4) · `PageHeader`([←] 제목) |
| 카드·버튼 | `ImaginationCard`(API 데이터) · `ItemMenu`(링크 복사 · 삭제) · `ActionBar`(actions → 흐리게 + 토스트) · `Toast` |
| 오른쪽 | "추천 주제" 블록 추가 |
| 모바일 | 상단 바(로그인 후 글쓰기) · 하단 탭 홈 · 인기 · 서재 · 알림 · 마이 |
| 정리 | `designPreview.ts` · `types/imagination.ts` 삭제 → `types/api.ts` |

### 검증
| 항목 | 결과 |
|---|---|
| `uv run pytest` | 16 passed |
| `uv run ruff check .` / `ruff format --check .` | 통과 |
| `npm run build` (tsc + vite) | 통과 (JS 225KB, gzip 74KB) |
| `alembic upgrade head` (dev) | 0001 → 0002 |
| `seed-demo` · `create-admin` | Dreamer 10명 · 상상 50개 · 운영자 1명 |
| 실행 중 서버(5173 프록시) | 피드 20개 + next_cursor · 로그인 · limits · 이미지 글쓰기 → /uploads 200 · 삭제 204 · /write · /i/3 200 |

### 문제 · 조치
| 문제 | 조치 | 상태 |
|---|---|---|
| `*.local` 이메일이 검증에서 거절됨 (예약 도메인) | 테스트·샘플 계정을 `example.com` 으로 | 해결 |
| 테스트가 `DATABASE_URL` 을 테스트 DB 로 바꾸면서 설정 기본값 테스트 실패 | 그 테스트에서만 환경 변수 제거 | 해결 |
| CLI 에서 `users.tier_id` FK 를 못 찾음 (등급 모델 미등록) | CLI 가 `model_registry` 를 불러오게 함 | 해결 |
| `types/api.ts` 주석의 `*/` 때문에 빌드 실패 | 주석 수정 | 해결 |
| Alembic `path_separator` 경고 | `alembic.ini` 에 `path_separator = os` | 해결 |
| 브라우저 화면 확인 | 이 환경에 브라우저가 없어 API·빌드로만 확인 | 사용자 확인 필요 |

---

## 2026-11-10 — 맨 위 줄 맞춤 (사용자 요청)

로고 · 분야 탭 글자 · 검색창의 위 여백이 서로 달라 보임(검색창이 맨 위에 붙어 있었음) → **세로 가운데를 한 줄에 맞춤** (사용자가 "윗변 맞춤" 대신 선택).

| 항목 | 이전 | 지금 |
|---|---|---|
| 맨 위 띠 높이 `--tab-height` | 53px (로고 칸만 64px) | **64px** 하나로 통일 |
| 로고 칸 | 고정 64px | `var(--tab-height)` |
| 분야 탭 줄 | 53px | 64px (글자 · 밑줄 위치는 같은 규칙) |
| 검색창 위 여백 | 약 5px | 10px (64 − 44) ÷ 2 |

- 바꾼 파일: `styles/tokens.css`, `layout/SideNav.module.css`, `layout/RightRail.module.css`(주석), `docs/design-system.md`
- 모바일 상단 바(`--mobile-bar-height` 53px)는 그대로.
- 검증: `npm run build` 통과. 화면은 사용자 브라우저 확인

---

## 2026-11-10 — 액션 버튼 hover 정리 (사용자 요청)

버튼마다 hover 색(노랑·파랑·보라)과 원형 배경이 달라 통일감이 없다는 의견 → **움직임만 남김**.

| 항목 | 이전 | 지금 |
|---|---|---|
| hover 원형 배경 | 기능 색 10% 원 | 없음 |
| hover 아이콘 색 | 기능 색으로 바뀜 | 바뀌지 않음 (회색 그대로) |
| 툴팁 | 마우스를 올리면 이름 표시 | 없음 (`aria-label` 은 유지 — 스크린리더용) |
| 움직임 | Thunder · Wave · 댓글 · Shake it | + **북마크(톡 내려앉음) · 공유(화살표 들썩)** 추가 → 6개 모두 움직임 |
| 켜짐 색 | Thunder 노랑 · Wave 파랑 · 북마크 보라 | 그대로 (눌렀을 때만) |

- 바꾼 파일: `design-system/IconButton.tsx` · `.module.css`(hover 색·배경·툴팁 제거, `--hover-color` 제거), `actions/ShakeButton.tsx` · `.module.css`(같은 정리), `actions/ActionBar.tsx` · `.module.css`(북마크·공유 움직임), `card/ImaginationCard.tsx`(쓰이지 않던 `data-tooltip` 제거), `docs/design-system.md`
- `IconButton` 을 쓰는 다른 곳(모바일 상단 바, 카드 더보기 버튼)도 같은 규칙이 적용된다.
- 검증: `npm run build` 통과. 화면 움직임은 사용자 브라우저 확인

---

## 2026-11-10 — 용어 재정리 (사용자 결정)

Imagine 만의 놀이 문화를 만들기 위해 흔한 SNS·번역투 용어를 고유 이름으로 바꿨다.

| 이전 | 새 용어 | 뜻 |
|---|---|---|
| 공명(하트) | **Thunder** | 하트와 같은 반응. 상상은 번개처럼 번뜩인다 (Imagine Dragons 의 노래 "Thunder"에서 착안) |
| 관측 노트 | **Observe Note** | 운영자가 발행하는 노트 |
| 상상가 | **Dreamer** | 사용자. 상상하는 사람 |

### 바꾼 곳
| 파일 | 내용 |
|---|---|
| `CLAUDE.md`(상위 폴더) | 용어 절 |
| 프론트 `ActionBar` · `types/imagination.ts` · `designPreview.ts` | 툴팁 "Thunder", 코드 이름 `resonance` → `thunders`, `resonated` → `thundered` |
| `styles/tokens.css` · `IconButton` 주석 | `--color-resonance` → `--color-thunder`, 색은 노랑으로 |
| `ActionBar.tsx` · `.module.css` | Thunder 아이콘 번개(`Zap`) · 움직임 `thunder-flicker` / `thunder-strike` |
| `navItems` · `App.tsx` | 메뉴·화면 제목 "Observe Note" |
| `RightRail` | "추천 Dreamer" |
| 백엔드 `reactions` · `notes` 설명, `prompts/v1/README.md` | 새 용어 |
| README · app-structure · design-system · db-guide · sprint(예정 스프린트) | 새 용어 |

- **Thunder 의 의미 (사용자 결정)**: "번뜩인다, 멋지다"를 담은 **호감 신호**이고, 분석에서는 **욕망의 표시 지표**로 쓴다. (옛 공명의 "나도 이런 상상 했어요"라는 반복 신호는 버튼에 담지 않는다 → 필요하면 비슷한 상상(임베딩)으로 측정)
- **Thunder 아이콘**: 하트 → 번개(lucide `Zap`). 켜짐 색 진한 노랑 `#d97706`(다크 `#fbbf24`). 움직임: 마우스를 올리면 번쩍번쩍 깜빡임 + 살짝 흔들림, 누르면 내리꽂히듯 커지며 빛이 번짐. 화면 확인은 사용자 몫
- **Observe Note**: 이 명칭으로 확정
- 지난 기록(이 문서의 이전 항목, README "최근 변경"의 11-09 항목, 완료된 스프린트 체크리스트, 논의요약_1109)은 당시 기록이므로 고치지 않았다.
- 기획안 v8 은 옛 용어 그대로다. 오늘 변경 사항을 모아 v9 에 한 번에 반영한다.

### 검증
- `npm run build`(tsc + vite) 통과 · `uv run ruff check .` 통과

---

## 2026-11-09 — UI 다듬기 정리 (오늘 변경 요약)

UI 기준 반영(하이젠버그 캡처) 이후 사용자 피드백으로 여러 번 고친 내용을 **최종 상태 기준**으로 정리한다. 아래 개별 기록 중 "→ 이후 대체" 표시가 있는 항목은 중간 단계다.

| 영역 | 최종 상태 | 거쳐 온 단계 |
|---|---|---|
| 레이아웃 | 헤더 없음 · 사이드바 275 · 본문 600 · 오른쪽 350, 반응형 4단계 | 상단 헤더 3단 → 캡처 구조 |
| 분야 | 본문 상단 글자 탭(선택 밑줄) | 분야 칩 → 글자 탭 |
| 액션 바 | 공명 · Wave · 댓글 · Shake it …… 북마크 · 공유 | 공명 · 댓글 · Wave … ┃ Shake → 댓글 · Wave · 공명 … ┃ Shake → 현재 |
| 움직임 | 하트 두근 · Wave 넘실 · 댓글 톡톡 · Shake 숟가락·젓가락 들썩 + 별 깜빡 | Wave 만 → 전체 |
| Wave 아이콘 | 참고 이미지(`wave_imoji_2.png`) 윤곽을 딴 채워진 파도, 켜짐 = 파랑 | lucide 물결 → 선으로 그린 파도(식물처럼 보임) → 현재 |
| Shake it 아이콘 | 비빔밥 그릇 + 숟가락 · 젓가락 + 별 5개 선 아이콘 (`shake_it_imoji.png`) | 그라데이션 원 + 두 원 → 그릇 + 숟가락 휘젓기 → 현재 |
| 로고 | 보라 글자 로고, Heavy + 외곽선, 가로 1.14배, 첫 글자 = 파비콘 I(글꼴 대문자 높이에 맞춤), 가입하기 버튼과 시작점 맞춤 | 마크(투명 오류) + 얇은 글자 → 글자만 → I 교체 → I 높이 맞춤 |
| 파비콘 | 보라 둥근 정사각형 + 흰 대문자 I | 그라데이션 + 두 원 → 비빔밥 → 현재 |
| 탭 제목 | Imagine - 당신의 상상이 세상을 바꿉니다 | Imagine |
| 검색창 | 상단 탭 줄과 같은 높이(위 여백 약 5px), 높이 44px | 맨 위에 붙어 있었음 |

### 기획안(v8)과 달라진 점 — 다음 기획안 갱신 때 반영
- 상단 헤더 없음 (기획안 4장 데스크톱 그림의 헤더 → 왼쪽 사이드바)
- 분야 "칩" → 분야 "탭"
- 액션 바 순서와 Shake it 버튼 모양 (기획안 5장: 하트 맨 앞, Shake it 은 "채워진 원형 그라데이션 버튼" → 지금: 공명 · Wave · 댓글 · Shake it 같은 줄, 모두 선 아이콘)
- Wave 아이콘: lucide Waves → 자체 파도 아이콘
- 파비콘 · 탭 제목 · 로고 형식 (기획안에 없던 항목)

---


## 2026-11-09 — 로고 I 높이 맞춤

- 문제: 첫 글자 I(SVG)가 다른 글자보다 낮고 바닥이 떠 보임
- 원인: 나눔스퀘어 네오 Heavy 는 글자가 기준선보다 0.106em 아래까지 그려지고 대문자 높이가 0.822em 인데(글꼴 파일에서 직접 측정: I 글리프 -106 ~ 716, unitsPerEm 1000), I 를 0.75em 높이로 기준선에 붙여 놓았음
- 수정: I 높이 0.822em, 0.106em 아래로 내림. 획 두께도 글꼴에 맞춰 다시 그림(글꼴 단위 경로, 외곽선 0.9px 동일). 글꼴 원래 I 와 나란히 그려 높이 · 바닥이 같음을 확인
- 파일: `components/layout/ImagineLogo.tsx` · `.module.css`

---

## 2026-11-09 — 로고 첫 글자 I · 굵기

- 문제: 글꼴의 대문자 I 가 세로 막대라 소문자 l 처럼 보이고, 로고가 얇아 눈에 띄지 않음
- 첫 글자 I 를 **파비콘의 I 와 같은 SVG**(위·아래 가로획)로 바꿈 — 파비콘 좌표(`M10 7h12v4…`)를 그대로 잘라 써서 모양이 같다. 높이는 대문자 높이, 글자 기준선에 맞춤
- 나머지 "magine" 은 로고 전용 **나눔스퀘어 네오 Heavy**(고정 굵기, 네이버 CDN) + 외곽선 0.3 → 0.9px
- 파일: `components/layout/ImagineLogo.tsx` · `.module.css`, `styles/tokens.css`(Heavy 글꼴 등록)

---

## 2026-11-09 — 오른쪽 검색창 위 여백

- 검색창이 페이지 맨 위에 붙어 있었음 → 하이젠버그처럼 본문 상단 탭 줄(53px)과 같은 높이에서 세로 가운데에 오도록 위 여백(약 5px) 추가, 높이 42 → 44px
- 파일: `components/layout/RightRail.module.css`

---

## 2026-11-09 — 파비콘 단순화 · 페이지 제목

- 파비콘을 단순하게: 비빔밥 아이콘 → **보라 둥근 정사각형 + 흰 대문자 I** (하이젠버그 파비콘 형식). 16px · 32px, 밝은 · 어두운 탭에서 그려 확인
- 페이지 제목 · 설명: `Imagine - 당신의 상상이 세상을 바꿉니다` (`index.html` 의 `<title>` · `meta description`)
- 접힌 사이드바 로고 마크(옛 두 원 모양)도 파비콘과 같은 모양으로 통일
- 옛 아이콘이 보이면 강력 새로고침(Ctrl+Shift+R)

---

## 2026-11-09 — 파비콘 교체  → 이후 대체(일부)

- 브라우저 탭 아이콘이 옛 Shake it 모양(그라데이션 사각형 + 두 원)이었음 → 지금 Shake it 버튼 아이콘(비빔밥 그릇)으로 교체
- `frontend/public/favicon.svg`: `ShakeIcon` 의 선을 그대로 쓰되 보라 선 · 배경 없음, 16px 용으로 별 2개만 남기고 선 1.9
- 16px · 32px, 밝은 탭 · 어두운 탭 배경에서 그려 확인 (그릇 · 숟가락 · 젓가락 · 별 구분됨)
- 브라우저가 옛 아이콘을 캐시하고 있으면 강력 새로고침(Ctrl+Shift+R) 필요

---

## 2026-11-09 — 로고 위치 · 굵기 조정  → 이후 대체(일부)

### 지시
- 로고 위치가 애매함 → 앞부분을 "가입하기" 버튼 시작점과 맞추기
- 더 두껍고 좌우로 넓게 (눈에 잘 띄도록), 너무 키우지는 않기

### 원인
- 로고 앞의 마크가 **투명하게 그려지고 있었음**: SVG `<stop stopColor="var(--…)">` 처럼 SVG 속성에 CSS 변수를 넣으면 적용되지 않는다. 보이지 않는 마크(28px)와 여백(12px)만큼 글자가 오른쪽으로 밀려 있었다

### 반영
| 파일 | 내용 |
|---|---|
| `components/layout/ImagineLogo.tsx` · `.module.css` | 넓은 사이드바·모바일은 **글자 로고만**. 25px(23→25) · 굵기 900 + 얇은 외곽선 · 가로 1.14배(`scaleX`) · 강조색. 마크는 접힌 사이드바(700~900px)에서만, 색은 `style={{ stopColor: var(...) }}` 로 고침, 그라데이션 id 는 `useId` 로 중복 방지 |
| `components/layout/SideNav.module.css` | 로고 좌우 여백 0 → 가입하기 버튼과 같은 시작점, 로고 영역 높이 53 → 64px |

---

## 2026-11-09 — Wave 아이콘 다시 만들기 (식물처럼 보인다는 피드백)

### 지시
- 바꾼 Wave 아이콘이 파도가 아니라 식물처럼 보임 → `etc_datas/wave_imoji_2.png` 로 만들 것

### 원인
- 선 아이콘으로 옮기면서 안쪽 파도의 물마루(갈라진 부분)가 가는 선 몇 개로만 남아, 작은 크기에서 잎사귀처럼 보였다

### 반영
- 참고 이미지에서 **윤곽선을 직접 추출**(검은 영역 → 윤곽 추적 → 점 줄이기 → 24×24 로 축소 → 부드러운 곡선)해서 `WaveIcon` 을 **채워진 파도**로 교체. 바깥 곡선과 안쪽 파도가 이어진 한 덩어리 + 사이의 빈 공간(evenodd)
- 켜짐 표시: 채움 전환 대신 **파란색**으로
- 움직임: 아이콘 전체가 왼쪽 아래를 축으로 앞으로 밀려왔다 물러나며 넘실(hover), 누르면 한 번 크게 솟구침
- 확인: 240px · 40px · 20px PNG 로 그려 참고 이미지와 비교 — 작은 크기에서도 파도로 보임

---

## 2026-11-09 — Wave 아이콘 교체 (참고 이미지)  → 이후 대체(일부)

### 지시
- Wave 아이콘을 `etc_datas/wave_imoji.png` 느낌으로 바꾸고, 파도가 움직이는 느낌 추가

### 반영
| 파일 | 내용 |
|---|---|
| `components/actions/WaveIcon.tsx` (신규) | 24×24 선 아이콘: 바깥 곡선 `wave-curl`(파도 머리가 말려 끝이 감김) + 안쪽 파도 `wave-body`(물마루가 갈라진 모양). Wave 를 켜면 `wave-body` 가 채워짐 |
| `components/actions/ActionBar.tsx` · `.module.css` | lucide `Waves` → `WaveIcon`. hover: 안쪽 파도가 밀려오며 넘실(이동 · 기울기 · 높이), 바깥 곡선이 감겼다 풀림. 켤 때: 한 번 크게 솟구침 |
| `design-system/IconButton.tsx` | `icon` 타입을 lucide 전용에서 "같은 props 를 받는 아이콘 컴포넌트"로 넓힘 (`IconComponent`) |

- 확인: 아이콘을 240px · 42px PNG 로 그려 참고 이미지와 비교 (선 · 채움 두 상태)
- `tsc` 통과 · 개발 서버 HMR 반영. 움직임은 브라우저에서 사용자 확인 필요

---

## 2026-11-09 — Shake it 아이콘 교체 (참고 이미지)

### 지시
- Shake it 버튼을 `etc_datas/shake_it_imoji.png` 처럼 바꾸고, 숟가락과 젓가락이 들썩거리면서 별표가 깜빡이게

### 반영
| 파일 | 내용 |
|---|---|
| `components/actions/ShakeIcon.tsx` | 참고 이미지를 24×24 선 아이콘으로 다시 그림: 받침 있는 그릇 · 소복한 밥 · 왼쪽 숟가락 · 오른쪽 젓가락(두 줄) · 4갈래 별 5개(크기 3종). 움직임용 class: `shake-spoon` · `shake-chopsticks` · `shake-star-1~5` |
| `components/actions/ShakeButton.module.css` | 휘젓기 → **들썩임**: 숟가락·젓가락이 0.35초 차이로 번갈아 위로 들썩(살짝 기울며), 별 5개가 0.25초 간격으로 차례로 깜빡(흐려지며 작아졌다 돌아옴). 아이콘 22px |

- 확인: 아이콘을 240px · 42px · 21px PNG 로 그려 참고 이미지와 비교 (그릇 · 밥 · 숟가락 · 젓가락 · 별이 실제 크기에서도 구분됨)
- `tsc` 통과 · 개발 서버 HMR 반영. 움직임은 브라우저에서 사용자 확인 필요

---

## 2026-11-09 — 카드 액션 바 수정 (사용자 피드백)  → 이후 대체(일부)

### 지시
1. 버튼 순서: 하트 > Wave > 댓글 > Shake it, 간격을 띄우고 북마크 · 공유
2. 하트 · 댓글도 Wave 처럼 약간의 움직임
3. Shake it 아이콘: 배경 없는 선 아이콘으로, 그릇에 담긴 비빔밥을 숟가락 · 젓가락으로 섞는 모양 + 작은 AI 별. 흔들기 대신 숟가락을 휘젓는 움직임

### 반영
| 파일 | 내용 |
|---|---|
| `components/actions/ActionBar.tsx` · `.module.css` | 순서 [공명 · Wave · 댓글 · Shake it] (4칸 같은 간격, 최대 400px) … [북마크 · 공유]. 구분선 제거. 하트 = 두근(누르면 톡), 댓글 = 톡톡 기울어짐 |
| `components/actions/ShakeIcon.tsx` | 새 아이콘: 그릇(테두리 · 몸통 · 받침) + 밥 윗면 + 젓가락 2개 + 숟가락 + AI 별. 숟가락 · 젓가락 · 별에 각각 class |
| `components/actions/ShakeButton.tsx` · `.module.css` | 원형 그라데이션 배경 제거 → 다른 버튼과 같은 선 아이콘(32px hover 원). hover 시 숟가락 휘젓기 · 젓가락 따라 움직임 · 별 반짝임, 보라 hover 색 |

- 혼합 글의 "Shake it" 배지(그라데이션 알약)는 그대로 두고 아이콘만 새 모양으로 바뀜
- 아이콘은 PNG 로 그려 확인 (240px · 42px 모두 그릇 + 숟가락 · 젓가락 + 별로 알아볼 수 있음)
- 기획안 5장의 액션 바 순서·Shake it "채워진 원형 버튼" 설명은 이 지시로 대체됨

### 검증
- `tsc` 통과 · 개발 서버 HMR 반영
- 참고: 디자인 미리보기 카드는 개발 모드 전용이라 운영 빌드(`npm run build`)에는 포함되지 않음

---

## 2026-11-09 — UI 기준 반영: 하이젠버그 메인 캡처 (Sprint 0 추가 작업) → 이후 대체(일부)

### 지시
- `etc_datas/heisenberg_main.png` 를 기준으로 간격 · 배치 · 테두리 · 글꼴을 맞춘다
- 강조색은 지금의 보라 계열 유지 (서비스 정체성과 함께 추후 논의)
- 글꼴은 확인이 안 되면 네이버 공개 글꼴 중 무난한 것

### 캡처 분석 → 반영
| 캡처 | 반영 |
|---|---|
| 상단 헤더 없음, 왼쪽 사이드바(로고 · 메뉴 · 더 보기 · 가입하기 · 로그인) | `Header` 삭제 → `SideNav` (275px, 오른쪽 세로 테두리) |
| 본문 600px, 좌우 세로 테두리, 위에 글자 탭(추천 · 바이오 …) + 선택 밑줄 | `AppShell` 3단 그리드 · `Tabs` (분야 칩 `Chip` 삭제) |
| 카드: 아바타 · 이름 · 소속 pill · 날짜 · ⋯ / 제목 / 요약 / 둥근 이미지 / #태그 pill / 액션 바, 카드 사이 1px 선 | `ImaginationCard` · `TagPill` · `Avatar` |
| 액션 바: 댓글 · 리포스트 · 하트 … 북마크 · 공유 | `ActionBar`: 댓글 · **Wave** · 공명 … 북마크 · 공유 ┃ **Shake it** |
| 오른쪽: 알약 검색창 · 테두리 16px 카드(구독 · 인기 글 · 추천 에디터) | `RightRail`: 검색창(준비 중) · 이번 주 질문 · 인기 상상 · 추천 상상가 · 푸터 |
| 알약 버튼(가입하기 채움 / 로그인 외곽선 / 팔로우 작은 채움) | `Button` / `ButtonLink` (lg · md · sm, primary · outline) |

- 글꼴: **나눔스퀘어 네오 가변 글꼴** (네이버 한글 CDN). 캡처 글꼴은 확인할 수 없어 사용자 지시대로 선택
- 색: 캡처의 남색 자리를 보라(#6d28d9, 임시)로. 글자 · 테두리 회색 계열은 캡처에 맞춤
- 반응형 4단계: 1280 · 1100(오른쪽 숨김) · 900(사이드바 아이콘만) · 700(상단 바 + 하단 탭바)
- 더 보기 메뉴: 다크 모드 · 피드백 및 문의하기 · 설정
- 개발 모드 홈에 **디자인 미리보기** 예시 카드 2개(원본 1 · Shake it 혼합 1). 버튼은 화면 상태만 바뀌고 저장되지 않음. Sprint 1 에서 삭제
- 상세 기준표: [`design-system.md`](design-system.md)

### 기획안과 달라진 점
- 액션 바 순서: 기획안 5장(하트 맨 앞) → 캡처 순서(댓글 · Wave · 공명 … 북마크 · 공유 ┃ Shake it)
- 분야 "칩" → 분야 "탭" (캡처 형태)
- 상단 헤더의 메뉴(홈 · 인기 상상 · 관측 노트)는 왼쪽 사이드바로 이동

### 검증
| 항목 | 결과 |
|---|---|
| `npm run build` (tsc + vite) | 통과 (JS 188KB · CSS 14KB) |
| 개발 서버 `localhost:5173` | 200, 새 모듈 HMR 반영, `/api/health` → `database: ok` |
| 화면 눈 확인 | **미확인** — 이 개발 환경에는 브라우저가 없어 사용자 확인 필요 |

---

## 2026-11-09 — Sprint 0: 프로젝트 골격

### 한 일
1. **개발 도구 확인**
   - Python 3.12.3(pyenv) · Node 24.15 · npm 11.14 · git 확인
   - `uv` 가 없어 `python3 -m pip install uv` 로 설치 (uv 0.13.7)
   - Docker: 처음엔 WSL 에서 사용 불가("WSL integration 을 켜라" 안내만 출력) → 사용자가 Docker Desktop 의 WSL integration(Ubuntu-24.04)을 적용한 뒤 `/usr/bin/docker` 생성, Docker 29.0.1 동작
2. **백엔드 골격** (`app/`, Insurance-Helper-v4 의 4계층 구조)
   - `infrastructure/core`: `config.py`(.env → Settings), `database.py`(엔진·세션·`check_database`), `logging.py`, `exceptions.py`
   - `main.py`: FastAPI 앱, CORS, `/health` · `/api/health` (DB 가 꺼져 있어도 200 + `database: unavailable`)
   - `domains/*`: 15개 도메인 폴더 자리 (각 `__init__.py` 에 담당 스프린트 표기)
   - Alembic: `alembic/env.py` 가 `.env` 의 `DATABASE_URL` 사용, 초기 마이그레이션 `0001` = `CREATE EXTENSION vector`
3. **인프라**
   - `docker-compose.yml`: `pgvector/pgvector:pg16`(imagine_dev, 5432) + `memgraph/memgraph:3.10.1`(7687)
   - `infra/postgres/init/01-init.sql`: 첫 실행 때 `imagine_test` 생성 + 두 DB 에 pgvector 확장
4. **프론트 골격** (`frontend/`)
   - Vite 5 + React 18 + TS, react-router 6, lucide-react, clsx
   - `styles/tokens.css`: 라이트/다크 토큰 (색은 임시값 — 하이젠버그 캡처를 받으면 확정), Shake it 그라데이션
   - `components/layout`: AppShell(3단 그리드: 220px · 본문 최대 640px · 300px) · Header · LeftNav · RightRail · BottomTabBar · Footer
     - 1080px 미만: 오른쪽 컬럼 숨김 / 720px 미만: 왼쪽 메뉴 숨김 → 하단 탭바(아이콘 5개)
   - `design-system`: `IconButton`(아이콘 + 숫자 + CSS 툴팁 + aria-label), `Chip`(분야 칩)
   - `pages/home`: 분야 칩(추천 + AI · Semiconductor · Space · Mobility · Bio · Energy · Mobile · Life) + 빈 피드 안내
   - 라우팅: 기획안 화면 목록의 모든 경로를 등록하고 미구현 화면은 `PlaceholderPage`("Sprint N 에서 만들어요")
     - 프로필 `/@닉네임` 은 react-router 6 이 '@' 부분 경로를 못 받아서 `/:handle` 로 받고 '@' 로 시작하는지 검사
   - 푸터: 개발 모드에서 `/api/health` 를 불러 백엔드·DB 연결 상태 표시
5. **문서**: README(실행 순서) · docs/sprint.md · docs/db-guide.md · docs/app-structure.md · 이 문서

### 검증
| 항목 | 결과 |
|---|---|
| `uv run pytest` | 2 passed |
| `uv run ruff check .` / `ruff format --check .` | 통과 |
| `npm run build` (tsc + vite) | 통과 (JS 182KB, gzip 59KB) |
| `docker compose up -d postgres memgraph` | `imagine-postgres` healthy · `imagine-memgraph` 실행 |
| DB 생성 | `imagine_dev` · `imagine_test`, 두 DB 모두 pgvector 0.8.7 |
| `uv run alembic upgrade head` | 0001 적용, `alembic current` = 0001 (head) |
| Memgraph `RETURN 1` (mgconsole) | 응답 정상 |
| 백엔드 실행 `GET /health` | DB 실행 전 `database: unavailable` → DB 실행 후 **`database: ok`** |
| 백엔드 `GET /docs` | 200 |
| 프론트 실행 `GET localhost:5173` | 200, `<title>Imagine</title>` |
| 프론트 프록시 `GET localhost:5173/api/health` | 백엔드 응답 그대로 전달됨 |
| SPA 경로 `GET localhost:5173/@me` | 200 |

### 문제 · 조치
| 문제 | 조치 | 상태 |
|---|---|---|
| WSL 에서 `docker` 사용 불가 | Docker Desktop → Settings → Resources → WSL integration(Ubuntu-24.04) 적용 (사용자) | 해결 |
| `uv` 미설치 | pip 로 설치 | 해결 |
| ruff 가 로컬 `alembic/` 폴더를 1st-party 로 오인해 import 정렬 경고 | `pyproject.toml` 에 `known-third-party = ["alembic", "fastapi", "sqlalchemy"]` | 해결 |
| starlette TestClient 가 `httpx` 사용 시 deprecation 경고 | 개발 의존성을 `httpx2` 로 교체 | 해결 |
| pyenv 가상환경이 켜져 있어 `uv run` 마다 `VIRTUAL_ENV ... does not match` 경고 | 무해 (uv 는 프로젝트 `.venv` 사용). README 에 안내 | 안내 |
| `npm audit`: esbuild(≤0.24.2, Vite 5 개발 서버) · react-router 6 에 moderate 취약점 | 프로토타입 로컬 개발에는 영향 작음. 공개 배포 전(Sprint 9) Vite 6+ / react-router 7 업그레이드 검토 | 보류 |

### 다음
- 사용자: 브라우저로 레이아웃 확인 · DBeaver 접속 확인
- Sprint 1: 회원(JWT) · 상상 쓰기 · 홈 피드 · 상세 · 이용 한도 계산 기반 · create-admin / seed-demo
