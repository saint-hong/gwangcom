# Imagine

> 상상하고, **Thunder** 를 보내고, **Wave** 로 퍼뜨리고, **Shake it**으로 섞어 보는 상상 플랫폼 — 광화문컴퍼니

상상이 쌓이면 그 안에서 반복되는 기술 조합과 욕망을 분석해 **Observe Note**로 발행합니다.

## 왜 Imagine 인가 — 철학적 배경

- **상상은 현실보다 먼저 움직이는 데이터** 
  - 상상이 충분히 쌓이면 기술은 "발명"이 아니라 그 상상에 대한 "응답"으로 나타난다.
- **허황된 상상은 틀린 예측이 아니라, 아직 완성되지 않은 방향** 
  - 한 사람의 상상은 잡음이지만, 대중속에서 반복되면 욕망의 방향이 된다.
- **상상은 세련된 기술의 촉매제** 
  - 상상은 덜 세련 된 기술들을 서로 충돌하게 하여 세련 된 기술로 융합시킨다. 오래 지속된 욕망이 성숙한 기술들의 새로운 조합과 만날 때 다음 기술이 태어난다.
- **예측이 아닌, 관측** 
  - Imagine 은 상상속에 담긴 미래의 정답이 아니라 더 나은 기술을 생성하는 압력, 곧 미래가 만들어지는 초기 조건을 모은다.

**문서**

- 기획안: [`../business_archy/플랫폼_기획안_v10.txt`](../business_archy/플랫폼_기획안_v10.txt)
- 현재 스프린트: [`docs/sprint.md`](docs/sprint.md) · 작업 기록: [`docs/work-log.md`](docs/work-log.md)
- DB 접속·마이그레이션 규칙: [`docs/db-guide.md`](docs/db-guide.md) · 코드 구조: [`docs/app-structure.md`](docs/app-structure.md) · 디자인: [`docs/design-system.md`](docs/design-system.md)
- 최근 변경: [맨 아래](#최근-변경)

---

## 기술 스택

| 분류 | 기술 |
|---|---|
| 백엔드 | Python 3.12 · FastAPI · uv |
| DB | PostgreSQL 16 + pgvector (개발·운영 동일, docker) · SQLAlchemy 2 · Alembic · DBeaver 로 관리 |
| 그래프 DB | Memgraph 3.10.1 (분석용 복사본, Sprint 7) |
| 프론트엔드 | React 18 · Vite 5 · TypeScript · react-router · lucide-react · CSS Modules · Pretendard(본문) · 나눔스퀘어 네오 Heavy(로고) |
| AI (Sprint 4~) | Claude API (Claude Haiku 5.5) · Gemini 임베딩 (gemini-embedding-001) — `.env` 로 교체, 키는 `.env` 에만 |

---

## 처음 실행하기

### 0. 준비물

| 도구 | 확인 명령 | 비고 |
|---|---|---|
| Python 3.12 | `python3 --version` | |
| uv | `uv --version` | 없으면 `python3 -m pip install uv` |
| Node.js 20+ | `node --version` | |
| Docker Desktop | `docker --version` | **WSL 사용 시** Docker Desktop → Settings → Resources → WSL integration 에서 사용 중인 배포판(Ubuntu 등)을 켜야 WSL 터미널에서 `docker` 가 동작합니다 |
| DBeaver | — | DB 조회용 (선택) |

### 1. 환경 변수

```bash
cp .env.example .env      # 값은 기본 그대로 써도 됩니다
```

- AI 기능(Sprint 4~)을 실제로 쓰려면 `.env` 에 키를 넣고 제공자를 바꾼다. 키가 없으면 `fake`(가짜 응답, 비용 0)로 돈다.
  ```
  LLM_PROVIDER=anthropic        ANTHROPIC_API_KEY=...   # Claude 콘솔
  EMBEDDING_PROVIDER=gemini     GEMINI_API_KEY=...      # Google AI Studio
  ```
- 키는 `.env` 에만 둔다 (git 제외). 모델 선택과 실측 결과: [docs/ai-models.md](docs/ai-models.md)

### 2. DB 띄우기 (터미널 1)

```bash
docker compose up -d postgres memgraph
docker compose ps                         # postgres 가 healthy 인지 확인
```

- 첫 실행 때 `imagine_dev`(개발) · `imagine_test`(테스트) DB 와 pgvector 확장이 자동으로 만들어집니다.
- PC 에 이미 PostgreSQL 이 5432 를 쓰고 있으면 `.env` 의 `POSTGRES_PORT` 와 `DATABASE_URL` 포트를 5433 으로 바꾸세요.

### 3. 백엔드 (터미널 2)

```bash
uv sync                                   # 의존성 설치 (.venv 생성)
uv run alembic upgrade head               # DB 구조 최신화 (처음, 그리고 DB 구조가 바뀔 때)
uv run uvicorn app.main:app --reload      # http://localhost:8000
```

- 샘플 데이터 (처음 한 번): `uv run python -m app.interfaces.cli seed-demo` → Dreamer 10명 · 상상 50개
  - 로그인: `dreamer01@demo.example.com` / `imagine1234` (01~10)
- 운영자 계정: `uv run python -m app.interfaces.cli create-admin --email <이메일> --nickname <닉네임>` (비밀번호는 입력 창)
- 상태 확인: http://localhost:8000/health → `"database": "ok"` 이면 DB 연결 성공
- API 문서: http://localhost:8000/docs

### 4. 프론트엔드 (터미널 3)

```bash
cd frontend
npm install
npm run dev                               # http://localhost:5173
```

브라우저에서 **http://localhost:5173** 을 엽니다. 개발 중에는 오른쪽 컬럼 맨 아래(좁은 화면은 본문 맨 아래) 푸터에 `● 백엔드 연결됨 · DB 연결됨` 이 표시됩니다.

| 주소 | 내용 |
|---|---|
| http://localhost:5173 | Imagine 웹 화면 |
| http://localhost:8000/docs | 백엔드 API 목록·직접 호출 |
| localhost:5432 | PostgreSQL (DBeaver 접속 — [`docs/db-guide.md`](docs/db-guide.md)) |
| bolt://localhost:7687 | Memgraph |

---

## 테스트 · 검사

```bash
uv run pytest                 # 백엔드 테스트
uv run ruff check .           # 백엔드 코드 검사
uv run ruff format .          # 백엔드 코드 정리
cd frontend && npm run build  # 프론트 타입 검사 + 빌드
```

> 참고: pyenv 가상환경이 켜져 있으면 `uv run` 이 `VIRTUAL_ENV ... does not match` 경고를 냅니다. 무시해도 됩니다 (uv 는 프로젝트의 `.venv` 를 씁니다).

---

## 폴더 구조 (요약)

```
Imagine-v1/
├── app/                 # 백엔드 (domains / infrastructure / shared / interfaces)
├── alembic/             # DB 마이그레이션
├── frontend/            # React + Vite
├── infra/postgres/init/ # PostgreSQL 첫 실행 스크립트
├── prompts/v1/          # LLM 프롬프트 (Sprint 4~)
├── tests/               # 백엔드 테스트
├── docs/                # 스프린트·작업 기록·DB 가이드
└── docker-compose.yml   # PostgreSQL + Memgraph
```

자세한 구조는 [`docs/app-structure.md`](docs/app-structure.md).

---

## 최근 변경

- **2026-11-11 — Sprint 5-A · 5-B · 5-C ✅** ([상세](docs/work-log.md) · [스프린트](docs/sprint.md))
  - 글을 올리면 AI 태깅 · 임베딩이 백그라운드로 자동 실행 (CLI `tag-all`), 본문 글꼴 Pretendard
  - Shake it: 내 상상 고르기 → 섞는 애니메이션 → 혼합 글 자동 게시 · 홈 맨 위 강조 · 재료 표시 · 알림 · 하루 10회
  - 계보 그래프(재료 → 혼합 글) · 비슷한 상상 = 벡터 후보를 AI 가 다시 골라 이유와 함께 (CLI `similar-all`)
- **2026-11-10 — Sprint 4 ✅ AI 모델 기반** ([AI 모델 결정](docs/ai-models.md)): 글 생성 Claude Haiku 5.5 · 임베딩 Gemini gemini-embedding-001, `.env` 로 제공자 전환(fake 포함), 호출 기록 · 하루 한도, CLI `embed-all` · `ai-eval`
- **2026-11-10 — 기획안 v10**: Sprint 1~3 중 결정(X 구조 · 댓글 = 게시글 · 서재/프로필 탭 · 상상하기 · 뱃지 보기 · 인기 = 풍향계)을 한 번에 반영
- **2026-11-10 — Sprint 3 ✅ 관계와 탐색** ([상세](docs/work-log.md) · [스프린트](docs/sprint.md))
  - 팔로우 · 팔로잉 탭("○○님이 Wave함") · 홈 상상하기 유도 영역 · 프로필/프로필 수정/알림을 X 구조로
  - 인기 상상(최근 7일 점수 순) · 추천 탭 점수 적용 · 오른쪽 컬럼 인기 상상·추천 Dreamer · 설정(비밀번호)
- **2026-11-10 — Sprint 2 ✅ 반응 · 댓글(X 구조) · 서재** ([상세](docs/work-log.md) · [스프린트](docs/sprint.md))
  - Thunder · Wave · 북마크 실제 동작(누르면 바로 반영), 내가 눌렀는지(`my`), Wave 메뉴 [Wave][인용하기] · 인용 카드
  - 상상 상세를 X 게시물 구조로 재배치, 댓글·답글(댓글도 게시글처럼 같은 액션 바), 서재 [북마크 | Thunder | 최근 본 상상]
  - seed-demo 에 샘플 반응·댓글·인용 추가
- **2026-11-10 — Sprint 1 ✅ 회원 · 상상 쓰기 · 홈 피드 · 상세** ([상세](docs/work-log.md) · [스프린트](docs/sprint.md))
  - 로그인·가입 모달, 로그인 전·후 사이드바([상상 쓰기] · 계정 메뉴), 홈 [추천|팔로잉|최신] + 분야 칩, 글쓰기(이미지), 상세
  - 이용 한도 계산(개인 → 등급 → 전체), 응답마다 `actions`, 피드 `next_cursor`, CLI `create-admin` · `seed-demo`
- **2026-11-10 — 기획안 v9 · 용어 · UI 정리**: Thunder(번개) · Observe Note · Dreamer, 버튼 hover 는 움직임만 · 툴팁 없음, 맨 위 띠 64px
- **2026-11-09 — UI 기준 반영 · 다듬기** ([디자인 시스템](docs/design-system.md) · [변경 요약](docs/work-log.md))
  - 레이아웃: 하이젠버그 메인 캡처 기준 — 상단 헤더 없음, 왼쪽 사이드바(275) · 본문(600, 좌우 세로 테두리) · 오른쪽 카드 컬럼(350), 반응형 4단계
  - 글꼴: **Pretendard** (로고만 나눔스퀘어 네오 Heavy) · 강조색: 보라(임시, 정체성 논의 후 확정)
  - 분야: 본문 상단 글자 탭 (추천 · AI · Semiconductor · Space · Mobility · Bio · Energy · Mobile · Life)
  - 피드 카드 · 액션 바: **공명 · Wave · 댓글 · Shake it …… 북마크 · 공유**, 버튼마다 hover 움직임
  - 자체 아이콘: **Wave** = 말려 올라가는 파도(채움) · **Shake it** = 비빔밥 그릇 + 숟가락 · 젓가락 + 반짝이 별
  - 브랜드: 글자 로고 "Imagine"(첫 글자 = 파비콘과 같은 I) · 파비콘 = 보라 정사각형 + I · 탭 제목 "Imagine - 당신의 상상이 세상을 바꿉니다"
  - 개발 모드 홈에 "디자인 미리보기" 예시 카드 2개 (Sprint 1 에서 실제 글로 대체)
- **2026-11-09 — Sprint 0 프로젝트 골격 ✅** ([상세](docs/work-log.md)) — 백엔드·프론트·DB(PostgreSQL+pgvector, Memgraph) 실행 확인
  - 백엔드: FastAPI · 설정(.env) · SQLAlchemy 2 · Alembic(pgvector 확장) · `/health`
  - 프론트: React 18 + Vite + TS · 디자인 토큰(라이트/다크) · 공통 레이아웃 · 아이콘 버튼
  - 인프라: docker-compose (PostgreSQL 16 + pgvector, Memgraph 3.10.1)
