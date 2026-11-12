# DB 가이드 (PostgreSQL + DBeaver + Memgraph)

기획안 10-1장 · 9-2장 기준.

## 원칙
1. **개발부터 PostgreSQL** 을 쓴다 (SQLite 쓰지 않음). 개발·운영이 같은 DB 라 환경 차이로 생기는 문제가 없다.
2. **테이블 생성·변경은 Alembic 마이그레이션으로만** 한다. DBeaver 에서 테이블 구조를 직접 바꾸지 않는다.
   직접 바꾸면 코드와 DB 구조가 어긋나 다음 마이그레이션이 깨진다.
3. **DBeaver 는 조회·분석 SQL·문제 확인용**이다. 데이터 직접 수정은 피한다 (Thunder 수 같은 집계 캐시·알림이 어긋날 수 있음).
   운영자가 할 일(권한·한도 변경, 숨김)은 운영자 화면에서 한다.
4. **Memgraph 는 PostgreSQL 에서 만들어 내는 복사본**이다 (Sprint 7). 원본은 항상 PostgreSQL.

## DB 목록
| DB | 용도 |
|---|---|
| `imagine_dev` | 개발 (백엔드가 쓰는 DB) |
| `imagine_test` | 자동 테스트 전용 (테스트마다 비움, Sprint 1~) |

둘 다 docker 컨테이너 `imagine-postgres` 안에 있고, 첫 실행 때 `infra/postgres/init/01-init.sql` 이 `imagine_test` 와 pgvector 확장을 만든다.

## 테이블 (Sprint 1, 마이그레이션 0002)

| 테이블 | 내용 |
|---|---|
| users | 회원 (이메일 · bcrypt 비밀번호 · 닉네임 · 역할 user/admin · 등급) — 연령대 없음 (기획안 v9) |
| user_tiers | 등급 (시드: 기본) |
| policy_settings | 이용 한도·권한 (scope = global/tier/user, key 예: `limit.body_chars`, value = JSON). 시드: 전체 기본값 14개 |
| domains | 분야 8개 (시드) |
| imaginations | 상상 (kind · 제목 · 본문 · 욕망 · 이미지 · 분야 · 상태 · thunder_count 등 집계 캐시) — 삭제는 status=deleted |
| imagination_views | 상세 조회 기록 (서재 "최근 본 상상") |

## 테이블 추가 (Sprint 2, 마이그레이션 0003)

| 테이블 · 칸 | 내용 |
|---|---|
| imaginations.kind = `comment` · `parent_id` · `root_id` | **댓글·답글도 게시글로 저장** (X 방식). parent = 바로 위 글, root = 맨 위 상상. 답글은 1단계까지(답글에 달아도 맨 위 댓글 아래로) |
| thunders · waves · bookmarks | 반응 (PK user_id + imagination_id). 상상·댓글 모두. waves.via_user_id = 확산 경로(Sprint 3 부터 채움) |
| reaction_events | 반응을 켜고 끈 기록 (type · on · 시각). 기록 범위는 추후 검토 |

- 수 캐시: 상상의 comment_count = 댓글 + 답글 전체, 댓글의 comment_count = 답글 수. quote_count 는 인용 글이 지워지면 줄어든다.
- **분석할 때 주의**: "대중 상상"·"욕망 지표"(Thunder)는 `kind IN ('original', 'quote')` 로 거른다. 댓글(`comment`)·혼합(`blend`)은 따로 본다.
  예) 상상별 Thunder 수: `SELECT i.id, i.thunder_count FROM imaginations i WHERE i.kind IN ('original','quote') AND i.status='visible' ORDER BY 2 DESC;`

## 테이블 추가 (Sprint 3, 마이그레이션 0004)

| 테이블 · 칸 | 내용 |
|---|---|
| follows | 팔로우 (PK follower_id + followee_id, 나 자신 금지) |
| notifications | 알림 (type · actor · imagination_id · read_at). thunder·wave = 반응 받은 글, comment·reply·quote = 새 글, follow = 없음 |
| users.cover_url | 프로필 커버 이미지 |

- Wave 확산 경로 예: `SELECT w.user_id, w.via_user_id, w.created_at FROM waves w WHERE w.imagination_id = 123 ORDER BY 3;`

- 샘플 데이터: `uv run python -m app.interfaces.cli seed-demo` — Dreamer 10 · 상상 50 · 댓글 · 인용 · 반응 · 팔로우 · 알림 (`--reset` 으로 다시 넣기 — **샘플 계정(dreamerNN)이 쓴 글·반응도 모두 지워진다**). DBeaver 에서 손으로 넣지 않는다.
- 이용 한도를 바꿔 보려면 (관리 화면은 Sprint 6) — 개인 예외 예:
  `INSERT INTO policy_settings (scope, user_id, key, value) VALUES ('user', 1, 'limit.body_chars', '1000');`

## 테이블 추가 (Sprint 4, 마이그레이션 0005)

| 테이블 | 내용 |
|---|---|
| llm_calls | AI 호출 기록 (feature · provider · model · 토큰 · 예상 비용 · 시간 · status success/failed/refused/limited). 임베딩도 feature=embedding 으로 남김 |
| imagination_embeddings | 상상 임베딩 (imagination_id · model · vector(768)). HNSW 코사인 색인. 원본 · 인용만 |

- 비용 보기: `SELECT feature, count(*), sum(est_cost_usd) FROM llm_calls GROUP BY 1;`
- 비슷한 상상 보기: `uv run python -m app.interfaces.cli similar --id 12` (SQL 로는 `1 - (a.embedding <=> b.embedding)` 가 유사도)
- 임베딩 모델 · 차원을 바꾸면: 마이그레이션으로 칸 크기를 바꾸고 `embed-all --force`

## 테이블 추가 (Sprint 5-A, 마이그레이션 0006)

| 테이블 | 내용 |
|---|---|
| tags | 태그 (name = 비교용: 띄어쓰기 없앰 · 영문 소문자 / label = 화면 표기: 처음 저장된 모양, 띄어쓰기 한 칸 / type tech/desire). unique(name, type) |
| imagination_tags | 상상-태그 연결 (source ai/user). AI 태깅을 다시 해도 source=user 는 남는다 |

- 정규화: NFC · 앞의 `#` 제거 · 최대 글자 수 기술 20 · 욕망 40(욕망은 문장도 받음). 비슷한 말 묶기 · 욕망 정제는 하지 않는다(분석 · 운영자 기능, Sprint 6~7)
- 글을 올리면 응답 뒤 백그라운드로 태깅(원본 · 인용 · 혼합) · 임베딩(원본 · 인용)을 한다. `imaginations.tagging_status` = pending → done / failed. 댓글은 pending 그대로(태깅 대상 아님)
- 못 한 글 다시 하기: `uv run python -m app.interfaces.cli tag-all` (실패 포함) · `embed-all`
- 태그 보기: `SELECT t.type, t.label, count(*) FROM imagination_tags it JOIN tags t ON t.id = it.tag_id GROUP BY 1,2 ORDER BY 3 DESC;`

## 테이블 추가 (Sprint 5-B, 마이그레이션 0007)

| 테이블 | 내용 |
|---|---|
| imagination_parents | 계보: 혼합 글(child_id) ← 재료 글(parent_id). position 0 = 상대 글, 1 = 섞은 사람의 글 |
| shake_attempts | Shake it 시도 기록 (target_id · mine_id · selection_ms · status processing/published/failed · published_id · ai_elements · llm_model · error). 실패도 남김 |

- 하루 Shake 횟수 = 오늘(한국 시간) `status='published'` 시도 수. 실패는 세지 않는다
- 재료 글의 Shake 수 = `imaginations.child_count` (혼합 글을 지우면 1 줄어든다. 계보 연결은 남긴다)
- Alembic 은 SQL 로 만든 HNSW 인덱스를 비교에서 뺀다 (`alembic/env.py` MANUAL_INDEXES)
- 시도 보기: `SELECT status, count(*), avg(selection_ms) FROM shake_attempts GROUP BY 1;`

## 테이블 추가 (Sprint 5-C, 마이그레이션 0008)

| 테이블 | 내용 |
|---|---|
| similar_sets | 한 상상의 비슷한 상상 계산 기록 (method rerank/vector · model · candidate_count · computed_at). 결과 0개여도 남김 |
| similar_links | 기준 상상 → 비슷한 상상 (rank · score = 1단계 벡터 유사도 · reason = LLM 이 붙인 이유) |

- 2단계 검색: pgvector 후보 `SIMILAR_CANDIDATES`(20) → LLM(`similar_rerank`)이 정말 비슷한 것만 최대 `SIMILAR_SHOW`(5)개 + 이유
- 글을 올리면 백그라운드로 그 글의 목록을 계산한다. 다른 글의 목록은 새 글을 모르므로 `similar-all --force` 를 주기적으로 돌린다
- LLM 이 실패하면 벡터 순서로 저장(method=vector) → `similar-all` 이 다시 계산
- 결과 보기: `uv run python -m app.interfaces.cli similar --id 177 [--rerank]`

## 띄우기 · 끄기
```bash
docker compose up -d postgres memgraph   # 띄우기
docker compose ps                        # 상태 (postgres: healthy)
docker compose logs -f postgres          # 로그
docker compose stop                      # 끄기 (데이터 유지)
docker compose down -v                   # ⚠ 데이터까지 삭제 (초기화)
```

## DBeaver 접속
1. 새 연결 → **PostgreSQL**
2. 값 (`.env` 와 같게)
   | 항목 | 값 |
   |---|---|
   | Host | `localhost` |
   | Port | `5432` (`.env` 의 `POSTGRES_PORT`) |
   | Database | `imagine_dev` |
   | Username | `imagine` |
   | Password | `imagine_local_pw` |
3. 처음 접속하면 DBeaver 가 PostgreSQL 드라이버를 내려받겠냐고 묻는다 → 다운로드
4. `imagine_test` 도 보려면 연결 설정 → PostgreSQL 탭 → "Show all databases" 체크

> WSL 에서 docker 를 띄우고 Windows 의 DBeaver 로 접속할 때도 `localhost:5432` 로 접속된다 (Docker Desktop 이 포트를 Windows 로 열어 준다).

## 마이그레이션 (Alembic)
```bash
uv run alembic upgrade head                          # 최신 구조로
uv run alembic current                               # 지금 버전
uv run alembic history                               # 이력
uv run alembic revision --autogenerate -m "설명"     # 모델(ORM)을 바꾼 뒤 마이그레이션 파일 생성 → 내용 확인 후 upgrade
uv run alembic downgrade -1                          # 한 단계 되돌리기
```

| 버전 | 내용 |
|---|---|
| 0001 | pgvector 확장 활성화 (테이블은 Sprint 1 부터) |

## 분석용 SQL
`docs/sql/` 에 모은다 (Sprint 6~: 태그 조합, Wave 확산 경로 등). DBeaver 에서 파일을 열어 바로 실행.

## Memgraph (Sprint 7)
- 주소: `bolt://localhost:7687` (인증 없음, 로컬 전용)
- Memgraph Lab(공식 관리 도구)으로 Cypher 조회 가능. 데이터 수정은 하지 않는다.
