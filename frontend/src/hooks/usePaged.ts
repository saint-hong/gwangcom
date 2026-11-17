import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api/client";
import type { Imagination, Page } from "../types/api";

/**
 * 커서 목록 — 20개씩 이어 불러온다 (응답의 next_cursor, 기획안 v9 8장). 홈 피드 · 서재 · 프로필 · 알림이 함께 쓴다.
 * path 가 바뀌거나 authKey(로그인 상태)가 바뀌면 처음부터 다시 불러온다.
 */
export function usePaged<T extends { id: number } = Imagination, P extends Page<T> = Page<T>, X = never>(
  path: string | null,
  authKey: string,
  errorText = "목록을 불러오지 못했어요.",
  /** 페이지마다 목록 밖 항목을 모은다 (서재 북마크 탭의 Observe Note, 2026-11-17) */
  collect?: (page: P) => X[],
) {
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [head, setHead] = useState<P | null>(null); // 첫 페이지 응답 그대로 (목록 밖 정보: 태그 이름 · 수 등)
  const [extra, setExtra] = useState<X[]>([]);
  const collectRef = useRef(collect);
  collectRef.current = collect;
  const req = useRef(0);

  const load = useCallback(
    async (from: string | null, reset: boolean) => {
      if (!path) return;
      const id = ++req.current;
      setLoading(true);
      setError(null);
      const url = from ? `${path}${path.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(from)}` : path;
      try {
        const page = await api<P>(url);
        if (id !== req.current) return; // 탭을 바꾼 사이 늦게 온 응답은 버린다
        if (reset) setHead(page);
        setItems((prev) => (reset ? page.items : [...prev, ...page.items]));
        const more = collectRef.current?.(page) ?? [];
        setExtra((prev) => (reset ? more : [...prev, ...more]));
        setCursor(page.next_cursor);
        setDone(page.next_cursor === null);
      } catch (e) {
        if (id === req.current) setError(e instanceof ApiError ? e.message : errorText);
      } finally {
        if (id === req.current) setLoading(false);
      }
    },
    [path, errorText],
  );

  useEffect(() => {
    setItems([]);
    setExtra([]);
    setHead(null);
    setCursor(null);
    setDone(false);
    void load(null, true);
  }, [load, authKey]);

  const loadMore = useCallback(() => {
    if (!loading && !done && !error) void load(cursor, false);
  }, [loading, done, error, cursor, load]);

  const remove = useCallback((id: number) => setItems((prev) => prev.filter((x) => x.id !== id)), []);

  return { items, extra, head, loading, done, error, loadMore, remove, retry: () => load(cursor, items.length === 0) };
}
