/** 백엔드 API 응답 타입 (app/domains/<도메인>/schemas.py 와 맞춘다). */

export type Me = {
  id: number;
  email: string;
  nickname: string;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  role: "user" | "admin";
  created_at: string;
};

export type TokenResponse = { access_token: string; token_type: "bearer"; user: Me };

export type Reason =
  | "login_required"
  | "own_post"
  | "not_allowed"
  | "shake_disabled"
  | "daily_limit"
  | "not_material"; // 댓글은 Shake it 재료가 아니다

export type ActionState = { allowed: boolean; reason: Reason | null; remaining: number | null };

export type ActionKey =
  | "thunder"
  | "wave"
  | "quote"
  | "comment"
  | "shake"
  | "bookmark"
  | "delete"
  | "edit_tags"; // 작성자 기술 태그 편집. remaining = 더 붙일 수 있는 태그 수 (5-D)

export type Actions = Record<ActionKey, ActionState>;

export type DomainRef = { slug: string; name: string };

/** 기술 태그. name = 주소용(/tags/:name), label = 화면 표기. 욕망 태그는 분석용이라 오지 않는다 */
export type TagRef = { name: string; label: string };

export type Author = { id: number; nickname: string; avatar_url: string | null; is_operator: boolean };

export type Kind = "original" | "blend" | "quote" | "comment";

/** 내가 이미 눌렀는지 — 서버가 알려 준다 (v10 반영목록 2장) */
export type My = { thunder: boolean; wave: boolean; bookmark: boolean };

export type Counts = { thunders: number; waves: number; comments: number; quotes: number; shakes: number };

/** 인용 글 아래 원본 요약. 원본이 삭제되면 deleted=true */
export type Quoted = {
  id: number | null;
  deleted: boolean;
  kind: Kind | null;
  author: Author | null;
  domain: DomainRef | null;
  display_title: string | null;
  body: string | null;
  image_url: string | null;
  created_at: string | null;
};

export type Imagination = {
  id: number;
  kind: Kind;
  author: Author;
  domain: DomainRef;
  secondary_domain: DomainRef | null;
  title: string | null;
  display_title: string;
  body: string;
  desire: string | null;
  image_url: string | null;
  ai_assisted: boolean;
  shake_allowed: boolean;
  counts: Counts;
  created_at: string;
  actions: Actions;
  my: My;
  /** 기술 태그 (원본 · 인용 · 혼합, 댓글은 빈 목록) */
  tags: TagRef[];
  /** 운영자가 숨긴 글 — 작성자 본인 · 운영자에게만 상세가 열린다 (Sprint 6-A) */
  hidden: boolean;
  quoted: Quoted | null;
  /** 혼합 글(kind=blend)일 때: 재료 글 2개 [상대 글, 섞은 사람의 글]. 지워졌으면 deleted=true */
  sources?: Quoted[] | null;
  /** 댓글(kind=comment)일 때: 바로 위 글 · 맨 위 상상 · 누구에게 단 댓글인지 */
  parent_id: number | null;
  root_id: number | null;
  reply_to: Author | null;
  /** 팔로잉 탭 · 프로필 Wave 탭: "○○님이 Wave함". 이 Wave 를 보고 Wave 하면 확산 경로(via)로 기록 */
  waved_by: Author | null;
  /** 이번 주 질문에 답한 상상이면 그 질문 (6-C) */
  prompt?: { id: number; title: string } | null;
};

export type ReactionResult = { my: My; counts: Counts };

/** 맨 위 댓글 + 답글. 답글이 남은 삭제된 댓글은 comment=null */
export type CommentThread = { id: number; comment: Imagination | null; replies: Imagination[] };

export type Page<T> = { items: T[]; next_cursor: string | null };

/** S8 주제 둘러보기 — 분야마다 많이 등장한 기술 태그 (원본 · 인용 기준) */
export type TopicTag = TagRef & { count: number };
export type Topics = {
  /** 분야 상관없이 많이 나온 주제 (오른쪽 컬럼 "추천 주제") */
  popular: TopicTag[];
  domains: { slug: string; name: string; tags: TopicTag[] }[];
};

/** S9 태그별 상상 */
export type TagFeed = Page<Imagination> & { tag: TagRef & { count: number } };

/** Shake it 선택 창 (GET /api/shake/candidates) — 상대 글 + 내 상상(원본 · 인용 · 혼합) + 오늘 남은 횟수 */
export type ShakeCandidates = Page<Imagination> & { target: Imagination; remaining: number; limit: number };

export type Limits = {
  limits: Record<string, number>;
  permissions: Record<string, boolean>;
  today: { posts_used: number; posts_remaining: number; shakes_remaining: number };
};

/** 프로필 머리 (X 구조). 위치 · 가입일 · 인증 배지는 없다 */
export type Profile = {
  id: number;
  nickname: string;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  is_operator: boolean;
  counts: { posts: number; following: number; followers: number };
  is_me: boolean;
  following: boolean;
};

export type Dreamer = { author: Author; bio: string | null; following: boolean };

export type FollowResult = { following: boolean; followers: number };

export type NotificationType = "thunder" | "wave" | "quote" | "comment" | "reply" | "follow" | "shaken" | "cited";

export type Notification = {
  id: number;
  type: NotificationType;
  actor: Author | null;
  /** thunder·wave = 반응을 받은 내 글 / comment·reply·quote = 새 글 / follow = null */
  item: Imagination | null;
  read: boolean;
  created_at: string;
};

/** 팔로워 · 팔로잉 목록 한 줄 (버튼은 보는 사람 기준) */
export type FollowUser = { author: Author; bio: string | null; following: boolean; follows_me: boolean };

/** 비슷한 상상 (GET /api/imaginations/{id}/similar, F23) — rerank = AI 가 고름 · vector = 글 모양 순서 · tags = 같은 분야 · 태그 · none = 대상 아님 */
export type SimilarResult = {
  items: { item: Imagination; score: number | null; reason: string | null }[];
  method: "rerank" | "vector" | "tags" | "none";
};

/** 계보 그래프 (GET /api/imaginations/{id}/lineage, F9) — depth: 0 = 현재 글, 음수 = 조상(재료), 양수 = 자손(혼합 글) */
export type LineageNode = {
  id: number;
  depth: number;
  kind: Kind | null;
  deleted: boolean;
  display_title: string | null;
  author: Author | null;
  domain: DomainRef | null;
};
export type Lineage = {
  center_id: number;
  nodes: LineageNode[];
  edges: { source: number; target: number; position: number }[];
  truncated: boolean;
};

/** 운영자 A4 게시물 관리 (Sprint 6-A) */
export type ModerationLog = { action: "hide" | "unhide"; admin: string | null; reason: string | null; at: string };
export type AdminItem = {
  id: number;
  kind: Kind;
  status: "visible" | "hidden";
  author: Author;
  domain: DomainRef;
  display_title: string;
  body: string;
  root_id: number | null;
  counts: Counts;
  created_at: string;
  last_moderation: ModerationLog | null;
};
export type AdminItems = { items: AdminItem[]; total: number; page: number; size: number };

/** 운영자 A5 · A6 정책 · 사용자 관리 (Sprint 6-B) */
export type PolicyValue = number | boolean;
export type PolicyKey = {
  key: string;
  label: string;
  group: string;
  kind: "int" | "bool";
  unit: string;
  min: number;
  max: number;
};
export type Tier = { id: number; name: string; description: string | null; is_default: boolean; user_count: number };
export type ChangeLog = {
  id: number;
  admin: string | null;
  target_scope: "global" | "tier" | "user";
  tier: string | null;
  user: string | null;
  key: string;
  label: string;
  old_value: PolicyValue | string | null;
  new_value: PolicyValue | string | null;
  expires_at: string | null;
  at: string;
};
export type PolicyView = {
  keys: PolicyKey[];
  global_values: Record<string, PolicyValue>;
  tier_values: Record<string, Record<string, PolicyValue>>;
  tiers: Tier[];
  logs: ChangeLog[];
};
export type AdminUser = {
  id: number;
  nickname: string;
  email: string;
  avatar_url: string | null;
  role: "user" | "admin";
  tier: string | null;
  posts: number;
  exceptions: number;
  created_at: string;
};
export type AdminUsers = { items: AdminUser[]; total: number; page: number; size: number };
export type LimitRow = {
  key: string;
  value: PolicyValue;
  source: "user" | "tier" | "global" | "default";
  exception: PolicyValue | null;
  exception_expires_at: string | null;
  exception_expired: boolean;
};
export type AdminUserDetail = {
  user: AdminUser;
  tier_id: number | null;
  activity: {
    posts: number;
    blends: number;
    comments: number;
    thunders_received: number;
    posts_today: number;
    shakes_today: number;
  };
  keys: PolicyKey[];
  limits: LimitRow[];
  tiers: Tier[];
  logs: ChangeLog[];
};

/** 이번 주 질문 (Sprint 6-C) */
export type Prompt = {
  id: number;
  title: string;
  body: string | null;
  starts_at: string;
  ends_at: string | null;
  open: boolean;
  answer_count: number;
};
export type PromptStatus = "open" | "scheduled" | "ended" | "off";
export type AdminPrompt = {
  id: number;
  title: string;
  body: string | null;
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
  status: PromptStatus;
  answer_count: number;
  created_by: string | null;
  created_at: string;
};
export type AdminPrompts = { items: AdminPrompt[]; total: number; page: number; size: number };
