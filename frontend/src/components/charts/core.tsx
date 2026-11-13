import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import styles from "./Charts.module.css";

/**
 * 차트 공통 (6-D 대시보드, 2026-11-13) — 라이브러리 없이 SVG · CSS 로 그린다.
 *   규칙 (dataviz): 얇은 선 2px · 막대 끝 4px 둥글게 · 칸 사이 2px 틈 · 격자 · 축은 흐리게
 *   마우스를 올리면 툴팁, 2개 이상 계열은 범례, 숫자 글자는 글자 색(계열 색 아님)
 */

/** 감싼 요소의 폭 (창 크기가 바뀌면 다시 그린다) */
export function useWidth<T extends HTMLElement>(): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** 0 부터 보기 좋은 눈금 (최대 4~5칸) */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(Number(v.toFixed(6)));
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

export const fmt = (n: number, digits = 0) =>
  n.toLocaleString("ko-KR", { maximumFractionDigits: digits, minimumFractionDigits: 0 });

/** "2026-11-03" → "11.03" */
export const shortDay = (d: string) => `${d.slice(5, 7)}.${d.slice(8, 10)}`;

/** 분야 8개 고정 색 (기획: 분야 순서 = 색 순서, 필터로 바뀌어도 다시 칠하지 않는다) */
export const DOMAIN_COLORS: Record<string, string> = {
  ai: "var(--viz-1)",
  semiconductor: "var(--viz-2)",
  space: "var(--viz-3)",
  mobility: "var(--viz-4)",
  bio: "var(--viz-5)",
  energy: "var(--viz-6)",
  mobile: "var(--viz-7)",
  life: "var(--viz-8)",
};

/** 순서 크기 → 파랑 한 색 7단계 (0 은 바탕에 가까운 회색) */
export function seqColor(v: number, max: number): string {
  if (v <= 0 || max <= 0) return "var(--viz-seq-0)";
  const step = Math.min(6, Math.max(1, Math.ceil((v / max) * 6)));
  return `var(--viz-seq-${step})`;
}

export type Tip = { x: number; y: number; content: ReactNode } | null;

/** 감싼 상자 안에 뜨는 툴팁 (마우스 오른쪽 위, 넘치면 왼쪽으로) */
export function Tooltip({ tip, width }: { tip: Tip; width: number }) {
  if (!tip) return null;
  const left = tip.x > width - 200 ? undefined : tip.x + 12;
  const right = tip.x > width - 200 ? width - tip.x + 12 : undefined;
  return (
    <div className={styles.tip} style={{ left, right, top: Math.max(0, tip.y - 8) }} role="tooltip">
      {tip.content}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; shape?: "dot" | "line" }[] }) {
  return (
    <ul className={styles.legend} aria-label="범례">
      {items.map((it) => (
        <li key={it.label}>
          <span className={it.shape === "line" ? styles.swatchLine : styles.swatch} style={{ background: it.color }} aria-hidden="true" />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

export function TipRow({ color, label, value }: { color?: string; label: string; value: ReactNode }) {
  return (
    <span className={styles.tipRow}>
      {color ? <span className={styles.swatch} style={{ background: color }} aria-hidden="true" /> : null}
      <span className={styles.tipLabel}>{label}</span>
      <b>{value}</b>
    </span>
  );
}

/** 마우스 위치 → 감싼 상자 기준 좌표 */
export function localPoint(e: { clientX: number; clientY: number }, el: Element | null): { x: number; y: number } {
  const r = el?.getBoundingClientRect();
  return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : { x: 0, y: 0 };
}
