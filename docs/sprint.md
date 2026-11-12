# 현재 스프린트

> 계획 원본: [`../../business_archy/플랫폼_기획안_v11.txt`](../../business_archy/플랫폼_기획안_v11.txt) 12장 (v11: Sprint 4~5 결정 + Sprint 6 단계 · 시작 전 결정, 2026-11-12). 다음 변경은 `business_archy/v12_반영목록.txt`
> 문서 계층: ① 스프린트 정보 → ② 현재 작업 → ③ 완료 스프린트(역순) → ④ 스프린트 히스토리

## 스프린트 정보

- **완료: Sprint 0 ✅ (2026-11-09)** — 프로젝트 골격. 백엔드·프론트·DB(PostgreSQL+pgvector, Memgraph) 모두 실행 확인. 화면 눈 확인만 사용자 몫
- 추가: **UI 기준 반영 · 다듬기 ✅ (2026-11-09)** — 하이젠버그 메인 캡처 기준 레이아웃 · 글꼴(나눔스퀘어 네오 → 11-11 본문 Pretendard 로 변경) · 카드 · 액션 바 · Wave/Shake it 아이콘 · 로고 · 파비콘 · 탭 제목 ([디자인 시스템](design-system.md) · [변경 요약](work-log.md))
- **완료: Sprint 1 ✅ (2026-11-10)** — 회원 · 로그인 모달 · 로그인 전·후 사이드바 · 상상 쓰기 · 홈 피드 · 상세 · 이용 한도 계산 기반 · actions · CLI. 화면 눈 확인은 사용자 몫
- **완료: Sprint 2 ✅ (2026-11-10)** — 반응(Thunder · Wave · 인용 · 북마크 · 공유) · 상상 상세 X 구조 · 댓글·답글(댓글 = 게시글) · 서재. 화면 눈 확인은 사용자 몫
- **완료: Sprint 3 ✅ (2026-11-10)** — 팔로우 · 팔로잉 탭(Wave 줄 · via) · 상상하기 유도 영역 · 프로필(X) · 프로필 수정 팝업 · 알림(X) · 인기 상상 · 추천 탭 점수 · 오른쪽 컬럼 블록 · 설정(비밀번호). 화면 눈 확인은 사용자 몫
- **완료: Sprint 4 ✅ (2026-11-10)** — AI 모델 기반: Claude Haiku 5.5(글 생성) · Gemini gemini-embedding-001(임베딩) 구조 · 실측 · 결정 ([ai-models.md](ai-models.md))
- **완료: Sprint 5 ✅ (2026-11-11 ~ 2026-11-12)** — AI 기능: 5-A 태깅·임베딩 자동 ✅ → 5-B Shake it ✅ → 5-C 계보 · 비슷한 상상(리랭킹) ✅ → 5-D 태그 화면 ✅. 화면 확인 뒤 정리(Shake it 표시 · 계보 화면 · 분야/주제 용어)까지 사용자 확인 완료
- 추가: **기획안 v11 ✅ (2026-11-12)** — v10 + v11 반영목록 1~8장 + Sprint 6 시작 전 결정
- **진행: Sprint 6 (2026-11-12 ~)** — 운영자 기능. 6-A 운영자 틀 · 숨김 ✅ → 6-B 정책 · 사용자 ✅ → 6-C 이번 주 질문 ✅ (화면 확인 남음) → 6-D 대시보드 → 6-E Observe Note

---

## (진행) Sprint 6: 운영자 기능 — 숨김 · 정책 · 질문 · 대시보드 · Observe Note

> 기준: 기획안 v11 F13 · F14 · F18 · F19 · F20 · A1~A6 · 12장 · 14장 확정 18~23 (2026-11-12 시작 전 결정, 사용자: 추천안대로)
> 진행 순서: 6-A → 6-B → 6-C → 6-D → 6-E, 단계마다 검사 · 화면 확인. 화면을 본 뒤 사용자가 고칠 것을 알려 준다

### 6-A 운영자 화면 틀 + 게시물 관리 · 숨김 (A4, F19) ✅ (화면 확인 남음)
- [x] DB 마이그레이션 0010: `moderation_logs`(admin_id · imagination_id · action hide/unhide · reason · created_at). 지금 상태는 `imaginations.status`
- [x] `GET /api/admin/imaginations?status=all|visible|hidden&kind=&q=&page=&size=` (최신순, 지운 글 제외, q = 제목 · 본문 · 닉네임, 한 페이지 20 · 50 · 100 → {items, total, page, size}) · `PATCH /api/admin/imaginations/{id}` {status, reason} — 운영자만(403 admin_only)
- [x] 숨기기 · 다시 보이기 때 다른 글의 집계(인용 수 · 재료 Shake 수 · 댓글 수)를 맞춤 — 삭제와 같은 함수(`adjust_related_counts`)
- [x] 숨긴 글: 피드 · 목록 · 반응에서 빠짐(보이는 글만 읽는 기존 조회), 상세는 작성자 · 운영자에게만(`hidden=true`, actions 는 작성자 삭제만), 작성자는 숨긴 내 글을 지울 수 있음(집계 두 번 빼지 않음)
- [x] 화면: `AdminLayout`(/admin, 운영자만, 서비스 사이드바 + 넓은 본문 + 메뉴 탭 [대시보드 · Observe Note · 이번 주 질문 · 게시물 · 사용자 · 기본 정책 · 탐색기], 아직 없는 화면은 자리표시) · A4 `AdminImaginationsPage`(상태 · 종류 · 찾기 → 표, 숨길 때 메모, [더 보기]) · 상세 맨 위 "운영자가 숨긴 상상이에요" 안내
- [x] (확인 후 추가) 표가 본문 폭을 넘음 → 칸 폭 고정(`table-layout: fixed`) + 말줄임 · 반응은 아이콘 + 숫자 · 작성일 한 줄(2026.11.12 13:49) · 숨기기 메모는 그 줄 아래 한 줄로 · 좁은 화면은 표를 가로로 밀어 봄. [더 보기] → **페이지 번호**(‹ 1 … 4 5 [6] 7 8 … 20 ›) + 한 페이지 [20 · 50 · 100개씩] (`components/common/Pagination`)
- [x] (확인 후 추가) 내용을 누르면 상세로 가지 않고 그 줄 아래가 펼쳐짐(분야 · 주제 · 왜 원하나요 · 본문 · Shake it 재료 · 인용 원본 · [상세 보기]) — `GET /api/admin/imaginations/{id}`(조회 기록 안 남김) · 상태 칸 = [보임 | 숨김] 토글(관리 칸 없앰, 숨김은 빨강) · 칸 이름 가운데 정렬
- [x] (확인 후 추가) 칸마다 정렬: 칸 이름 옆 아이콘 → 메뉴 (번호 · 종류 · 작성자 · 내용 · 상태 = 칸에 맞는 오름/내림차순 말, 반응 = Thunder · Wave · 댓글 · **반응 합계** 많은/적은 순, 작성일 = 최신/오래된 순), API `sort` · `order` (같은 값이면 최신 먼저)
- [x] (확인 후 추가) 종류 선택 · 페이지당 개수를 브라우저 기본 select 대신 정렬 메뉴와 같은 작은 메뉴로 (`components/common/SelectMenu` · `DropMenu.module.css` 공통)
- [x] 테스트 4개 (운영자만 · 목록 걸러 보기 · 찾기 · 정렬 · 페이지 · 펼친 내용 · 숨김/되돌림 · 집계 · 상세 접근 · 반응 막힘 · 기록 · 숨긴 댓글 삭제)

### 6-B 정책 · 사용자 관리 (A5 · A6, F20) + 변경 기록 + 등급 초안 ✅ (화면 확인 남음)
- [x] DB 마이그레이션 0011: `policy_change_logs`(admin · 대상 global/tier/user · key · old → new · 만료일) + 등급 시드 "활발한 Dreamer" · "테스트 그룹" (값은 모두 전체 기본값을 따름)
- [x] policy: 항목 목록 `POLICY_KEYS`(이름 · 묶음 · 숫자/켜기끄기 · 단위 · 범위) · `check_value` · `resolve_with_source`(값이 어디서 왔는지)
- [x] A6 API: `GET/PUT /api/admin/policy`(전체 기본값 · 등급 값, 등급 값 null = 따르기) · `POST/PATCH/DELETE /api/admin/tiers`(이름 중복 409 · 기본 등급은 하나 · 기본 등급은 못 지움, 지우면 그 사용자는 기본으로)
- [x] A5 API: `GET /api/admin/users`(찾기 · 역할 · 등급 · 정렬 · 페이지) · `GET /api/admin/users/{id}`(활동 요약 · 적용 한도 + 출처 · 개인 예외 · 기록) · `PATCH`(역할 · 등급, 내 운영자 역할은 못 뺌) · `PUT/DELETE .../policy`(개인 예외, 만료일은 미래만)
- [x] 화면: A6 `AdminPolicyPage`(묶음별 표: 항목 | 전체 기본값 | 등급마다 — 숫자 칸 · 켜짐/꺼짐 토글, 비운 등급 칸은 따르는 값이 흐리게 · 등급 표 + 추가 · 최근 변경) · A5 `AdminUsersPage`(A4 와 같은 표 · 정렬 · 작은 메뉴 · 페이지 번호) · `AdminUserDetailPage`(역할 토글 · 등급 메뉴 · 활동 6칸 · 한도 표: 지금 값 · 어디서 · 개인 예외 칸 · 만료일 · 기록)
- [x] (확인 후 추가) 등급 표 오른쪽 버튼 칸이 어긋남(td 를 flex 로 만든 탓) → 칸 안에 버튼 묶음을 따로 둠 · 사용자 목록 · 사용자 상세(활동 요약 · 한도 표) 모든 칸 가운데 정렬 + 넘치면 …
- [x] 완료 기준 확인(테스트): 개인 예외 Shake 20회 → 그 사용자의 상상 카드 actions.shake.remaining = 20 · /api/me/limits 20
- [x] 테스트 4개 (`tests/test_admin_policy.py`) · conftest 가 테스트마다 전체 기본값 · 등급을 시드 상태로 되돌림

### 6-C 이번 주 질문 (A3 · 오른쪽 블록 · 글쓰기 질문 카드 · prompt_id, F13) ✅ (화면 확인 남음)
- [x] DB 마이그레이션 0012: `prompts`(title 80 · body 300 · starts_at · ends_at(비면 끝 없음) · is_active · created_by) + `imaginations.prompt_id` 외래 키(SET NULL, 이름 imaginations_prompt_id_fkey)
- [x] 지금 질문 = 켜져 있고 기간 안인 것 중 가장 늦게 시작한 것 · 상태 = 진행 중 / 예정 / 끝 / 꺼짐 · 답한 상상 = 보이는 원본
- [x] API: `GET /api/prompts/current`(없으면 null) · `GET /api/prompts/{id}`(글쓰기 카드, 끝난 질문 open=false · 예정/꺼짐 404) · 상상 쓰기 `prompt_id`(지금 답할 수 있는 질문만, 아니면 400 prompt_closed) · 상상 응답 `prompt` {id, title}
- [x] 운영자: `GET/POST/PATCH/DELETE /api/admin/prompts`(상태 · 찾기 · 정렬 · 페이지, 기간 검사 invalid_period, 답이 있으면 못 지움 has_answers) · `GET /api/admin/imaginations?prompt_id=`(이 질문에 답한 상상)
- [x] 화면: 오른쪽 "이번 주 질문"(질문 · 설명 · N일 남음 · 답한 상상 수 · [상상하기] → /write?prompt=) · 좁은 화면 홈 배너 `PromptBanner`(1100px 미만, 오른쪽 컬럼 대신) · 글쓰기 위 질문 카드([×] 질문 없이 쓰기, 끝난 질문은 흐리게 · 붙이지 않음) · 상세 제목 위 "이번 주 질문 · ○○" 한 줄 · A3 `AdminPromptsPage`(A4 · A5 와 같은 표 · 정렬 · 토글 · 펼치기(고치기 · 답한 상상 5개 · 지우기) · [+ 새 질문] 상자 · 페이지 번호)
- [x] 테스트 2개 (`tests/test_prompts.py`: 지금 질문 고르기 · 상태 · 답하기 · 끝난/예정/꺼진 질문 거절 · 글쓰기 카드 · 목록 걸러 보기 · 찾기 · 정렬 · 답한 상상 · 끄기 · 기간 검사 · 고치기 · 지우기 규칙)

### 게이트 (6-C)
- `uv run pytest` 68 passed · ruff 통과 · 마이그레이션 0012 올리기 → 내리기 → 다시 올리기 · `npm run build` 통과 · 개발 서버 `/api/prompts/current` null · `/api/admin/prompts` 빈 목록
- 화면 확인은 사용자 몫 (질문 만들기 → 오른쪽 블록 · 좁은 화면 배너 → [상상하기] → 질문 카드 → 올리기 → 상세 질문 줄 · A3 답한 상상 · 켜기/끄기 · 고치기 · 지우기)

### 게이트 (6-B)
- `uv run pytest` 66 passed · ruff 통과 · 마이그레이션 0011 올리기 → 내리기 → 다시 올리기 · `npm run build` 통과 · 개발 서버 API 확인(등급 3개 · 항목 15개 · 사용자 11명)
- 화면 확인은 사용자 몫 (기본 정책 값 바꾸기 · 등급 추가/기본/지우기 · 사용자 찾기 · 상세에서 개인 예외 Shake 20 → 그 사용자 계정으로 Shake 남은 횟수 확인)

### 게이트 (6-A)
- `uv run pytest` 62 passed · ruff 통과 · 마이그레이션 0010 올리기 → 내리기 → 다시 올리기 · `npm run build` 통과
- 화면 확인은 사용자 몫 (운영자 계정으로 /admin/imaginations · 숨기기 · 다시 보이기 · 작성자 계정으로 숨긴 글 상세 · 일반 계정으로 /admin)

---

## (완료) Sprint 5: AI 기능 — 자동 태깅 · Shake it · 계보 · 비슷한 상상 ✅

> 기준: 기획안 v10 F8 · F9 · F10 · F23 · 12장 + 시작 전 결정(2026-11-11, 사용자: 추천안대로) → `business_archy/v11_반영목록.txt` 3장
> 진행 순서(사용자 결정): 5-A → 5-B → 5-C → 5-D, 단계마다 검사 · 화면 확인
> 시작 전: 본문 글꼴 Pretendard 로 변경 (v11 반영목록 4장)

### 5-A 글 저장 뒤 태깅 · 임베딩 자동 ✅
- [x] DB 마이그레이션 0006: `tags`(name 정규화 · label 화면 표기 · type) · `imagination_tags`(source ai/user)
- [x] `domains/tags/service.py`: 정규화(NFC · # 제거, 비교용 name 은 띄어쓰기 없앰 · 영문 소문자, 화면 label 은 띄어쓰기 한 칸, 기술 20자 · 욕망 40자) · AI 태그 저장(작성자 태그는 유지) · `tag_all`
- [x] `domains/imaginations/ai_jobs.py`: 상상 쓰기 · 인용 응답 뒤 백그라운드로 태깅(원본 · 인용 · 혼합) + 임베딩(원본 · 인용). 실패해도 글은 그대로
- [x] 실패 → `tagging_status=failed`, 하루 AI 한도 → `pending` 유지 → CLI `tag-all [--pending-only]`
- [x] 테스트 5개 (정규화 · 백그라운드 실행 · 댓글 제외 · AI 실패 시 글쓰기 성공 + 다시 태깅 · 한도 · 태그 공유 · 작성자 태그 유지)

### 5-B Shake it ✅
- [x] DB 마이그레이션 0007: `imagination_parents`(계보) · `shake_attempts`(시도 기록, 실패 포함)
- [x] `GET /api/shake/candidates?target_id=` 선택 창(상대 글 + 내 상상 원본 · 인용 · 혼합 최신순 + 오늘 남은 횟수, next_cursor) · `POST /api/shake` 섞어서 게시
- [x] 규칙: 내 글 · 댓글(`not_material`) · Shake 막힌 글 · 권한 · 하루 한도(기본 10, published 만 셈) — actions 와 서버가 같은 규칙
- [x] 출력 검사에 걸리면 1회 다시 생성, 실패하면 게시 안 함 · 횟수 차감 안 함 · 시도 기록 failed
- [x] 혼합 글: kind=blend · ai_assisted · 분야(상대 글) + 두 번째 분야(내 글) · 재료 글 child_count +1 · 상대 작성자 알림(shaken) · 백그라운드 태깅
- [x] 응답 `sources`(재료 2개) · 혼합 글 삭제 시 재료 Shake 수 되돌림
- [x] 화면: Shake it 버튼 → 선택 창(`ShakeModal`) → 섞는 중 애니메이션 → 홈 최신 탭 맨 위 강조(`fresh`) · 카드 재료 줄 · 상세 "재료 상상 2개" · 알림 줄("○○님의 상상과 내 상상이 섞였어요") · 서재 Shake it 탭(이미 연결됨)
- [x] 함께 고침: `tag-all` 이 3번 연달아 실패하면 멈춤 · Alembic 이 HNSW 인덱스를 지우려 하지 않게 함
- [x] 테스트 5개 (게시 흐름 · 규칙 · AI 실패/재생성 · 3단계 계보 + 삭제 · tag-all 멈춤)

### 5-C 계보 그래프 · 비슷한 상상 ✅
- [x] 계보 API `GET /api/imaginations/{id}/lineage?up=3&down=3` (노드 최대 100, 지운 글도 자리 유지) · 화면 S15 `LineagePage` (층 배치 · 화살표 · 확대/축소/이동 · 두 손가락 · 미리보기 → 상세, 더 깊이 보기)
- [x] 상세: 시간 줄 아래 [계보 그래프 보기 · 이 상상에서 태어난 상상 N개]
- [x] 비슷한 상상 = **2단계 검색(리랭킹)** (사용자 결정, v11 반영목록 5장): pgvector 후보 20개 → LLM(`similar_rerank`, 프롬프트 v1) → 최대 5개 + 이유 → `similar_sets` · `similar_links`(마이그레이션 0008)
- [x] `GET /api/imaginations/{id}/similar`: 저장된 결과 → 없으면 벡터 → 임베딩도 없으면 같은 분야 · 태그. 혼합 · 댓글은 대상 아님
- [x] 글 올린 뒤 백그라운드 계산(태깅 · 임베딩 다음) · LLM 실패 시 벡터 순서로 저장 · CLI `similar-all [--force]` · `similar --id --rerank`
- [x] 화면: 오른쪽 컬럼 "비슷한 상상"(이유 한 줄) · 좁은 화면은 상세 글 아래
- [x] 테스트 4개 (리랭킹 저장 · 없는 번호 거르기 · 지운 글 제외 · 실패 시 벡터 → 다시 계산 · 대상/대체 순서 · 계보 3단계 · 깊이 · 지운 노드)
- 실측 1건 $0.00043 (`docs/ai-models.md` 3-1장)

### 5-D 태그 화면 (카드 · 상세 태그, 작성자 편집 최대 5개, 주제 둘러보기, 태그별 피드) ✅
> 시작 전 결정 (2026-11-12 사용자): 욕망 태그는 화면에 보이지 않고 분석용으로 DB 에만 · 기술 태그는 지금처럼 다양하게 보여 주고 의미 없는 것을 줄여 간다 · 작성자가 지운 태그는 기록으로 남김 · 태그별 상상에 혼합 글 포함(최신순) → v11 반영목록 8장
- [x] DB 마이그레이션 0009: `imagination_tags.removed_at`(작성자가 지운 태그 기록) · 전체 기본 한도 `limit.tag_count = 5`
- [x] 다시 태깅해도 작성자가 지운 태그는 되살리지 않고, 작성자 태그(source=user)는 유지 · 비슷한 상상 태그 대체 · `tags_of` 는 지우지 않은 태그만
- [x] 상상 응답 `tags`(기술만, 지우지 않은 것) · actions `edit_tags`(내 글만, remaining = 더 붙일 수 있는 수)
- [x] `PUT /api/imaginations/{id}/tags` {tech:[...]} (목록 전체, 정규화 · 같은 이름 한 번 · 최대 limit.tag_count, 오류 too_many_tags · invalid_tag)
- [x] `GET /api/topics` (분야마다 기술 태그 · 개수, 원본 · 인용만, 전체 기간, 많은 순 → 가나다, 분야당 최대 100) · `GET /api/tags/{name}/imaginations` (혼합 포함 최신순, 커서, name 에 "/" 가능)
- [x] 화면: 카드 태그(최대 3개) · 상세 태그 줄 + [태그 편집]/[태그 달기] 편집 상자(알약 + 입력, Enter · 쉼표로 더하기, n / 5) · S8 `/topics`(분야 섹션 · #태그 개수, /topics#분야) · S9 `/tags/:name`(#태그 · 상상 N개, 무한 스크롤)
- [x] 함께: ShakeModal 주석 S7 → S5 · `usePaged` 가 첫 페이지 응답(`head`)을 돌려줌 · 개발 DB `similar-all` 실행(56개 리랭킹, $0.0253)
- [x] (확인 후 추가) 분야 · 주제 용어 정리: 카드 · 상세 분류 줄 [분야] 회색 + #주제 보라, ⋯ > 뱃지 보기 제거, 오른쪽 "추천 주제" = 전체 인기 주제 10개(`/api/topics` popular) · + 버튼 제거
- [x] 테스트 4개 (응답 태그 · actions · 편집 · 지운 기록 · 다시 태깅 · 되살리기 · 규칙 · 주제 집계(혼합 제외) · 태그 피드 순서 · "/" 태그 · 없는 태그)

### 게이트 (5-A)
- `uv run pytest` 45 passed · ruff 통과 · 마이그레이션 0006 올리기 → 내리기 → 다시 올리기 · `npm run build` 통과
- 실제 API: 개발 DB 원본 51 · 인용 5 태깅 56/56 성공 ($0.0058, 띄어쓰기 규칙 바꾼 뒤 다시 태깅) · 새 API 키 두 개 정상

### 게이트 (5-B)
- `uv run pytest` 50 passed · ruff 통과 · 마이그레이션 0007 올리기 → 내리기 → 다시 올리기 · `npm run build` 통과
- 화면 확인은 사용자 몫 (선택 창 · 애니메이션 · 홈 강조 · 알림 · 모바일 폭 · 다크 모드) → ✅ 확인 완료 (선택 창 모서리 · 설명 문구 수정)

### 게이트 (5-D)
- `uv run pytest` 58 passed · ruff 통과 · 마이그레이션 0009 올리기 → 내리기 → 다시 올리기 · `npm run build` 통과
- 개발 서버 API 확인: `/api/topics` 8개 분야(15~24종) · `/api/tags/자율주행/imaginations` 4개
- 화면 확인: 사용자 완료 (2026-11-12) → 분야 · 주제 용어 정리 반영

### 게이트 (5-C)
- `uv run pytest` 54 passed · ruff 통과 · 마이그레이션 0008 올리기 → 내리기 → 다시 올리기 · `npm run build` 통과
- 화면 확인: 사용자 완료 (2026-11-12) → 계보 화면 정리(이름 "계보" · 색 안내 줄 제거 · 노드 색 · 검은 선 + 파란 활성 화살표 · 크게 보기 팝업 880px · 설명 문구)


### Sprint 5 뒤 확인할 것 (사용자, 2026-11-12)
- 피드 카드 재료 줄이 넘칠 때: 지금 혼합 글은 재료가 2개뿐이라 확인이 어렵다 → 재료가 많아지거나 제목이 긴 혼합 글이 생기면 한 줄 + "…" 처리를 다시 본다 (좁은 화면 포함)
---

## (완료) Sprint 4: AI 모델 기반 ✅

> 기준: 기획안 v10 9장 · 12장 + 사용자 결정(2026-11-10): 로컬 sLLM 은 추후, 임베딩은 Gemini → `business_archy/v11_반영목록.txt` 1장

### 체크리스트
- [x] 설정(.env · `config.py`): LLM 제공자 · 모델 · effort · 기능별 덮어쓰기 · 하루 한도 · 가격, 임베딩 제공자 · 모델 · 차원 · 기준값. 제공자를 골랐는데 키가 없으면 시작할 때 오류
- [x] LLM 구조 `app/infrastructure/llm/`: `router.py`(기능 이름 → 제공자 · 모델, 호출 기록, 하루 한도) · `providers/anthropic.py`(구조화 출력, 거절 · 잘림 처리) · `providers/fake.py` · `prompts.py`
- [x] 프롬프트 `prompts/v1/tagging.md` · `shake.md` (어린이 안전 규칙 포함)
- [x] 기능 호출부: `domains/tags/tagging.py`(태그 정리 최대 5) · `domains/shake/blend.py`(출력 검사: 빈 값 · 글자 수 · 금지어) — 저장 · 게시는 Sprint 5
- [x] 임베딩 구조 `app/infrastructure/embeddings/`: `gemini.py`(batchEmbedContents, 768 차원, 정규화) · `fake.py`
- [x] DB 마이그레이션 0005: `llm_calls` · `imagination_embeddings`(vector 768 + HNSW 코사인)
- [x] `domains/similar/service.py`: 원본 · 인용 임베딩 저장 · 비슷한 상상 찾기(다른 작성자만)
- [x] CLI `embed-all` · `similar --id` · `ai-eval`(태깅 20 · Shake 10 · 유사도 분포 → `data/ai-eval/*.json`)
- [x] 실측 · 결정 기록 `docs/ai-models.md`
- [x] 테스트 6개 (라우팅 · 키 검사 · 프롬프트 · fake 호출 기록 · 태그 정리 · 출력 검사 · 하루 한도 · 거절 · 임베딩 · 비슷한 상상) — 모두 fake, 비용 0

### 하지 않은 것 (사용자 결정)
- 로컬 sLLM(Ollama) 제공자 · 비교 → 추후 자체 LLM 논의 때

### 게이트
- `uv run pytest` 40 passed · ruff 통과 · 마이그레이션 0005 올리기 → 내리기 → 다시 올리기
- 실측: 태깅 20/20 · Shake 10/10(출력 검사 10/10) · 비용 합계 약 $0.005 · 임베딩 55개 · 쌍 점수 평균 0.746 / 최고 0.897

### 남은 일 (사용자)
- 대화에 붙여 넣은 API 키 두 개는 발급처에서 **새로 발급해 바꾸는 것**을 권함 (바꾼 뒤 `.env` 만 고치면 됨)
- `docs/ai-models.md` 의 Shake 예 · 태깅 예를 보고 결과 성격이 괜찮은지 확인

---

## (완료) Sprint 3: 관계와 탐색 ✅

> 기준: 기획안 v9 12장 + `business_archy/v10_반영목록.txt` 7장 (X 캡처: `x_로그인_홈_팔로잉_1` · `x_로그인_프로필상세_*` · `x_로그인_알림상세_*`)

### 체크리스트 — 백엔드
- [x] DB (마이그레이션 0004): `follows` · `notifications`(comment_id 없음) · `users.cover_url`
- [x] 팔로우 `POST/DELETE /api/users/{nickname}/follow` → `{following, followers}`, 나 자신 막기, 팔로우 알림
- [x] 프로필 `GET /api/users/{nickname}` (counts · is_me · following) · 탭 `.../imaginations?tab=posts|comments|waves`
- [x] 팔로잉 탭: 팔로우한 사람의 상상 + 그 사람들이 Wave 한 글 (같은 글은 최근 것 하나), `waved_by` · Wave 할 때 `via_user_id`
- [x] 추천 탭: 최근 7일 상상을 점수(Thunder + Wave×2 + 인용×3 + 댓글) 순 → 그다음 이전 상상 최신순 (커서 = 순번)
- [x] 인기 상상 `GET /api/trending` — 최근 7일 원본·인용 1~20위
- [x] 추천 Dreamer `GET /api/users/recommended` (안 팔로우한 사람 중 받은 Thunder 순) · 이 상상의 Dreamer `GET /api/users/{nickname}/card`
- [x] 알림: Thunder·Wave(상상·댓글) · 인용 · 댓글 · 답글 · 팔로우. 껐다 켜도 한 번, 나에게는 안 보냄, 대상 글이 지워지면 안 보임
  - `GET /api/notifications?tab=all|comments` · `/unread-count` · `POST /read`
- [x] 프로필 수정 `PATCH /api/users/me` (multipart: 닉네임 · 소개 160자 · 프로필 이미지 · 커버 이미지 · 지우기) · 비밀번호 `POST /api/users/me/password`
- [x] seed-demo: 팔로우(4명씩) · 알림(샘플 활동에서 만듦, 3일 지난 것은 읽음)
- [x] 테스트 7개 추가 (팔로우·프로필 · 프로필 탭 · 팔로잉·Wave 줄·via · 알림 · 인기·추천 탭 · 추천 Dreamer · 프로필 수정·비밀번호)

### 체크리스트 — 프론트
- [x] 홈(로그인 후) 탭 줄 아래 **상상하기 유도 영역**: 아바타 + 상상을 부르는 문장 + 분야 칩(누르면 그 분야로 상상하기) + [상상하기]
- [x] 팔로잉 탭 실제 목록 + 카드 맨 위 "≈ ○○님이 Wave함", 빈 상태 문구
- [x] 프로필(X): 커버 · 큰 아바타 · [프로필 수정](hover 옅은 회색) / [팔로우] · 닉네임 · @닉네임 · 소개 · 팔로잉/팔로워 · 탭 [상상 | 댓글 | Wave]
- [x] 프로필 수정 팝업(X): 커버 바꾸기·지우기 · 프로필 이미지 · 이름 · 자기소개(160자). 이름을 바꾸면 새 주소로 이동
- [x] 알림(X): [전체 | 댓글], Thunder·Wave·팔로우 = 아이콘 줄, 댓글·답글·인용 = 글 전체 + 액션 바, 안 읽음 옅은 보라, 열면 모두 읽음
- [x] 사이드바 종에 안 읽은 수 배지 · 모바일 하단 탭 점 (60초마다 · 화면으로 돌아올 때 확인)
- [x] 인기 상상(/trending): 오른쪽 컬럼 없이 넓게, 순위 · 작성자 · 제목 · 요약 · ⚡💬≈ · 🔖 ⋯ · 썸네일
- [x] 오른쪽 컬럼: 인기 상상 1~5 · 추천 Dreamer 3명 [팔로우] · (상세) 이 상상의 Dreamer + 소개
- [x] 상세 작성자 줄 [팔로우] (오른쪽 블록과 같은 상태) · [팔로잉] 에 마우스를 올리면 [언팔로우]
- [x] 설정(/settings): 비밀번호 변경, 프로필은 [프로필 수정] 안내
- [x] (확인 후 추가) 팔로워 · 팔로잉 목록 `/@닉네임/followers|following` + [서로 팔로우하기] · 인기 상상도 오른쪽 컬럼 · 유도 영역 단순화 · 인기 블록 버튼 요약 · "왜 원하나요" 회색

### 이번에 하지 않는 것
- 멘션(@아이디) · 알림 설정(톱니) · 팔로잉/팔로워 목록 화면 · 추천 Dreamer [더 보기] · 알림 묶기("○○님 외 2명") → 추후

### 게이트
- `uv run pytest` 33 passed · `ruff check` / `ruff format --check` 통과 · `npm run build` 통과
- 마이그레이션 0004 올리기 → 내리기 → 다시 올리기 확인 · dev DB `seed-demo --reset` (팔로우 40 · 알림 273)
- 개발 서버로 확인: 팔로잉 피드(Wave 줄 8개) · 인기 · 추천 Dreamer · 알림 · 프로필 · SPA 경로 200

### 남은 일 (사용자)
- 브라우저 확인: 홈 유도 영역 · 팔로잉 탭 · 프로필 · 프로필 수정(이미지 올리기) · 알림 · 인기 상상(넓은 화면) · 오른쪽 블록 · 설정 · 모바일 폭 · 다크 모드

---

## (완료) Sprint 2: 반응 + 댓글 + 서재 ✅

> 기준: 기획안 v9 12장 + `business_archy/v10_반영목록.txt` 2~3장(2026-11-10 결정).
> 상상 상세·댓글은 X 구조(`etc_datas/x_로그인_카드상세_1~4`), 댓글도 게시글로 저장(kind=comment).

### 목표
두 계정으로 Thunder · Wave · 인용 · 댓글·답글 · 북마크 · 공유를 주고받고, 상세 화면(X 구조)과 서재 세 탭을 확인한다.

### 체크리스트 — 백엔드
- [x] DB (마이그레이션 0003)
  - imaginations: kind 에 `comment` 추가, `parent_id`(바로 위 글) · `root_id`(맨 위 상상) + 인덱스
  - `thunders` · `waves`(via_user_id, Sprint 3 부터 채움) · `bookmarks` — PK(user_id, imagination_id)
  - `reaction_events` — 켜기·끄기를 시간순으로 쌓는 기록 (user · imagination · type · on · at)
- [x] 반응 `POST/DELETE /api/imaginations/{id}/thunder|wave|bookmark` → `{my, counts}` 응답, 수 캐시 갱신, 이벤트 기록
  - 내 글에는 Thunder · Wave 불가(own_post), Wave 권한(perm.can_wave) 확인, 삭제·숨김 글은 404
- [x] 상상 응답에 `my: {thunder, wave, bookmark}` 추가 (내가 이미 눌렀는지)
- [x] 인용 `POST /api/imaginations/{id}/quote {body}` — 본문만(기본 300자), 분야는 원본을 따름, 하루 상상 쓰기 30개에 포함, perm.can_quote
  - 응답에 `quoted`(원본 요약 카드). 원본이 삭제되면 `quoted.deleted=true` → "삭제된 상상이에요"
- [x] 댓글 = 게시글 (kind=comment)
  - `GET /api/imaginations/{id}/comments?cursor=` — 맨 위 댓글은 최신순(정렬 선택 없음), 답글은 댓글 아래 시간순
  - `POST /api/imaginations/{id}/comments {body}` — id 가 상상이면 댓글, 댓글이면 답글. 답글의 답글은 1단계로 모음(같은 댓글 줄)
  - 삭제는 기존 `DELETE /api/imaginations/{id}`. 답글이 있는 댓글은 "삭제된 댓글이에요" 자리 유지
  - 댓글 수는 답글 포함(맨 위 상상의 comment_count), 댓글 자체의 comment_count = 답글 수
  - 댓글에도 같은 actions (Shake it 은 Sprint 5)
- [x] 홈 피드에서 kind=comment 제외. 댓글 id 로 상세를 열면 `root_id` 를 알려 줌(화면이 원글로 이동)
- [x] 서재 `GET /api/me/library?tab=bookmarks|thunders|recent&cursor=`
  - 북마크: 상상 + 댓글(누른 순) · Thunder: 상상만(댓글 제외) · 최근 본 상상: 최대 100개
- [x] seed-demo: 샘플 Thunder · Wave · 북마크 · 댓글·답글 · 인용 · 조회 기록 추가
- [x] 테스트: 반응 켜기·끄기·수·my · 내 글 막기 · 인용 · 댓글/답글/1단계 모음/삭제 자리 · 피드에서 댓글 제외 · 서재 세 탭 · reaction_events

### 체크리스트 — 프론트
- [x] 액션 바 실제 동작: 누르면 바로 켜지고(실패하면 되돌림) 수가 바뀜, 켜진 색(Thunder 노랑 · Wave 파랑 · 북마크 보라)
- [x] Wave 메뉴 [Wave / Wave 취소] [인용하기] → 인용 모달(S6): 원본 카드 미리보기 + 본문 300자 카운터
- [x] 인용 카드: 피드 카드·상세에서 인용한 글 아래 원본을 작게(X 방식), 누르면 원본 상세
- [x] 상세 화면 X 구조로 재배치
  - 작성자 줄(…… ⋯) → 제목 → 본문 → 왜 원하나요 → 이미지 → 인용 카드 → 시간 줄(시각 · 날짜 · 분야 · 종류 · AI 도움) → 액션 바(위아래 선) → 댓글
  - 하단 작성자 카드 제거 (Sprint 3 에 오른쪽 컬럼 "이 상상의 Dreamer")
- [x] 댓글 영역: 입력창(접힘 → 누르면 펼침, 글자만, 300자, [취소][댓글]) → 목록(무한 스크롤)
  - 댓글 줄: 아바타 · 닉네임 · 시간 · (상상 작성자면 "작성자") …… ⋯(링크 복사 · 내 댓글 삭제) → 본문(길면 "더 보기") → **게시글과 같은 액션 바**
  - 답글: 세로선으로 잇고 들여씀. 답글 아이콘 → 그 자리에 "○○님에게 보내는 답글" 입력창
- [x] 댓글 아이콘: 상세에서는 입력창으로 이동·포커스, 피드 카드에서는 상세의 댓글 위치로 이동. 댓글 공유 = 그 댓글 위치 링크
- [x] 서재(/library): [←] 서재 + 탭 [북마크 | Thunder | Shake it | 최근 본 상상], 탭마다 빈 상태 문구, 무한 스크롤 (Shake it 탭은 확인 후 추가, Sprint 5 전에는 빈 목록)
- [x] "Sprint 2 에서 열려요" 안내 제거 (Shake it 만 Sprint 5 안내 유지)

### 이번에 하지 않는 것
- "○○님이 Wave함" 줄 · 확산 경로(via) 기록 → Sprint 3 (팔로잉 탭과 함께)
- 알림 → Sprint 3 · Shake it → Sprint 5 · 댓글 정렬 선택 · 답글 깊이 2단계 이상 · 댓글만의 상세 화면 · X ⋯ 옵션 메뉴 · 북마크 리스트 · 조회수 표시

### 완료 기준
- 계정 A 가 상상을 쓰고, 계정 B 가 Thunder · Wave · 인용 · 댓글 · 북마크 → A 가 답글, B 가 그 답글에 Thunder
- 새로고침해도 켜진 상태가 유지됨(my), 수가 맞음, 내 글에서는 Thunder · Wave 가 흐림
- 인용 카드가 피드·상세에 보이고, 원본 삭제 시 "삭제된 상상이에요"
- B 의 서재 세 탭에 각각 맞는 글이 보임
- 검사: pytest · ruff · npm run build 통과

### 게이트
- `uv run pytest` 26 passed (회원 5 · 상상 9 · 반응·인용·서재 6 · 댓글 4 · 헬스 2) · `ruff check` / `ruff format --check` 통과 · `npm run build` 통과
- 마이그레이션 0003 올리기 → 내리기 → 다시 올리기 확인 · dev DB 에 `seed-demo --reset` (상상 50 · 댓글 66 · 인용 5 · 반응 기록 190)
- 실행 중인 개발 서버로 확인: 피드(인용 카드 포함) · 댓글 목록(답글) · 서재 세 탭 · `/library` 200

### 남은 일 (사용자)
- 브라우저에서 완료 기준 확인 (두 계정: `dreamer01` · `dreamer02@demo.example.com` / `imagine1234`), 데스크톱·모바일 폭, 다크 모드
- 버튼을 눌렀을 때 움직임(Thunder 내리꽂힘 · Wave 솟구침)과 댓글 세로선 모양

---

## (완료) Sprint 1: 회원 + 상상 쓰기 + 홈 피드 + 상세 ✅

### 목표
가입 → 로그인 → 상상 쓰기(이미지 포함) → 피드·상세 확인 → 로그아웃. 기획안 v9 의 하이젠버그 로그인 이후 구조 반영.

### 체크리스트 — 백엔드
- [x] DB (마이그레이션 0002): users · user_tiers · policy_settings · domains · imaginations · imagination_views + 시드(분야 8 · 기본 등급 · 한도 기본값)
- [x] F1 회원: `POST /api/auth/signup` · `/login` · `GET /api/auth/me` — PyJWT + bcrypt, 닉네임 규칙(한글·영문·숫자·_ 2~20자, 예약어 금지), 로그인 실패 문구 통일
- [x] F20 이용 한도 계산 기반: 개인 예외(만료 확인) → 등급 → 전체 기본값, `GET /api/me/limits`, 하루 횟수는 한국 시간 자정 기준
- [x] F2 상상 쓰기 `POST /api/imaginations` (multipart): 분야 필수 · 제목 선택 · 글자 수 · 하루 30개 · 이미지 1장 5MB(Pillow 로 형식 확인) · AI 도움 · Shake it 허용
- [x] F3 피드 `GET /api/feed?tab=recommended|latest|following&domain=&cursor=` → `{items, next_cursor}` 20개씩 (추천 = Sprint 3 전까지 최신순, 팔로잉 = 빈 목록)
- [x] S4 상세 `GET /api/imaginations/{id}` + 조회 기록(최근 본 상상) · 삭제 `DELETE` (본인만, 실제로는 status=deleted)
- [x] 응답마다 `actions` (login_required · own_post · not_allowed · shake_disabled · daily_limit) · 오류 형식 `{"detail": {"code", "message"}}`
- [x] `GET /api/domains`, `/uploads` 정적 파일
- [x] CLI: `create-admin` · `seed-demo`(Dreamer 10명 · 상상 50개, `--reset`)
- [x] 테스트: imagine_test DB 자동 준비 · 16개 (회원 5 · 상상 9 · 헬스 2)

### 체크리스트 — 프론트
- [x] 로그인 · 가입 모달 (`/login` · `/signup` 은 홈 + 모달), 토큰 localStorage, `useAuth`
- [x] 사이드바 로그인 전 [가입하기][로그인] ↔ 로그인 후 메뉴(알림 · 내 서재 · 프로필 추가) + [상상 쓰기] + 계정 칩 · 계정 메뉴(프로필 보기 · 설정 · 내 활동 · 운영자 화면 · 로그아웃)
- [x] 홈: 로그인 전 분야 탭 / 로그인 후 [추천 | 팔로잉 | 최신] + 분야 칩, 무한 스크롤, 주소에 `?tab=&domain=` 유지
- [x] 오른쪽 컬럼 "추천 주제" 블록 (분야 칩 → 홈 분야 필터)
- [x] S3 상상 쓰기 (내 한도 기준 "123 / 500", 이미지 미리보기, 게시 후 상세로 이동)
- [x] S4 상세 (분류 배지 · 제목 · 작성자 · 이미지 · 본문 · 왜 원하나요 · 액션 바 · 하단 작성자 카드)
- [x] 액션 바: actions 에 따라 흐리게 + 누르면 안내 메시지(토스트), 로그인 전이면 로그인 모달, 아직 없는 반응은 "Sprint N 에서 열려요"
- [x] ⋯ 메뉴: 링크 복사 · (내 글) 삭제 / 공유 버튼: 링크 복사
- [x] 모바일: 상단 바(로그인 후 글쓰기), 하단 탭 홈 · 인기 · 서재 · 알림 · 마이
- [x] "디자인 미리보기" 예시 카드 삭제

### 게이트
- `uv run pytest` 16 passed · `ruff check` / `ruff format --check` 통과 · `npm run build`(tsc + vite) 통과
- 실행 중인 개발 서버로 확인: 피드 20개 + next_cursor · 로그인 · /api/me/limits · 이미지 포함 글쓰기 → /uploads 이미지 200 · 삭제 204 · SPA 경로 200

### 남은 일 (사용자)
- 브라우저에서 확인: 가입 모달 → 상상 쓰기 → 피드·상세 → 계정 메뉴 → 로그아웃 (데스크톱·모바일 폭, 다크 모드)
- 샘플 계정: `dreamer01@demo.example.com` / `imagine1234` (01~10), 운영자 `admin@example.com` / `admin12345`

---

## (완료) Sprint 0 추가: UI 기준 반영 · 다듬기 ✅

- [x] 하이젠버그 메인 캡처 기준 레이아웃 (헤더 없음 · 사이드바 275 · 본문 600 · 오른쪽 350, 반응형 4단계)
- [x] 글꼴: 나눔스퀘어 네오 (로고는 Heavy) · 강조색 보라(임시)
- [x] 디자인 시스템 컴포넌트: Button · IconButton · Tabs · TagPill · Avatar
- [x] 피드 카드 · 액션 바(공명 · Wave · 댓글 · Shake it … 북마크 · 공유) · 버튼별 hover 움직임
- [x] 자체 아이콘: Wave(채워진 파도) · Shake it(비빔밥 그릇 + 숟가락 · 젓가락 + 별)
- [x] 로고(첫 글자 = 파비콘 I) · 파비콘(보라 정사각형 + I) · 탭 제목 "Imagine - 당신의 상상이 세상을 바꿉니다"
- [x] 개발 모드 홈 "디자인 미리보기" 예시 카드 2개 (**Sprint 1 에서 삭제**)
- 게이트: `tsc` 통과 · 개발 서버 반영 · 아이콘은 PNG 로 그려 확인 · 화면·움직임은 사용자 브라우저 확인
- 기획안(v8)과 달라진 점: [work-log 요약](work-log.md) 참고 — 다음 기획안 갱신 때 반영

---

## (완료) Sprint 0: 프로젝트 골격 ✅

### 목표
백엔드·프론트·DB 가 함께 뜨고, 빈 레이아웃이 데스크톱·모바일에서 하이젠버그 구조로 보인다.

### 체크리스트
- [x] 백엔드: pyproject(uv) · 설정(.env, pydantic-settings) · SQLAlchemy 2 엔진·세션 · Alembic(초기 = pgvector 확장) · `/health`, `/api/health`
- [x] 백엔드 도메인 폴더 자리 (auth · users · imaginations · reactions · comments · tags · shake · prompts · notes · notifications · policy · activity · graph · similar · admin)
- [x] 프론트: Vite + React 18 + TS · 라우팅(기획안 화면 목록 전체, 미구현 화면은 자리 표시) · `/api` 프록시
- [x] 디자인 토큰 `tokens.css` (라이트/다크, Shake it 강조색) · 다크 모드 토글
- [x] 공통 레이아웃: 헤더 · 왼쪽 메뉴 · 오른쪽 컬럼 · 모바일 하단 탭바(아이콘 5개) · 푸터(개발 중 서버 연결 상태 표시)
- [x] 아이콘 버튼 컴포넌트 `IconButton` (아이콘 + 숫자 + 툴팁, 텍스트 라벨 없음) · 분야 칩 `Chip`
- [x] docker-compose: PostgreSQL 16 + pgvector(imagine_dev · imagine_test) · Memgraph 3.10.1
- [x] 문서: README · docs/sprint.md · docs/work-log.md · docs/db-guide.md · docs/app-structure.md
- [x] **DB 실행 확인**: `docker compose up -d` → `alembic upgrade head`(0001) → `/health` 의 `database: ok` (DBeaver 접속은 사용자 확인)
- [ ] **화면 눈으로 확인**: 브라우저에서 데스크톱·모바일 폭 레이아웃 확인 (사용자)

### 게이트
- pytest 2 passed · ruff check/format 통과 · `npm run build`(tsc + vite) 통과
- 서버 실행 확인: 백엔드 `/health` 200, 프론트 `localhost:5173` 200, 프론트 → 백엔드 프록시 동작

- DB: `imagine-postgres` healthy · `imagine_dev`/`imagine_test` 생성 · 두 DB 모두 pgvector 0.8.7 · `alembic current` = 0001 (head) · `imagine-memgraph` `RETURN 1` 응답

### 남은 일 (사용자)
- 브라우저에서 http://localhost:5173 레이아웃 확인 (데스크톱·모바일 폭, 다크 모드) — 캡처 기준 반영본
- DBeaver 로 `imagine_dev` 접속 확인 ([db-guide](db-guide.md))

---

## 스프린트 히스토리

| Sprint | 기간 | 내용 | 상태 |
|---|---|---|---|
| 0 | 2026-11-09 | 프로젝트 골격 + UI 기준 반영 · 다듬기 | ✅ 완료 |
| 1 | 2026-11-10 | 회원 + 상상 쓰기 + 홈 피드 + 상세 (+ 로그인 전·후 구조) | ✅ 완료 |
| 2 | 2026-11-10 | 반응 (Thunder · Wave/인용 · 북마크 · 공유) + 상세·댓글 X 구조 + 서재 | ✅ 완료 |
| 3 | 2026-11-10 | 관계와 탐색 (팔로우 · 팔로잉 · 프로필·알림 X 구조 · 인기 · 설정) | ✅ 완료 |
| 4 | 2026-11-10 | AI 모델 기반 (Claude Haiku 5.5 + Gemini 임베딩, 실측 · 결정) | ✅ 완료 |
| 5 | 2026-11-11 ~ 11-12 | AI 기능 (태깅 · Shake it · 계보 · 비슷한 상상 리랭킹 · 태그 화면) | ✅ 완료 |
| 6 | 2026-11-12 ~ | 운영자 기능 (숨김 · 정책 · 질문 · 대시보드 · Observe Note) | 진행 (6-A · 6-B · 6-C ✅) |
| 7 | — | 상상 네트워크 탐색기 (Memgraph) | 예정 |
| 8 | — | 내 활동 (계정 메뉴: 인사이트 + 활동 내역) | 예정 |
| 9 | — | 내부 테스트와 다듬기 | 예정 |
