import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../api/client";
import { useAuth } from "./useAuth";

type UnreadApi = { count: number; refresh: () => void; clear: () => void };
const UnreadContext = createContext<UnreadApi>({ count: 0, refresh: () => {}, clear: () => {} });

const POLL_MS = 60_000; // 실시간 푸시 없이 60초마다 (기획안 v9 F15)

/** 안 읽은 알림 수 — 사이드바 종 · 모바일 하단 탭 배지 */
export function UnreadProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    if (!user) return;
    api<{ count: number }>("/api/notifications/unread-count").then(
      (r) => setCount(r.count),
      () => {},
    );
  }, [user]);

  useEffect(() => {
    setCount(0);
    if (!user) return;
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    const onFocus = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [user, refresh]);

  return (
    <UnreadContext.Provider value={{ count, refresh, clear: () => setCount(0) }}>{children}</UnreadContext.Provider>
  );
}

export const useUnread = () => useContext(UnreadContext);
