import type { ActionKey, ActionState, Imagination } from "../types/api";

/** 서버가 내려준 거절 이유(actions.reason)를 안내 메시지로 바꾼다 (기획안 v9 F20 — 툴팁 대신). */
export function reasonMessage(key: ActionKey, state: ActionState): string {
  switch (state.reason) {
    case "own_post":
      return key === "shake" ? "내 상상끼리는 섞을 수 없어요. 다른 Dreamer 의 상상에서 눌러 보세요." : "내 상상에는 누를 수 없어요.";
    case "shake_disabled":
      return "작성자가 Shake it 을 막아 둔 상상이에요.";
    case "daily_limit":
      return key === "shake" ? "오늘 Shake 횟수를 다 썼어요. 내일 다시 섞어 봐요." : "오늘 쓸 수 있는 횟수를 다 썼어요.";
    case "not_material":
      return "댓글은 Shake it 재료로 쓸 수 없어요.";
    case "not_allowed":
      return "지금은 이 기능을 쓸 수 없어요.";
    default:
      return "로그인이 필요해요.";
  }
}

/** 글 주소. 댓글은 원글 상세의 그 댓글 위치(#c123)로 간다 */
export function itemPath(item: Pick<Imagination, "id" | "kind" | "root_id">): string {
  return item.kind === "comment" && item.root_id ? `/i/${item.root_id}#c${item.id}` : `/i/${item.id}`;
}

/** "오후 2:10 · 2026년 11월 10일" — 상세 시간 줄 (X 구조) */
export function fullDateTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const ampm = h < 12 ? "오전" : "오후";
  const hh = h % 12 === 0 ? 12 : h % 12;
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${ampm} ${hh}:${mm} · ${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** "11월 9일" / "3시간 전" 형식 날짜 */
export function dateLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return "방금";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}
