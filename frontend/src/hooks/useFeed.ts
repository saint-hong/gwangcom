import type { FeedNote, Imagination, Page } from "../types/api";
import { usePaged } from "./usePaged";

export type FeedTab = "recommended" | "latest" | "following";

/** 홈 피드 — 20개씩 커서로 이어 불러온다 (응답의 next_cursor, 기획안 v9 8장). */
export function useFeed(tab: FeedTab, domain: string | null, authKey: string) {
  const q = new URLSearchParams({ tab });
  if (domain) q.set("domain", domain);
  // 팔로잉 탭: 팔로우한 사람이 Wave 한 Observe Note 가 notes 로 함께 온다 (2026-11-17)
  return usePaged<Imagination, Page<Imagination> & { notes?: FeedNote[] }, FeedNote>(
    `/api/feed?${q}`,
    authKey,
    "피드를 불러오지 못했어요.",
    (page) => page.notes ?? [],
  );
}
