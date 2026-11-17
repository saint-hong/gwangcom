import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { Author, FeedNote, NoteCard, NoteList } from "../types/api";

/** 홈 피드에서 Observe Note 를 끼우는 자리: 11 · 21 · 31 … 번째 (2026-11-17 사용자 요청) */
export const NOTE_EVERY = 10;

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 홈 피드 사이에 끼울 Observe Note — 발행한 노트(최대 50개)를 섞어서 차례로 쓴다.
 * 한 번 섞은 순서를 자리마다 하나씩 쓰므로 11 · 21 · 31 … 번째에 같은 노트가 두 번 나오지 않는다.
 * 노트를 다 쓰면 그 뒤로는 끼우지 않는다. 탭을 바꾸거나 다시 들어오면 새로 섞는다.
 */
export function useFeedNotes(enabled: boolean, key: string): NoteCard[] {
  const [notes, setNotes] = useState<NoteCard[]>([]);
  useEffect(() => {
    if (!enabled) {
      setNotes([]);
      return;
    }
    let alive = true;
    api<NoteList>("/api/notes?size=50").then(
      (l) => alive && setNotes(l.items),
      () => alive && setNotes([]),
    );
    return () => {
      alive = false;
    };
  }, [enabled, key]);
  // notes 가 새로 오거나 key(탭 · 사용자)가 바뀔 때만 다시 섞는다
  return useMemo(() => shuffle(notes), [notes, key]);
}

export type FeedRow<T> = { kind: "item"; item: T } | { kind: "note"; note: NoteCard; wavedBy?: Author | null };

/** 상상 목록 사이에 노트를 끼운다: 전체 순서로 11 · 21 · 31 … 번째가 노트 */
export function mixNotes<T>(items: T[], notes: NoteCard[]): FeedRow<T>[] {
  const out: FeedRow<T>[] = [];
  let k = 0;
  for (const item of items) {
    if (out.length > 0 && out.length % NOTE_EVERY === 0 && k < notes.length) out.push({ kind: "note", note: notes[k++] });
    out.push({ kind: "item", item });
  }
  return out;
}

/** 서버가 정한 자리(after_id = 이 상상 바로 뒤, null = 맨 앞)에 노트를 둔다 — 팔로잉 탭 · 서재 북마크 탭 */
export function placeNotes<T extends { id: number }>(items: T[], notes: FeedNote[]): FeedRow<T>[] {
  const after = (id: number | null): FeedRow<T>[] =>
    notes.filter((n) => n.after_id === id).map((n) => ({ kind: "note", note: n.note, wavedBy: n.waved_by ?? null }));
  return [...after(null), ...items.flatMap((item) => [{ kind: "item" as const, item }, ...after(item.id)])];
}
