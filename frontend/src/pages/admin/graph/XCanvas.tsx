import { Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import chart from "../../../components/charts/Charts.module.css";
import { Tooltip, fmt, localPoint, useWidth, type Tip } from "../../../components/charts/core";
import styles from "./Graph.module.css";

/** 점 — 자리(x, y)는 보기마다 계산한 "세계 좌표". 그림 칸에 맞춰 늘이고 줄인다 */
export type XNode = {
  id: string;
  x: number;
  y: number;
  r: number;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  dash?: boolean;
  opacity?: number;
  label?: string;
  /** 이름을 늘 보인다 (아니면 마우스를 올리거나 고른 점 · 확대했을 때만) */
  labelAlways?: boolean;
  labelBelow?: boolean;
  /** 점 옆 작은 글씨 (시너지 +4 등) */
  badge?: string;
  tip: ReactNode;
};
export type XEdge = {
  id: string;
  source: string;
  target: string;
  width: number;
  color: string;
  dash?: boolean;
  opacity?: number;
  /** 휘어진 선 (같은 줄의 점끼리) — 양수 · 음수로 휘는 방향 */
  bend?: number;
  arrow?: boolean;
  tip?: ReactNode;
};
/** 영역 (압력장) — 점들을 감싸는 다각형 */
/** activeColor = 마우스를 올리거나 골랐을 때 색 (없으면 color 그대로 진하게) */
export type XArea = { id: string; points: [number, number][]; color: string; activeColor?: string; label: string; tip?: ReactNode; strong?: boolean };

type Props = {
  nodes: XNode[];
  edges: XEdge[];
  areas?: XArea[];
  height: number;
  selected?: string | null;
  onNode?: (id: string) => void;
  onNodeDouble?: (id: string) => void;
  onEdge?: (id: string) => void;
  onArea?: (id: string) => void;
  /** 빈 곳을 누름 → 고른 것 풀기 (2026-11-20 사용자) */
  onBackground?: () => void;
  /** 확대했을 때 모든 점 이름을 보일지 (지도는 점이 많아 끔 — 마우스를 올린 점 · 고른 점만, 2026-11-20 사용자) */
  zoomLabels?: boolean;
  /** 이 점으로 확대해 가운데에 둔다 (시작점 찾기로 상상을 골랐을 때) */
  zoomTo?: string | null;
  ariaLabel: string;
  /** 가장자리 여백 — 숫자 하나 또는 [가로, 세로] */
  pad?: number | [number, number];
  /** 가로세로 비율을 지킨다 (지도). 아니면 칸에 꽉 차게 */
  keepRatio?: boolean;
};

const ZOOM_STEP = 1.3;
const ZOOM_MAX = 8;
const SHORT = 16;
const short = (s: string) => (s.length > SHORT ? `${s.slice(0, SHORT)}…` : s);

/**
 * 탐색기 그림 칸 (2026-11-20) — 대시보드 산점도와 같은 모양: 옅은 회색 그림 영역 · 반투명 원 · 툴팁 · [+ · − · 처음 크기로]
 *   점을 누르면 오른쪽 상세, 두 번 누르면 펼치기(보기마다), 선을 누르면 그 선의 상세, 영역을 누르면 영역 상세
 *   마우스를 올린 점 · 고른 점과 이어진 선만 진하게
 */
export function XCanvas({ nodes, edges, areas = [], height, selected, onNode, onNodeDouble, onEdge, onArea, onBackground, zoomTo, zoomLabels = true, ariaLabel, pad = 36, keepRatio }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [t, setT] = useState<Tip>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState({ k: 1, tx: 0, ty: 0 });
  const drag = useRef<{ px: number; py: number; tx: number; ty: number; moved: boolean } | null>(null);
  const dragged = useRef(false); // 끌어서 옮긴 직후의 클릭은 빈 곳 누름으로 치지 않는다

  const xs = [...nodes.map((n) => n.x), ...areas.flatMap((a) => a.points.map((p) => p[0]))];
  const ys = [...nodes.map((n) => n.y), ...areas.flatMap((a) => a.points.map((p) => p[1]))];
  const [x0, x1, y0, y1] = xs.length ? [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)] : [0, 1, 0, 1];
  const [px, py] = typeof pad === "number" ? [pad, pad] : pad;
  let sx = (width - 2 * px) / Math.max(x1 - x0, 1e-6);
  let sy = (height - 2 * py) / Math.max(y1 - y0, 1e-6);
  if (keepRatio || x1 - x0 < 1e-6 || y1 - y0 < 1e-6) sx = sy = Math.min(sx, sy);
  const cx = width / 2;
  const cy = height / 2;
  const S = (x: number, y: number) => ({
    x: cx + (x - (x0 + x1) / 2) * sx * view.k + view.tx,
    y: cy + (y - (y0 + y1) / 2) * sy * view.k + view.ty,
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // 강조 기준 점: 마우스를 올린 점 → 없으면 고른 점. 선 위에 올려도 고른 점 기준을 그대로 둔다
  // (2026-11-20 사용자: 점을 고른 뒤 선을 고르려 하면 모든 선이 켜져 보기 불편했음)
  const selNode = selected && byId.has(selected) ? selected : null;
  const hoverNode = hover && byId.has(hover) ? hover : null;
  const nodeFocus = hoverNode ?? selNode;
  const near = new Set<string>();
  if (nodeFocus) {
    near.add(nodeFocus);
    for (const e of edges) {
      if (e.source === nodeFocus) near.add(e.target);
      if (e.target === nodeFocus) near.add(e.source);
    }
  }
  const touches = (e: XEdge, id: string | null) => id !== null && (e.source === id || e.target === id);
  const zoomed = view.k > 1;
  // 찾은 상상으로 확대 (값이 바뀔 때 한 번)
  const zoomed_to = useRef<string | null>(null);
  useEffect(() => {
    if (!zoomTo || width <= 0 || zoomed_to.current === zoomTo) return;
    const n = byId.get(zoomTo);
    if (!n) return;
    zoomed_to.current = zoomTo;
    const k = 3;
    setView({ k, tx: -(n.x - (x0 + x1) / 2) * sx * k, ty: -(n.y - (y0 + y1) / 2) * sy * k });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomTo, width, nodes]);

  const zoom = (f: number) =>
    setView((v) => {
      const k = Math.min(ZOOM_MAX, Math.max(1, v.k * f));
      return k === 1 ? { k, tx: 0, ty: 0 } : { k, tx: (v.tx * k) / v.k, ty: (v.ty * k) / v.k };
    });
  const onDown = (e: RPointerEvent<SVGSVGElement>) => {
    const tag = (e.target as Element).tagName;
    if (!zoomed || tag === "circle" || tag === "path" || tag === "line") return;
    e.preventDefault();
    drag.current = { px: e.clientX, py: e.clientY, tx: view.tx, ty: view.ty, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (d) {
      d.moved = true;
      setView((v) => ({ ...v, tx: d.tx + e.clientX - d.px, ty: d.ty + e.clientY - d.py }));
    }
  };
  const tip = (e: { clientX: number; clientY: number }, content: ReactNode) => setT({ ...localPoint(e, ref.current), content });

  const edgePath = (e: XEdge) => {
    const a = byId.get(e.source);
    const b = byId.get(e.target);
    if (!a || !b) return null;
    const pa = S(a.x, a.y);
    const pb = S(b.x, b.y);
    if (!e.bend) return `M${pa.x},${pa.y} L${pb.x},${pb.y}`;
    const mx = (pa.x + pb.x) / 2;
    const my = (pa.y + pb.y) / 2;
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const len = Math.hypot(dx, dy) || 1;
    const off = e.bend * Math.min(80, len * 0.35);
    return `M${pa.x},${pa.y} Q${mx - (dy / len) * off},${my + (dx / len) * off} ${pb.x},${pb.y}`;
  };

  return (
    <div className={chart.chartBox}>
      <div className={chart.zoomRow}>
        <div className={chart.zoomBarInline} role="group" aria-label="그림 확대 · 축소">
          <button type="button" onClick={() => zoom(ZOOM_STEP)} disabled={view.k >= ZOOM_MAX} aria-label="확대" title="확대">
            <Plus />
          </button>
          <button type="button" onClick={() => zoom(1 / ZOOM_STEP)} disabled={!zoomed} aria-label="축소" title="축소">
            <Minus />
          </button>
          <button type="button" onClick={() => setView({ k: 1, tx: 0, ty: 0 })} disabled={!zoomed} aria-label="처음 크기로" title="처음 크기로">
            <RotateCcw />
          </button>
        </div>
        {zoomed ? <span className={chart.zoomHint}>빈 곳을 끌어서 옮겨요 · {fmt(view.k, 1)}배</span> : null}
      </div>
      <div ref={ref} className={chart.plot} style={{ height, overflow: "hidden" }} onMouseLeave={() => (setT(null), setHover(null))}>
        {width > 0 ? (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={ariaLabel}
            className={zoomed ? chart.scatterPan : undefined}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={() => {
              dragged.current = !!drag.current?.moved;
              drag.current = null;
            }}
          >
            <defs>
              <marker id="xArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="var(--viz-axis)" />
              </marker>
            </defs>
            <rect
              x={0}
              y={0}
              width={width}
              height={height}
              rx={6}
              className={chart.plotBg}
              onClick={() => {
                if (!dragged.current) onBackground?.();
                dragged.current = false;
              }}
            />
            {areas.map((a) => {
              const pts = a.points.map((p) => S(p[0], p[1]));
              const d = pts.length ? `M${pts.map((p) => `${p.x},${p.y}`).join(" L")} Z` : "";
              const on = selected === a.id || hover === a.id;
              const c = pts.reduce((acc, p) => ({ x: acc.x + p.x / pts.length, y: acc.y + p.y / pts.length }), { x: 0, y: 0 });
              const top = pts.reduce((m, p) => Math.min(m, p.y), Infinity);
              return (
                <g key={a.id}>
                  <path
                    d={d}
                    className={styles.area}
                    style={{ fill: on && a.activeColor ? a.activeColor : a.color, stroke: on && a.activeColor ? a.activeColor : a.color }}
                    opacity={on ? 0.36 : a.strong ? 0.26 : 0.14}
                    strokeWidth={on ? 30 : 22}
                    strokeLinejoin="round"
                    onClick={() => onArea?.(a.id)}
                    onMouseMove={(e) => (setHover(a.id), a.tip ? tip(e, a.tip) : undefined)}
                    onMouseLeave={() => (setHover(null), setT(null))}
                  />
                  <text x={c.x} y={top - 14} textAnchor="middle" className={a.strong ? styles.areaLabelStrong : styles.areaLabel}>
                    {a.label}
                  </text>
                </g>
              );
            })}
            {edges.map((e) => {
              const d = edgePath(e);
              if (!d) return null;
              const on = selected === e.id || hover === e.id || touches(e, nodeFocus);
              // 점을 골랐으면 그 점의 선만 마우스 · 클릭을 받는다 (다른 선은 흐리고 지나감)
              const hittable = !selNode || touches(e, selNode);
              const dim = !on && (nodeFocus !== null || (selected !== null && selected !== undefined && selected.includes("|")));
              return (
                <g key={e.id}>
                  <path
                    d={d}
                    fill="none"
                    stroke={e.color}
                    strokeWidth={hover === e.id || selected === e.id ? e.width + 3 : on ? e.width + 1.5 : e.width}
                    strokeDasharray={e.dash ? "5 4" : undefined}
                    strokeLinecap="round"
                    opacity={on ? 0.95 : dim ? 0.08 : (e.opacity ?? 0.4)}
                    markerEnd={e.arrow ? "url(#xArrow)" : undefined}
                    pointerEvents="none"
                  />
                  {(onEdge || e.tip) && hittable ? (
                    <path
                      d={d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={Math.max(10, e.width + 8)}
                      style={{ cursor: onEdge ? "pointer" : undefined }}
                      onClick={() => onEdge?.(e.id)}
                      onMouseMove={(ev) => (setHover(e.id), e.tip ? tip(ev, e.tip) : undefined)}
                      onMouseLeave={() => (setHover(null), setT(null))}
                    />
                  ) : null}
                </g>
              );
            })}
            {[...nodes]
              .sort((a, b) => b.r - a.r)
              .map((n) => {
                const s = S(n.x, n.y);
                const r = n.r * Math.min(2, Math.sqrt(view.k));
                const dim = nodeFocus !== null && !near.has(n.id);
                return (
                  <g key={n.id}>
                    {n.id === selected ? <circle cx={s.x} cy={s.y} r={r + 4} fill="none" stroke="var(--color-text)" strokeWidth={2} opacity={0.75} pointerEvents="none" /> : null}
                    <circle
                      cx={s.x}
                      cy={s.y}
                      r={r}
                      fill={n.fill}
                      stroke={n.stroke ?? "var(--color-bg)"}
                      strokeWidth={n.strokeWidth ?? 1}
                      strokeDasharray={n.dash ? "3 2" : undefined}
                      className={chart.point}
                      style={{ cursor: onNode ? "pointer" : undefined }}
                      opacity={dim ? 0.2 : (n.opacity ?? 0.85)}
                      onClick={() => onNode?.(n.id)}
                      onDoubleClick={() => onNodeDouble?.(n.id)}
                      onMouseMove={(e) => (setHover(n.id), tip(e, n.tip))}
                      onMouseLeave={() => (setHover(null), setT(null))}
                    />
                    {n.badge ? (
                      <text x={s.x + r + 2} y={s.y - r + 2} className={styles.badgeText} pointerEvents="none">
                        {n.badge}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            {nodes
              .filter((n) => n.label && (n.labelAlways || (zoomed && zoomLabels) || n.id === selected || n.id === hover) && !(nodeFocus && !near.has(n.id)))
              .map((n) => {
                const s = S(n.x, n.y);
                const r = n.r * Math.min(2, Math.sqrt(view.k));
                if (n.labelBelow)
                  return (
                    <text key={`l${n.id}`} x={s.x} y={s.y + r + 12} textAnchor="middle" className={chart.pointLabel} pointerEvents="none">
                      {short(n.label!)}
                    </text>
                  );
                const right = s.x > width * 0.6;
                return (
                  <text key={`l${n.id}`} x={right ? s.x - r - 4 : s.x + r + 4} y={s.y + 4} textAnchor={right ? "end" : "start"} className={chart.pointLabel} pointerEvents="none">
                    {short(n.label!)}
                  </text>
                );
              })}
          </svg>
        ) : null}
        <Tooltip tip={t} width={width} />
      </div>
    </div>
  );
}

/** 볼록 껍질 (점들을 감싸는 가장 작은 다각형) — 압력장 영역 */
export function convexHull(points: [number, number][]): [number, number][] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length <= 2) return pts;
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
