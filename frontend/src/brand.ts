/** 서비스 이름·분야 칩 등 고정 문구 (기획안 v0.3 확정값). */

export const SERVICE_NAME = "Imagine";
export const COMPANY_NAME = "광화문컴퍼니";

/** 홈 피드 상단 분야 칩. 맨 앞 "추천"은 전체 글. 분야는 "어느 영역의 상상인가"의 구분일 뿐이다. */
export const DOMAINS = [
  { slug: "ai", name: "AI" },
  { slug: "semiconductor", name: "Semiconductor" },
  { slug: "space", name: "Space" },
  { slug: "mobility", name: "Mobility" },
  { slug: "bio", name: "Bio" },
  { slug: "energy", name: "Energy" },
  { slug: "mobile", name: "Mobile" },
  { slug: "life", name: "Life" },
] as const;
