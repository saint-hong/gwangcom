import { useSyncExternalStore } from "react";
import type { TocItem } from "../components/note/NoteBody";

/**
 * Observe Note 상세의 목차를 오른쪽 컬럼에 보여 주기 위한 작은 저장소 (2026-11-17 사용자 결정: 목차는 오른쪽 패널 맨 위)
 *   노트 화면이 열릴 때 목차를 넣고, 닫힐 때 비운다. 오른쪽 컬럼(RightRail)이 읽는다.
 */
let items: TocItem[] = [];
const subs = new Set<() => void>();

export function setNoteToc(next: TocItem[]): void {
  items = next;
  subs.forEach((f) => f());
}

export function useNoteToc(): TocItem[] {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => items,
  );
}
