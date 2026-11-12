import { usePaged } from "./usePaged";

export type FeedTab = "recommended" | "latest" | "following";

/** 홈 피드 — 20개씩 커서로 이어 불러온다 (응답의 next_cursor, 기획안 v9 8장). */
export function useFeed(tab: FeedTab, domain: string | null, authKey: string) {
  const q = new URLSearchParams({ tab });
  if (domain) q.set("domain", domain);
  return usePaged(`/api/feed?${q}`, authKey, "피드를 불러오지 못했어요.");
}
