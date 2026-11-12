import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { Prompt } from "../../types/api";

/** 지금 이번 주 질문 (없으면 null, 불러오는 중이면 undefined). 오른쪽 컬럼 · 홈 배너가 같이 쓴다 */
export function useCurrentPrompt(): Prompt | null | undefined {
  const [prompt, setPrompt] = useState<Prompt | null | undefined>(undefined);
  useEffect(() => {
    api<Prompt | null>("/api/prompts/current").then(setPrompt, () => setPrompt(null));
  }, []);
  return prompt;
}

/** "3일 남음" · "오늘 끝나요" · 끝나는 때가 없으면 null */
export function leftLabel(endsAt: string | null): string | null {
  if (!endsAt) return null;
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return "끝났어요";
  const days = Math.floor(ms / 86_400_000);
  return days >= 1 ? `${days}일 남음` : "오늘 끝나요";
}
