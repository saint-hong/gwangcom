# 코드 구조

> 갱신: 2026-11-10 (Sprint 4) · 기준: Insurance-Helper-v4 의 4계층 구조, 기획안 v10 11장 (실제 구조는 이 문서가 기준)

## 백엔드 `app/`

```
app/
├── __init__.py                 # 버전
├── __main__.py                 # python -m app → 개발 서버
├── main.py                     # FastAPI 앱 · CORS · 오류 처리 · 라우터 등록 · /uploads · /health
│
├── domains/                    # 비즈니스 (router → service → crud → models/schemas)
│   ├── auth/                   # 가입·로그인·JWT ✅ security(bcrypt·PyJWT) · deps(optional/current/admin_user) · router · service · schemas
│   ├── users/                  # 사용자 ✅ models(+Follow) · crud · schemas · service(프로필·탭·팔로우·추천·프로필 수정·비밀번호) · router(/api/users/*)
│   ├── imaginations/           # 상상 ✅ models(+조회 기록, 댓글도 kind=comment) · crud · service(쓰기·인용·피드·상세·삭제, present = actions·my·인용 원본) · actions · router · ai_jobs(글 올린 뒤 백그라운드 태깅·임베딩)
│   ├── reactions/              # Thunder·Wave·북마크 ✅ models(+reaction_events) · service(켜기·끄기 · 서재) · router(/thunder·/wave·/bookmark · /api/me/library)
│   ├── comments/               # 댓글·답글 ✅ service(1단계 모음 · 최신순 · 삭제 자리) · router — 저장은 imaginations(kind=comment)
│   ├── tags/                   # 분야·태그 ✅ models(Domain · Tag · ImaginationTag) · router(/api/domains) · tagging.py(태깅 호출) · service(정규화 · 저장 · tag_all) — 태그 화면은 Sprint 5-D
│   ├── shake/                  # Shake it ✅ blend.py(혼합 호출 + 출력 검사) · models(ImaginationParent · ShakeAttempt) · service(선택 창 · 섞어서 게시) · router(/api/shake) · lineage(계보 그래프 노드 · 화살표)
│   ├── prompts/                # 이번 주 질문                   (Sprint 6)
│   ├── notes/                  # Observe Note                      (Sprint 6)
│   ├── notifications/          # 알림 ✅ models · service(notify · 목록 · 안 읽은 수 · 읽음) · router(/api/notifications)
│   ├── policy/                 # 이용 한도 ✅ models(등급·설정) · service(최종 한도 계산) · router(/api/me/limits) — 관리 화면 Sprint 6
│   ├── activity/               # 내 활동                        (Sprint 8)
│   ├── graph/                  # Memgraph 동기화·탐색기           (Sprint 7)
│   ├── similar/                # 임베딩·비슷한 상상 ✅ models(ImaginationEmbedding · SimilarSet · SimilarLink) · service(embed_all · find_similar = 1단계 벡터) · rerank(2단계 LLM 리랭킹 · 저장 · 화면용 similar_for) · schemas
│   └── admin/                  # 운영자 통계·관리                 (Sprint 6)
│
├── infrastructure/             # 외부 시스템·기반
│   ├── core/                   # config · database · logging · exceptions · model_registry(모든 모델 등록)
│   ├── storage/images.py       # 업로드 이미지 저장 (Pillow 로 형식 확인, data/uploads/YYYY/MM)
│   ├── llm/                    # ✅ router(기능 → 제공자·모델, 기록, 하루 한도) · prompts(prompts/v1 로더) · models(LlmCall)
│   │   └── providers/          #    base · anthropic(Claude, 구조화 출력) · fake
│   └── embeddings/             # ✅ get_embedder() · gemini(batchEmbedContents 768) · fake
│       (Sprint 7: graph/)
│
├── shared/                     # errors(오류 형식) · cursor(next_cursor) · time(한국 시간 자정)
└── interfaces/cli/             # create-admin · seed-demo · embed-all · similar · ai-eval(모델 실측) (seed_data.py · ai_eval.py)

prompts/v1/                     # LLM 프롬프트 (tagging.md · shake.md) — 코드와 분리
```

## 프론트엔드 `frontend/src/`

> 화면 기준: 하이젠버그 메인 캡처 — 상세는 [design-system.md](design-system.md)

```
src/
├── main.tsx · App.tsx          # 진입점 · 라우팅 (기획안 4장 화면 목록)
├── brand.ts                    # 서비스명 · 분야 목록
├── api/client.ts               # fetch 래퍼 · 토큰(localStorage) · ApiError(code·message)
├── types/api.ts                # 백엔드 응답 타입 (Imagination · Actions · Page · Limits …)
├── lib/actions.ts              # actions 거절 이유 → 안내 문구 · 준비 중 기능 · 날짜 표기
├── hooks/
│   ├── useAuth.tsx             # 로그인 상태 + 로그인·가입 모달 (AuthProvider)
│   ├── usePaged.ts             # 커서 목록 공통 (홈 피드 · 서재 · 프로필 · 알림)
│   ├── useUnread.tsx           # 안 읽은 알림 수 (60초마다)
│   ├── useDreamerCard.tsx      # 상세 작성자 ↔ 오른쪽 "이 상상의 Dreamer" 같은 팔로우 상태
│   ├── useFeed.ts              # 홈 피드 (usePaged)
│   ├── useDismiss.ts           # 메뉴 바깥 클릭·Esc 로 닫기
│   └── useTheme.ts             # 다크 모드 (localStorage 저장, 실패해도 동작)
├── styles/
│   ├── tokens.css              # 디자인 토큰 (라이트/다크) · 나눔스퀘어 네오(가변) · 로고용 Heavy
│   └── base.css
├── design-system/
│   ├── Button · ButtonLink     # 알약 버튼 (primary/outline, lg/md/sm)
│   ├── IconButton              # 아이콘 + 숫자 + 툴팁 (글자 없음), lucide · 자체 아이콘 모두 받음
│   ├── Tabs                    # 상단 글자 탭 (선택 밑줄)
│   ├── TagPill                 # 태그 · 메타 pill
│   └── Avatar                  # 원형 아바타
├── components/
│   ├── layout/
│   │   ├── AppShell            # 사이드바 275 · 본문 600 · 오른쪽 350 (반응형 4단계)
│   │   ├── SideNav · navItems  # 로고 · 메뉴(로그인 전·후) · 더 보기(다크 모드) · [가입하기][로그인] ↔ [상상 쓰기]
│   │   ├── AccountChip         # 로그인 후 맨 아래 계정 칩 + 계정 메뉴 (프로필 보기 · 설정 · 내 활동 · 운영자 · 로그아웃)
│   │   ├── PageHeader          # 하위 화면 상단 바 [←] 제목
│   │   ├── ImagineLogo         # 글자 로고(첫 글자 I = SVG) · 접힌 사이드바용 마크(보라 정사각형 + I)
│   │   ├── RightRail           # 검색창 · 이번 주 질문 · 인기 상상 · 추천 Dreamer · 추천 주제 · 푸터
│   │   ├── SiteFooter          # 링크 · 회사 정보 · (개발 중) 서버 연결 상태
│   │   ├── MobileTopBar        # 700px 미만 상단 바
│   │   └── BottomTabBar        # 700px 미만 하단 탭바 (아이콘 5개)
│   ├── auth/AuthModal          # 로그인 · 가입 모달
│   ├── feedback/Toast          # 안내 메시지 (흐린 버튼을 눌렀을 때 등)
│   ├── feed/DomainChips        # 로그인 후 홈의 분야 칩 줄
│   ├── feed/ImaginePrompt      # 홈 탭 줄 아래 상상하기 유도 영역 (X 글쓰기 자리)
│   ├── social/FollowButton     # [팔로우] ↔ [팔로잉] (hover 언팔로우)
│   ├── card/ImaginationCard    # 피드 카드 (원본 · 인용 · 댓글 — 인용·댓글은 제목 없이 글만)
│   ├── card/QuoteEmbed         # 인용 글 아래 원본 카드 (삭제되면 "삭제된 상상이에요")
│   ├── card/ItemMenu           # ⋯ 메뉴 — 링크 복사 · (내 글·댓글) 삭제
│   ├── comments/               # CommentSection(목록·무한 스크롤) · CommentItem(X 줄 + 같은 액션 바) · CommentComposer(접힘 → 펼침)
│   └── actions/
│       ├── ActionBar           # Thunder · Wave · 댓글 · Shake it … 북마크 · 공유 — actions 로 흐리게, my 로 켜짐, 누르면 바로 반영(실패 시 되돌림)
│       ├── WaveMenu            # Wave 버튼 메뉴 [Wave / Wave 취소] [인용하기]
│       ├── QuoteModal          # S6 인용하기 (본문 300자 + 원본 미리보기)
│       ├── WaveIcon            # Wave 파도 아이콘 (참고 이미지 윤곽, 채움)
│       ├── ShakeButton         # Shake it 버튼 (선 아이콘, 숟가락·젓가락 들썩 + 별 깜빡)
│       └── ShakeIcon           # 비빔밥 그릇 + 숟가락 · 젓가락 + 별 (SVG)
└── pages/
    ├── home/HomePage           # S1 로그인 전 분야 탭 / 후 [추천|팔로잉|최신] + 분야 칩 + 피드
    ├── write/WritePage         # S3 상상 쓰기
    ├── imagination/ImaginationPage  # S4 상상 상세 (X 구조) + 댓글 · 재료 상상 · [계보 그래프 보기] · (좁은 화면) 비슷한 상상
    ├── lineage/LineagePage     # S15 계보 그래프 (층 배치 · 화살표 · 확대/축소/이동 · 미리보기)
    ├── library/LibraryPage     # S12 서재 [Thunder | Wave | Shake it | 북마크 | 최근 본 상상]
    ├── trending/TrendingPage   # S7 인기 상상 (순위 + 액션 바, 오른쪽 컬럼 있음)
    ├── profile/                # S11 ProfilePage(X, [상상|댓글|인용]) · EditProfileModal(커버·이미지·이름·소개) · FollowListPage(S17 팔로워·팔로잉)
    ├── notifications/          # S13 알림 [전체 | 댓글] (X)
    ├── settings/SettingsPage   # S14 비밀번호 변경
    └── common/                 # PlaceholderPage(미구현 화면) · ProfileRoute(/@닉네임)
```

그 밖의 프론트 파일
```
frontend/
├── index.html                  # 탭 제목 · 설명: "Imagine - 당신의 상상이 세상을 바꿉니다"
└── public/favicon.svg          # 파비콘: 보라 둥근 정사각형 + 흰 대문자 I
```

## 반응형 기준
[design-system.md 1장](design-system.md#1-레이아웃) 참고 (1280 · 1100 · 900 · 700px 기준).
