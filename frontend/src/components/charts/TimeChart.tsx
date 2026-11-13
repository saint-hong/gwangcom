import { useState } from "react";
import styles from "./Charts.module.css";
import { Legend, TipRow, Tooltip, fmt, localPoint, niceTicks, shortDay, useWidth, type Tip } from "./core";

export type Series = { key: string; label: string; color: string; values: number[] };
export type ChartEvent = { date: string; label: string };

const M = { top: 14, right: 12, bottom: 26, left: 38 };

/**
 * 시계열 (선 · 쌓은 면적 · 쌓은 막대) — x = 시간 칸(하루 · 주), y = 개수
 *   마우스를 올리면 세로 기준선 + 그 칸의 값 목록(툴팁), 사건(질문 시작)은 점선 + ▼ 표시
 */
export function TimeChart({
  buckets,
  unit,
  series,
  mode = "line",
  height = 220,
  events = [],
  format = (n: number) => fmt(n),
  legend = true,
}: {
  buckets: string[];
  unit: "day" | "week";
  series: Series[];
  mode?: "line" | "stack" | "bar";
  height?: number;
  events?: ChartEvent[];
  format?: (n: number) => string;
  legend?: boolean;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [tip, setTip] = useState<Tip>(null);
  const n = buckets.length;
  const w = Math.max(0, width - M.left - M.right);
  const h = height - M.top - M.bottom;
  const stacked = mode !== "line";
  const totals = buckets.map((_, i) => series.reduce((s, se) => s + (se.values[i] ?? 0), 0));
  const max = stacked ? Math.max(0, ...totals) : Math.max(0, ...series.flatMap((s) => s.values));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const band = n > 0 ? w / n : w;
  const x = (i: number) => M.left + band * i + band / 2;
  const y = (v: number) => M.top + h - (v / top) * h;
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 64))));
  const eventIdx = new Map<number, string[]>();
  for (const e of events) {
    const i = buckets.findIndex((b, k) => b <= e.date && (k === n - 1 || buckets[k + 1] > e.date));
    if (i >= 0) eventIdx.set(i, [...(eventIdx.get(i) ?? []), e.label]);
  }

  // 쌓은 값 (아래 → 위)
  const base = buckets.map(() => 0);
  const layers = series.map((s) => {
    const lo = [...base];
    const hi = base.map((b, i) => b + (s.values[i] ?? 0));
    hi.forEach((v, i) => (base[i] = v));
    return { s, lo, hi };
  });

  const onMove = (e: React.MouseEvent) => {
    const p = localPoint(e, ref.current);
    const i = Math.min(n - 1, Math.max(0, Math.floor((p.x - M.left) / band)));
    if (p.x < M.left - 4 || p.x > M.left + w + 4 || n === 0) {
      setHover(null);
      setTip(null);
      return;
    }
    setHover(i);
    const rows = [...series].reverse();
    setTip({
      x: x(i),
      y: p.y,
      content: (
        <>
          <span className={styles.tipTitle}>
            {unit === "week" ? `${shortDay(buckets[i])} 주` : shortDay(buckets[i])}
          </span>
          {rows.map((s) => (
            <TipRow key={s.key} color={s.color} label={s.label} value={format(s.values[i] ?? 0)} />
          ))}
          {stacked && series.length > 1 ? <TipRow label="합계" value={format(totals[i])} /> : null}
          {(eventIdx.get(i) ?? []).map((l) => (
            <span key={l} className={styles.tipEvent}>
              ▼ {l}
            </span>
          ))}
        </>
      ),
    });
  };

  return (
    <div className={styles.chartBox}>
      {legend && series.length > 1 ? <Legend items={series.map((s) => ({ label: s.label, color: s.color, shape: mode === "line" ? "line" : "dot" }))} /> : null}
      <div ref={ref} className={styles.plot} style={{ height }} onMouseMove={onMove} onMouseLeave={() => (setHover(null), setTip(null))}>
        {width > 0 ? (
          <svg width={width} height={height} role="img" aria-label={`${series.map((s) => s.label).join(" · ")} 시간 흐름`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={M.left + w} y1={y(t)} y2={y(t)} className={styles.grid} />
                <text x={M.left - 6} y={y(t)} className={styles.axisY}>
                  {format(t)}
                </text>
              </g>
            ))}
            {buckets.map((b, i) =>
              i % labelEvery === 0 ? (
                <text key={b} x={x(i)} y={height - 8} className={styles.axisX}>
                  {shortDay(b)}
                </text>
              ) : null,
            )}
            {[...eventIdx.keys()].map((i) => (
              <g key={`ev${i}`}>
                <line x1={x(i)} x2={x(i)} y1={M.top} y2={M.top + h} className={styles.eventLine} />
                <text x={x(i)} y={M.top - 3} className={styles.eventMark}>
                  ▼
                </text>
              </g>
            ))}
            {mode === "stack"
              ? layers.map(({ s, lo, hi }) => (
                  <path
                    key={s.key}
                    d={`M${hi.map((v, i) => `${x(i)},${y(v)}`).join("L")}L${lo
                      .map((v, i) => `${x(i)},${y(v)}`)
                      .reverse()
                      .join("L")}Z`}
                    fill={s.color}
                    className={styles.area}
                  />
                ))
              : null}
            {mode === "bar"
              ? layers.map(({ s, lo, hi }) =>
                  hi.map((v, i) =>
                    v > lo[i] ? (
                      <rect
                        key={`${s.key}${i}`}
                        x={x(i) - Math.min(18, band * 0.7) / 2}
                        width={Math.min(18, band * 0.7)}
                        y={y(v) + 1}
                        height={Math.max(1, y(lo[i]) - y(v) - 1)}
                        fill={s.color}
                        opacity={hover === null || hover === i ? 1 : 0.55}
                      />
                    ) : null,
                  ),
                )
              : null}
            {mode === "line"
              ? series.map((s) => (
                  <polyline key={s.key} points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" stroke={s.color} className={styles.line} />
                ))
              : null}
            {hover !== null ? (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + h} className={styles.crosshair} />
                {mode !== "bar"
                  ? (mode === "stack" ? layers.map((l) => ({ s: l.s, v: l.hi[hover] })) : series.map((s) => ({ s, v: s.values[hover] ?? 0 }))).map(({ s, v }) => (
                      <circle key={s.key} cx={x(hover)} cy={y(v)} r={4} fill={s.color} className={styles.dot} />
                    ))
                  : null}
              </g>
            ) : null}
          </svg>
        ) : null}
        <Tooltip tip={tip} width={width} />
      </div>
    </div>
  );
}
