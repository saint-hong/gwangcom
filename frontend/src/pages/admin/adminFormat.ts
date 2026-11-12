import type { ChangeLog, PolicyKey, PolicyValue } from "../../types/api";

/** 2026.11.12 13:49 — 운영자 표에서 한 줄로 */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const ROLE_LABEL: Record<string, string> = { user: "Dreamer", admin: "운영자" };

/** 값 표시: 숫자 + 단위, 켜기 · 끄기 */
export function showValue(spec: PolicyKey | undefined, v: PolicyValue | string | null | undefined): string {
  if (v === null || v === undefined) return "기본값 따름";
  if (typeof v === "boolean") return v ? "켜짐" : "꺼짐";
  if (typeof v === "string") return ROLE_LABEL[v] ?? v; // 등급 이름 · 역할
  return `${v}${spec?.unit ?? ""}`;
}

/** 변경 기록의 대상: 전체 · 등급 이름 · 사용자 닉네임 */
export function logTarget(log: ChangeLog): string {
  if (log.target_scope === "global") return "전체 기본값";
  if (log.target_scope === "tier") return `등급 · ${log.tier ?? "(지운 등급)"}`;
  return log.user ?? "(지운 사용자)";
}
