import { Minus, Plus, RotateCcw } from "lucide-react";
import { useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import styles from "./Charts.module.css";
import { Legend, TipRow, Tooltip, fmt, localPoint, niceTicks, useWidth, type Tip } from "./core";

/* ------------------------------------------------------------------ 산점도 (사분면) */

export type Point = {
  id: string;
  label: string;
  x: number;
  y: number;
  r: number;
  color: string;
  tip: ReactNode;
};

/**
 * 사분면 산점도 — 가로 = 얼마나 많이 상상되나, 세로 = 얼마나 원하나(Thunder 평균), 원 크기 = Dreamer 수
 *   가운데 점선 = 중앙값. 네 칸 이름은 읽는 방법일 뿐 판단이 아니다 (운영자가 해석)
 */
export function Scatter({
  points,
  xLabel,
  yLabel,
  quadrants,
  height = 320,
  labelTop = 10,
}: {
  points: Point[];
  xLabel: string;
  yLabel: string;
  quadrants?: [string, string, string, string]; // 왼위 · 오위 · 왼아래 · 오아래
  height?: number;
  labelTop?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [t, setT] = useState<Tip>(null);
  const [hover, setHover] = useState<string | null>(null);
  // 축 이름은 그림 밖(위 · 아래 여백), 네 칸 이름은 그림 안 위 · 아래 띠에 둔다.
  // 점은 띠 안쪽에만 찍어서 (가장 큰 원 반지름만큼 더 비움) 축 이름 · 칸 이름과 겹치지 않게 한다.
  const M = { top: 26, right: 16, bottom: 36, left: 44 };
  const w = Math.max(0, width - M.left - M.right);
  const h = height - M.top - M.bottom;
  const maxR = Math.max(0, ...points.map((p) => p.r));
  const padY = quadrants ? maxR + 18 : maxR + 2;
  const padX = maxR + 2;
  const xt = niceTicks(Math.max(1, ...points.map((p) => p.x)));
  const yt = niceTicks(Math.max(1, ...points.map((p) => p.y)));
  const X = (v: number) => M.left + padX + (v / xt[xt.length - 1]) * Math.max(0, w - 2 * padX);
  const Y = (v: number) => M.top + h - padY - (v / yt[yt.length - 1]) * Math.max(0, h - 2 * padY);
  const med = (a: number[]) => {
    const s = [...a].sort((p, q) => p - q);
    return s.length ? s[Math.floor(s.length / 2)] : 0;
  };
  const mx = med(points.map((p) => p.x));
  const my = med(points.map((p) => p.y));
  const labelled = new Set(
    [...points]
      .sort((a, b) => b.x / (xt.at(-1) || 1) + b.y / (yt.at(-1) || 1) - (a.x / (xt.at(-1) || 1) + a.y / (yt.at(-1) || 1)))
      .slice(0, labelTop)
      .map((p) => p.id),
  );
  const draw = [...points].sort((a, b) => b.r - a.r); // 큰 원 먼저 (작은 원이 위로)

  return (
    <div ref={ref} className={styles.plot} style={{ height }} onMouseLeave={() => (setT(null), setHover(null))}>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label={`${xLabel} · ${yLabel} 산점도`}>
          {yt.map((v) => (
            <g key={`y${v}`}>
              <line x1={M.left} x2={M.left + w} y1={Y(v)} y2={Y(v)} className={styles.grid} />
              <text x={M.left - 6} y={Y(v)} className={styles.axisY}>
                {fmt(v, 1)}
              </text>
            </g>
          ))}
          {xt.map((v) => (
            <text key={`x${v}`} x={X(v)} y={M.top + h + 16} className={styles.axisX}>
              {fmt(v)}
            </text>
          ))}
          <text x={M.left + w} y={height - 4} className={styles.axisTitleX}>
            {xLabel} →
          </text>
          <text x={M.left - 6} y={M.top - 12} className={styles.axisTitleY}>
            ↑ {yLabel}
          </text>
          <line x1={X(mx)} x2={X(mx)} y1={M.top} y2={M.top + h} className={styles.medianLine} />
          <line x1={M.left} x2={M.left + w} y1={Y(my)} y2={Y(my)} className={styles.medianLine} />
          {quadrants ? (
            <>
              <text x={M.left + 6} y={M.top + 13} className={styles.quadLabel}>
                {quadrants[0]}
              </text>
              <text x={M.left + w - 6} y={M.top + 13} className={styles.quadLabel} textAnchor="end">
                {quadrants[1]}
              </text>
              <text x={M.left + 6} y={M.top + h - 6} className={styles.quadLabel}>
                {quadrants[2]}
              </text>
              <text x={M.left + w - 6} y={M.top + h - 6} className={styles.quadLabel} textAnchor="end">
                {quadrants[3]}
              </text>
            </>
          ) : null}
          {draw.map((p) => (
            <circle
              key={p.id}
              cx={X(p.x)}
              cy={Y(p.y)}
              r={p.r}
              fill={p.color}
              className={styles.point}
              opacity={hover && hover !== p.id ? 0.3 : 0.78}
              onMouseMove={(e) => {
                setHover(p.id);
                setT({ ...localPoint(e, ref.current), content: p.tip });
              }}
            />
          ))}
          {points
            .filter((p) => labelled.has(p.id) || hover === p.id)
            .map((p) => (
              <text
                key={`l${p.id}`}
                x={X(p.x) > M.left + w * 0.8 ? X(p.x) - p.r - 3 : X(p.x) + p.r + 3}
                y={Y(p.y) + 4}
                textAnchor={X(p.x) > M.left + w * 0.8 ? "end" : "start"}
                className={styles.pointLabel}
              >
                {p.label}
              </text>
            ))}
        </svg>
      ) : null}
      <Tooltip tip={t} width={width} />
    </div>
  );
}

/* ------------------------------------------------------------------ 네트워크 (군집 그래프) */

const ZOOM_STEP = 1.25;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;

export type NetNode = {
  id: string;
  label: string;
  type: "tech" | "desire";
  count: number;
  thunders: number;
};
export type NetEdge = { source: string; target: string; weight: number };

type Pos = { x: number; y: number; vx: number; vy: number };

/** 힘 배치 (같은 상상에 함께 나온 태그끼리 끌어당김, 모두 서로 밀어냄) — 결과가 늘 같도록 시작 위치는 고정 */
function layout(nodes: NetNode[], edges: NetEdge[], w: number, h: number): Map<string, Pos> {
  const pos = new Map<string, Pos>();
  nodes.forEach((n, i) => {
    const a = (i / Math.max(1, nodes.length)) * Math.PI * 2 * 3.1;
    const r = 0.15 + (0.3 * ((i * 7) % 11)) / 11;
    pos.set(n.id, {
      x: w / 2 + Math.cos(a) * w * r,
      y: h / 2 + Math.sin(a) * h * r,
      vx: 0,
      vy: 0,
    });
  });
  const list = nodes.map((n) => pos.get(n.id)!);
  const k = Math.sqrt((w * h) / Math.max(1, nodes.length)) * 0.55;
  for (let it = 0; it < 320; it++) {
    const cool = 1 - it / 320;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) {
          dx = 0.1;
          dy = 0.1;
          d2 = 0.02;
        }
        const f = (k * k) / d2;
        a.vx += dx * f * 0.02;
        a.vy += dy * f * 0.02;
        b.vx -= dx * f * 0.02;
        b.vy -= dy * f * 0.02;
      }
    }
    for (const e of edges) {
      const a = pos.get(e.source);
      const b = pos.get(e.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = ((d - k * 0.6) / d) * 0.04 * Math.min(3, e.weight);
      a.vx += dx * f;
      a.vy += dy * f;
      b.vx -= dx * f;
      b.vy -= dy * f;
    }
    for (const p of list) {
      p.vx += (w / 2 - p.x) * 0.006;
      p.vy += (h / 2 - p.y) * 0.006;
      const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1;
      const lim = Math.min(sp, 12 * cool + 0.5);
      p.x += (p.vx / sp) * lim;
      p.y += (p.vy / sp) * lim;
      p.vx *= 0.5;
      p.vy *= 0.5;
      p.x = Math.min(w - 24, Math.max(24, p.x));
      p.y = Math.min(h - 16, Math.max(16, p.y));
    }
  }
  return pos;
}

const NODE_COLOR = { tech: "var(--viz-tech)", desire: "var(--viz-desire)" };

/**
 * 기술 · 욕망 네트워크 — 원 = 태그(크기 = 상상 수), 선 = 같은 상상에 함께 나옴(굵기 = 횟수)
 *   원에 올리면 이어진 태그만 진하게 · 나머지는 흐리게 (어떤 욕망이 어떤 기술과 만나는지)
 */
export function Network({ nodes, edges, height = 460 }: { nodes: NetNode[]; edges: NetEdge[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [t, setT] = useState<Tip>(null);
  const [hover, setHover] = useState<string | null>(null);
  const pos = useMemo(() => (width > 0 ? layout(nodes, edges, width, height) : new Map<string, Pos>()), [nodes, edges, width, height]);
  const maxCount = Math.max(1, ...nodes.map((n) => n.count));
  const radius = (c: number) => 4 + Math.sqrt(c / maxCount) * 16;
  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!m.has(e.source)) m.set(e.source, new Set());
      if (!m.has(e.target)) m.set(e.target, new Set());
      m.get(e.source)!.add(e.target);
      m.get(e.target)!.add(e.source);
    }
    return m;
  }, [edges]);
  const near = hover ? (neighbors.get(hover) ?? new Set<string>()) : null;
  const maxW = Math.max(1, ...edges.map((e) => e.weight));
  const labelMin = [...nodes].sort((a, b) => b.count - a.count)[Math.min(nodes.length - 1, 14)]?.count ?? 0;

  // 확대 · 축소 (+ · − · 처음 크기) — 가운데를 기준으로. 확대한 뒤에는 빈 곳을 끌어서 옮긴다
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const zoom = (f: number) =>
    setView((v) => {
      const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.k * f));
      const r = k / v.k;
      const cx = width / 2;
      const cy = height / 2;
      return { k, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r };
    });
  const reset = () => setView({ k: 1, x: 0, y: 0 });
  const onDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (e.target !== e.currentTarget) return; // 원 위에서는 끌지 않음 (툴팁)
    drag.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (d)
      setView((v) => ({
        ...v,
        x: d.x + e.clientX - d.px,
        y: d.y + e.clientY - d.py,
      }));
  };
  const onUp = () => {
    drag.current = null;
  };
  const changed = view.k !== 1 || view.x !== 0 || view.y !== 0;

  return (
    <div className={styles.chartBox}>
      <Legend
        items={[
          { label: "기술", color: NODE_COLOR.tech },
          { label: "욕망", color: NODE_COLOR.desire },
        ]}
      />
      <div ref={ref} className={styles.plot} style={{ height }} onMouseLeave={() => (setT(null), setHover(null))}>
        {width > 0 ? (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label="기술 · 욕망 태그 네트워크"
            className={styles.netSvg}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
              {edges.map((e) => {
                const a = pos.get(e.source);
                const b = pos.get(e.target);
                if (!a || !b) return null;
                const on = hover ? e.source === hover || e.target === hover : false;
                return (
                  <line
                    key={`${e.source}|${e.target}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    className={styles.edge}
                    strokeWidth={1 + (e.weight / maxW) * 3}
                    opacity={hover ? (on ? 0.9 : 0.06) : 0.35}
                  />
                );
              })}
              {nodes.map((n) => {
                const p = pos.get(n.id);
                if (!p) return null;
                const dim = hover && hover !== n.id && !near?.has(n.id);
                const show = n.count >= labelMin || hover === n.id || near?.has(n.id);
                return (
                  <g
                    key={n.id}
                    opacity={dim ? 0.18 : 1}
                    onMouseMove={(e) => {
                      setHover(n.id);
                      setT({
                        ...localPoint(e, ref.current),
                        content: (
                          <>
                            <span className={styles.tipTitle}>
                              {n.type === "tech" ? "#" : ""}
                              {n.label}
                            </span>
                            <TipRow color={NODE_COLOR[n.type]} label={n.type === "tech" ? "기술" : "욕망"} value={`상상 ${n.count}개`} />
                            <TipRow label="Thunder" value={n.thunders} />
                            <TipRow label="함께 나온 태그" value={`${neighbors.get(n.id)?.size ?? 0}개`} />
                          </>
                        ),
                      });
                    }}
                  >
                    <circle cx={p.x} cy={p.y} r={radius(n.count)} fill={NODE_COLOR[n.type]} className={styles.node} />
                    {show ? (
                      <text x={p.x} y={p.y - radius(n.count) - 4} className={styles.nodeLabel}>
                        {n.label}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </g>
          </svg>
        ) : null}
        <div className={styles.zoomBar} role="group" aria-label="네트워크 확대 · 축소">
          <button type="button" onClick={() => zoom(ZOOM_STEP)} disabled={view.k >= ZOOM_MAX} aria-label="확대" title="확대">
            <Plus />
          </button>
          <button type="button" onClick={() => zoom(1 / ZOOM_STEP)} disabled={view.k <= ZOOM_MIN} aria-label="축소" title="축소">
            <Minus />
          </button>
          <button type="button" onClick={reset} disabled={!changed} aria-label="처음 크기로" title="처음 크기로">
            <RotateCcw />
          </button>
        </div>
        <Tooltip tip={t} width={width} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ 생키 (분야 → 기술 → 욕망) */

export type SankeyNode = {
  id: string;
  label: string;
  column: number;
  value: number;
};
export type SankeyLink = { source: string; target: string; value: number };

/**
 * 생키 — 왼쪽 분야 · 가운데 기술 · 오른쪽 욕망. 띠 굵기 = 같은 상상에 함께 나온 수
 *   띠 · 상자에 올리면 그 흐름만 진하게. 상상의 형태(분야) → 수단(기술) → 이유(욕망)가 어떻게 이어지는지
 */
export function Sankey({ nodes, links, colorOf, height = 420 }: { nodes: SankeyNode[]; links: SankeyLink[]; colorOf: (n: SankeyNode) => string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [t, setT] = useState<Tip>(null);
  const [hover, setHover] = useState<string | null>(null);
  const NW = 12; // 상자 폭
  const PAD = 8; // 상자 사이
  const labelSpace = 110;
  const layoutData = useMemo(() => {
    const cols = [0, 1, 2].map((c) => nodes.filter((n) => n.column === c));
    const inSum = new Map<string, number>();
    const outSum = new Map<string, number>();
    for (const l of links) {
      outSum.set(l.source, (outSum.get(l.source) ?? 0) + l.value);
      inSum.set(l.target, (inSum.get(l.target) ?? 0) + l.value);
    }
    const size = (n: SankeyNode) => Math.max(inSum.get(n.id) ?? 0, outSum.get(n.id) ?? 0, 1);
    const k = Math.min(...cols.filter((c) => c.length).map((c) => (height - 20 - PAD * (c.length - 1)) / c.reduce((s, n) => s + size(n), 0)));
    const inner = Math.max(0, width - labelSpace * 2 - NW);
    const xOf = (c: number) => labelSpace + (inner / 2) * c;
    const box = new Map<string, { x: number; y: number; h: number; n: SankeyNode }>();
    cols.forEach((col, c) => {
      const total = col.reduce((s, n) => s + size(n) * k, 0) + PAD * (col.length - 1);
      let y = 10 + (height - 20 - total) / 2;
      for (const n of col) {
        const hh = size(n) * k;
        box.set(n.id, { x: xOf(c), y, h: hh, n });
        y += hh + PAD;
      }
    });
    // 띠: 출발 · 도착 상자 안에서 위에서부터 차례로 쌓는다 (상대 상자 위치 순)
    const outOff = new Map<string, number>();
    const inOff = new Map<string, number>();
    const sorted = [...links].sort((a, b) => (box.get(a.target)?.y ?? 0) - (box.get(b.target)?.y ?? 0));
    const bands = sorted.flatMap((l) => {
      const s = box.get(l.source);
      const d = box.get(l.target);
      if (!s || !d) return [];
      const th = l.value * k;
      const sy = s.y + (outOff.get(l.source) ?? 0);
      outOff.set(l.source, (outOff.get(l.source) ?? 0) + th);
      return [{ l, s, d, th, sy }];
    });
    bands.sort((a, b) => a.s.y - b.s.y);
    const out = bands.map((b) => {
      const dy = b.d.y + (inOff.get(b.l.target) ?? 0);
      inOff.set(b.l.target, (inOff.get(b.l.target) ?? 0) + b.th);
      return { ...b, dy };
    });
    return { box, bands: out };
  }, [nodes, links, width, height]);

  const active = (l: SankeyLink) => !hover || l.source === hover || l.target === hover || `${l.source}>${l.target}` === hover;

  return (
    <div ref={ref} className={styles.plot} style={{ height }} onMouseLeave={() => (setT(null), setHover(null))}>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label="분야 · 기술 · 욕망 흐름">
          {layoutData.bands.map(({ l, s, d, th, sy, dy }) => {
            const x0 = s.x + NW;
            const x1 = d.x;
            const xm = (x0 + x1) / 2;
            const on = active(l);
            return (
              <path
                key={`${l.source}>${l.target}`}
                d={`M${x0},${sy}C${xm},${sy} ${xm},${dy} ${x1},${dy}L${x1},${dy + th}C${xm},${dy + th} ${xm},${sy + th} ${x0},${sy + th}Z`}
                fill={colorOf(s.n)}
                opacity={on ? (hover ? 0.6 : 0.32) : 0.06}
                onMouseMove={(e) => {
                  setHover(`${l.source}>${l.target}`);
                  setT({
                    ...localPoint(e, ref.current),
                    content: <TipRow label={`${s.n.label} → ${d.n.label}`} value={`${l.value}개`} />,
                  });
                }}
              />
            );
          })}
          {[...layoutData.box.values()].map(({ x, y, h, n }) => (
            <g
              key={n.id}
              onMouseMove={(e) => {
                setHover(n.id);
                setT({
                  ...localPoint(e, ref.current),
                  content: <TipRow color={colorOf(n)} label={n.label} value={`상상 ${n.value}개`} />,
                });
              }}
            >
              <rect x={x} y={y} width={NW} height={Math.max(2, h)} rx={3} fill={colorOf(n)} />
              <text
                x={n.column === 2 ? x + NW + 6 : x - 6}
                y={y + h / 2 + 4}
                className={styles.sankeyLabel}
                textAnchor={n.column === 2 ? "start" : "end"}
                opacity={hover && hover !== n.id && !links.some((l) => (l.source === hover || l.target === hover) && (l.source === n.id || l.target === n.id)) ? 0.4 : 1}
              >
                {n.label}
              </text>
            </g>
          ))}
        </svg>
      ) : null}
      <Tooltip tip={t} width={width} />
    </div>
  );
}
