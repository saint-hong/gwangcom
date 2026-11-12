import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../api/client";
import type { Dreamer } from "../types/api";
import { useAuth } from "./useAuth";

type Api = {
  /** 지금 보고 있는 상상의 작성자 (상세 화면에서만) */
  card: Dreamer | null;
  show: (nickname: string | null) => void;
  setFollowing: (following: boolean) => void;
};

const Ctx = createContext<Api>({ card: null, show: () => {}, setFollowing: () => {} });

/**
 * 상세 화면의 "이 상상의 Dreamer" (v10 반영목록 3-1 — X 의 "연관된 사람" 자리).
 * 상세 화면이 작성자를 알려 주면 오른쪽 컬럼 블록과 작성자 줄의 [팔로우]가 같은 상태를 쓴다.
 */
export function DreamerCardProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [nickname, setNickname] = useState<string | null>(null);
  const [card, setCard] = useState<Dreamer | null>(null);

  useEffect(() => {
    setCard(null);
    if (!nickname || user === undefined) return;
    const ctrl = new AbortController();
    api<Dreamer>(`/api/users/${encodeURIComponent(nickname)}/card`, { signal: ctrl.signal }).then(setCard, () => {});
    return () => ctrl.abort();
  }, [nickname, user]);

  const show = useCallback((n: string | null) => setNickname(n), []);
  const setFollowing = useCallback((following: boolean) => setCard((c) => (c ? { ...c, following } : c)), []);
  return <Ctx.Provider value={{ card, show, setFollowing }}>{children}</Ctx.Provider>;
}

export const useDreamerCard = () => useContext(Ctx);
