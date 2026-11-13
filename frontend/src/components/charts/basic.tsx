import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import styles from "./Charts.module.css";
import { TipRow, Tooltip, fmt, localPoint, seqColor, useWidth, type Tip } from "./core";

/** 작은 흐름선 (KPI 칸 · 표 안) — 글자가 값을 말하고, 선은 모양만 (aria-hidden) */
export function Sparkline({ values, color = "var(--viz-1)", width = 96, height = 28 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return <span style={{ display: "inline-block", width, height }} aria-hidden="true" />;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (width - 4) + 2, height - 3 - (v / max) * (height - 6)]);
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} aria-hidden="true" className={styles.spark}>
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill={color} />
    </svg>
  );
}

/** 바뀐 비율 (↑ 초록 · ↓ 빨강 · 같으면 회색). 이전이 0 이면 "새로" */
export function Delta({ cur, prev }: { cur: number; prev: number | null | undefined }) {
  if (prev === null || prev === undefined) return null;
  if (prev === 0) return cur > 0 ? <span className={styles.deltaNew}>새로</span> : <span className={styles.deltaFlat}>—</span>;
  const r = (cur - prev) / prev;
  if (Math.abs(r) < 0.005) return <span className={styles.deltaFlat}>0%</span>;
  return (
    <span className={r > 0 ? styles.deltaUp : styles.deltaDown}>
      {r > 0 ? "▲" : "▼"} {fmt(Math.abs(r) * 100)}%
    </span>
  );
}

export type BarItem = { key: string; label: ReactNode; value: number; color?: string; note?: ReactNode; href?: string; tip?: ReactNode };

/** 가로 막대 목록 (순위) — 이름 | 막대 | 값 (· 덧붙임) */
export function Bars({
  items,
  max,
  color = "var(--viz-1)",
  format = (n: number) => fmt(n),
  labelWidth = 120,
}: {
  items: BarItem[];
  max?: number;
  color?: string;
  format?: (n: number) => string;
  labelWidth?: number;
}) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <div className={styles.barsScroll}>
      <ol className={styles.bars} style={{ ["--label-w" as string]: `${labelWidth}px` }}>
        {items.map((it) => (
          <li key={it.key} className={styles.barRow}>
            {it.href ? (
              <Link to={it.href} className={styles.barLabel} title={typeof it.tip === "string" ? it.tip : typeof it.label === "string" ? it.label : undefined}>
                {it.label}
              </Link>
            ) : (
              <span className={styles.barLabel} title={typeof it.tip === "string" ? it.tip : typeof it.label === "string" ? it.label : undefined}>
                {it.label}
              </span>
            )}
            <span className={styles.barTrack}>
              <span className={styles.barFill} style={{ width: `${Math.max(it.value > 0 ? 2 : 0, (it.value / top) * 100)}%`, background: it.color ?? color }} />
            </span>
            <span className={styles.barValue}>{format(it.value)}</span>
            <span className={styles.barNote}>{it.note}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * 히트맵 (행 × 열, 파랑 한 색 단계) — 칸에 올리면 툴팁, 값이 있으면 칸 안에 숫자
 *   표처럼 읽히게 행 이름은 왼쪽, 열 이름은 위
 */
export function Heatmap({
  rows,
  cols,
  values,
  tip,
  colLabel = (c: string) => c,
  showNumbers = true,
  cell = 28,
  rowWidth = 120,
  rotateCols = false,
  autoLabels = false,
  maxHeight,
}: {
  rows: string[];
  cols: string[];
  values: number[][];
  tip?: (r: number, c: number) => ReactNode;
  colLabel?: (c: string, i: number) => ReactNode;
  showNumbers?: boolean;
  cell?: number;
  rowWidth?: number;
  rotateCols?: boolean;
  /** 날짜처럼 열이 많을 때: 칸 폭에 맞춰 몇 칸마다 이름을 둘지 · 글자 크기를 정한다 (이름은 그 칸들을 합친 폭 안에만) */
  autoLabels?: boolean;
  /** 이보다 길면 상하 스크롤 (기본 600px) */
  maxHeight?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [t, setT] = useState<Tip>(null);
  const max = Math.max(0, ...values.flat());
  // 칸 하나의 실제 폭 (gap 2px) → 이름 간격 · 글자 크기 (좁아지면 글자도 8px 까지 작아짐)
  const cw = Math.max(cell, (width - rowWidth - 2 * cols.length) / Math.max(1, cols.length));
  const every = autoLabels ? Math.max(1, Math.ceil(26 / cw)) : 1; // 8px 글자로 "10.15" ≈ 25px
  const fs = Math.max(8, Math.min(11, (cw * every) / 3.1));
  return (
    <div ref={ref} className={styles.heatWrap} style={maxHeight ? { maxHeight } : undefined} onMouseLeave={() => setT(null)}>
      <div className={styles.heat} style={{ gridTemplateColumns: `${rowWidth}px repeat(${cols.length}, minmax(${cell}px, 1fr))`, paddingRight: rotateCols ? ROT_PAD : undefined }} role="table">
        <span />
        {autoLabels
          ? cols.map((c, i) =>
              i % every === 0 ? (
                <span key={c + i} className={styles.heatColSpan} style={{ gridColumn: `span ${Math.min(every, cols.length - i)}`, fontSize: fs }} title={c}>
                  {colLabel(c, i)}
                </span>
              ) : null,
            )
          : cols.map((c, i) => (
              <span key={c + i} className={rotateCols ? styles.heatColRot : styles.heatCol} title={c}>
                {rotateCols ? <span className={styles.heatColRotText}>{colLabel(c, i)}</span> : colLabel(c, i)}
              </span>
            ))}
        {rows.map((r, ri) => (
          <div key={r} className={styles.heatRowWrap} role="row">
            <span className={styles.heatRow} title={r}>
              {r}
            </span>
            {cols.map((c, ci) => {
              const v = values[ri]?.[ci] ?? 0;
              const step = max > 0 ? Math.ceil((v / max) * 6) : 0;
              return (
                <span
                  key={c + ci}
                  className={styles.heatCell}
                  style={{ background: seqColor(v, max), color: step >= 4 ? "#fff" : "var(--color-text)", height: cell }}
                  onMouseMove={(e) => tip && setT({ ...localPoint(e, ref.current), content: tip(ri, ci) })}
                  role="cell"
                  aria-label={`${r} · ${c}: ${v}`}
                >
                  {showNumbers && v > 0 ? v : ""}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <Tooltip tip={t} width={width} />
    </div>
  );
}

/** 사선 열 이름(-40°)이 마지막 열에서 오른쪽으로 넘치는 만큼 비워 둔다 (글자 폭 최대 110px × cos 40° ≈ 84px, 칸 반만큼 덜) */
const ROT_PAD = 72;

const DAYS = ["월", "화", "수", "목", "금", "토", "일"];

/** 요일 × 시간 (한국 시간) — 원 크기 = 개수. 언제 상상하고 반응하는지 */
export function PunchCard({ values, color, label }: { values: number[][]; color: string; label: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [t, setT] = useState<Tip>(null);
  const max = Math.max(1, ...values.flat());
  const left = 24;
  const cw = Math.max(10, (width - left) / 24);
  const rh = 22;
  const height = rh * 7 + 18;
  return (
    <div ref={ref} className={styles.plot} style={{ height }} onMouseLeave={() => setT(null)}>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label={`${label} 요일 · 시간 분포`}>
          {DAYS.map((d, di) => (
            <g key={d}>
              <text x={0} y={di * rh + rh / 2 + 4} className={styles.axisLeft}>
                {d}
              </text>
              <line x1={left} x2={width} y1={di * rh + rh / 2} y2={di * rh + rh / 2} className={styles.grid} />
              {values[di].map((v, h) =>
                v > 0 ? (
                  <circle
                    key={h}
                    cx={left + cw * h + cw / 2}
                    cy={di * rh + rh / 2}
                    r={Math.max(2, Math.sqrt(v / max) * Math.min(cw, rh) * 0.48)}
                    fill={color}
                    opacity={0.85}
                    onMouseMove={(e) =>
                      setT({
                        ...localPoint(e, ref.current),
                        content: <TipRow label={`${d}요일 ${h}시`} value={`${v}건`} />,
                      })
                    }
                  />
                ) : null,
              )}
            </g>
          ))}
          {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
            <text key={h} x={left + cw * h + cw / 2} y={height - 4} className={styles.axisX}>
              {h}시
            </text>
          ))}
        </svg>
      ) : null}
      <Tooltip tip={t} width={width} />
    </div>
  );
}

/** 세로 막대 (분포) — 구간 이름 | 개수 */
export function Columns({ items, color = "var(--viz-1)", height = 160, unit = "" }: { items: [string, number][]; color?: string; height?: number; unit?: string }) {
  const max = Math.max(1, ...items.map(([, v]) => v));
  return (
    <div className={styles.columns} style={{ height }}>
      {items.map(([label, v]) => (
        <div key={label} className={styles.col} title={`${label}: ${v}${unit}`}>
          <span className={styles.colValue}>{v}</span>
          <span className={styles.colBar} style={{ height: `${(v / max) * 100}%`, background: color }} />
          <span className={styles.colLabel}>{label}</span>
        </div>
      ))}
    </div>
  );
}
