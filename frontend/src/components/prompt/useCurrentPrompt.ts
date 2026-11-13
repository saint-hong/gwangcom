import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { PromptList } from "../../types/api";

/**
 * 질문 목록 (진행 중 여러 개 + 끝난 질문, 2026-11-13). 오른쪽 블록 · 홈 배너가 쓴다.
 * open[0] = 지금 질문(current 와 같은 규칙). 실패하면 빈 목록.
 */
export function usePromptList(): PromptList | undefined {
  const [list, setList] = useState<PromptList | undefined>(undefined);
  useEffect(() => {
    api<PromptList>("/api/prompts").then(setList, () => setList({ open: [], ended: [], ended_total: 0 }));
  }, []);
  return list;
}

/** "3일 남음" · "오늘 끝나요" · 끝나는 때가 없으면 null */
export function leftLabel(endsAt: string | null): string | null {
  if (!endsAt) return null;
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return "끝났어요";
  const days = Math.floor(ms / 86_400_000);
  return days >= 1 ? `${days}일 남음` : "오늘 끝나요";
}
