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

/** 보이는 구간 [lo, hi] 의 눈금 (확대하면 0 부터가 아니라 그 구간 안에서) */
function rangeTicks(lo: number, hi: number, count = 4): number[] {
  const base = niceTicks(Math.max(hi - lo, 1e-6), count);
  const step = base[1] - base[0] || 1;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 0.001; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

const SCATTER_ZOOM_MAX = 6;

/**
 * 사분면 산점도 — 가로 = 얼마나 많이 상상되나, 세로 = 얼마나 원하나(Thunder 평균), 원 크기 = Dreamer 수
 *   가운데 점선 = 중앙값. 네 칸 이름은 읽는 방법일 뿐 판단이 아니다 (운영자가 해석)
 *   2026-11-14: 오른쪽 위 [+ · − · 처음 크기로] 로 확대 · 축소, 확대하면 빈 곳을 끌어서 옮긴다 (축 눈금도 그 구간에 맞춤).
 *   이름은 처음에 labelTop 개, 확대하면 보이는 점 모두.
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
  // 확대: k = 배율, (vx, vy) = 보이는 구간의 시작 (데이터 값)
  const [view, setView] = useState({ k: 1, vx: 0, vy: 0 });
  const drag = useRef<{ px: number; py: number; vx: number; vy: number } | null>(null);
  // 축 이름은 그림 밖(위 · 아래 여백), 네 칸 이름은 그림 안 위 · 아래 띠에 둔다.
  // 점은 띠 안쪽에만 찍어서 (가장 큰 원 반지름만큼 더 비움) 축 이름 · 칸 이름과 겹치지 않게 한다.
  // 왼쪽 여백 = 세로축 이름(세워 쓴 글자) + 눈금 숫자 (2026-11-14 축 이름을 y축 바깥으로)
  const M = { top: 12, right: 16, bottom: 44, left: 62 };
  const w = Math.max(0, width - M.left - M.right);
  const h = height - M.top - M.bottom;
  const maxR = Math.max(0, ...points.map((p) => p.r));
  const padY = quadrants ? maxR + 22 : maxR + 2;
  const padX = maxR + 2;
  const xMax = niceTicks(Math.max(1, ...points.map((p) => p.x))).at(-1) || 1;
  const yMax = niceTicks(Math.max(1, ...points.map((p) => p.y))).at(-1) || 1;
  const xSpan = xMax / view.k;
  const ySpan = yMax / view.k;
  const iw = Math.max(1, w - 2 * padX);
  const ih = Math.max(1, h - 2 * padY);
  const X = (v: number) => M.left + padX + ((v - view.vx) / xSpan) * iw;
  const Y = (v: number) => M.top + h - padY - ((v - view.vy) / ySpan) * ih;
  const xt = rangeTicks(view.vx, view.vx + xSpan);
  const yt = rangeTicks(view.vy, view.vy + ySpan);
  const med = (a: number[]) => {
    const s = [...a].sort((p, q) => p - q);
    return s.length ? s[Math.floor(s.length / 2)] : 0;
  };
  const mx = med(points.map((p) => p.x));
  const my = med(points.map((p) => p.y));
  const zoomed = view.k > 1;
  const inView = (p: Point) => X(p.x) >= M.left - p.r && X(p.x) <= M.left + w + p.r && Y(p.y) >= M.top - p.r && Y(p.y) <= M.top + h + p.r;
  const labelled = new Set(
    zoomed
      ? points.filter(inView).map((p) => p.id)
      : [...points]
          .sort((a, b) => b.x / xMax + b.y / yMax - (a.x / xMax + a.y / yMax))
          .slice(0, labelTop)
          .map((p) => p.id),
  );
  const draw = [...points].sort((a, b) => b.r - a.r); // 큰 원 먼저 (작은 원이 위로)

  const clamp = (k: number, vx: number, vy: number) => ({
    k,
    vx: Math.min(Math.max(0, vx), xMax - xMax / k),
    vy: Math.min(Math.max(0, vy), yMax - yMax / k),
  });
  const zoom = (f: number) =>
    setView((v) => {
      const k = Math.min(SCATTER_ZOOM_MAX, Math.max(1, v.k * f));
      // 지금 보이는 구간의 가운데를 기준으로
      const cx = v.vx + xMax / v.k / 2;
      const cy = v.vy + yMax / v.k / 2;
      return clamp(k, cx - xMax / k / 2, cy - yMax / k / 2);
    });
  const onDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (!zoomed || (e.target as Element).tagName === "circle") return;
    e.preventDefault(); // 끄는 동안 바깥 글자(설명 · 축 이름)가 선택되지 않게
    drag.current = { px: e.clientX, py: e.clientY, vx: view.vx, vy: view.vy };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (d) setView((v) => clamp(v.k, d.vx - ((e.clientX - d.px) / iw) * xSpan, d.vy + ((e.clientY - d.py) / ih) * ySpan));
  };
  const clipId = `scatter-clip-${xLabel.length}-${yLabel.length}`;

  return (
    <div className={styles.chartBox}>
      {/* 오른쪽 위 확대 · 축소 (그래프 위 한 줄, 칸 이름과 겹치지 않게) */}
      <div className={styles.zoomRow}>
        <div className={styles.zoomBarInline} role="group" aria-label="산점도 확대 · 축소">
          <button type="button" onClick={() => zoom(ZOOM_STEP)} disabled={view.k >= SCATTER_ZOOM_MAX} aria-label="확대" title="확대">
            <Plus />
          </button>
          <button type="button" onClick={() => zoom(1 / ZOOM_STEP)} disabled={!zoomed} aria-label="축소" title="축소">
            <Minus />
          </button>
          <button type="button" onClick={() => setView({ k: 1, vx: 0, vy: 0 })} disabled={!zoomed} aria-label="처음 크기로" title="처음 크기로">
            <RotateCcw />
          </button>
        </div>
        {zoomed ? <span className={styles.zoomHint}>빈 곳을 끌어서 옮겨요 · {fmt(view.k, 1)}배</span> : null}
      </div>
      <div ref={ref} className={styles.plot} style={{ height }} onMouseLeave={() => (setT(null), setHover(null))}>
        {width > 0 ? (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`${xLabel} · ${yLabel} 산점도`}
            className={zoomed ? styles.scatterPan : undefined}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={() => (drag.current = null)}
          >
            <defs>
              <clipPath id={clipId}>
                <rect x={M.left} y={M.top} width={w} height={h} />
              </clipPath>
            </defs>
            {/* 그림 영역 바탕 = 옅은 회색, 눈금선은 바탕색(흰색)으로 (2026-11-14 영역이 잘 보이게) */}
            <rect x={M.left} y={M.top} width={w} height={h} rx={6} className={styles.plotBg} />
            {yt.map((v) => (
              <g key={`y${v}`}>
                <line x1={M.left} x2={M.left + w} y1={Y(v)} y2={Y(v)} className={styles.plotBgGrid} />
                <text x={M.left - 6} y={Y(v)} className={styles.axisY}>
                  {fmt(v, 2)}
                </text>
              </g>
            ))}
            {xt.map((v) => (
              <text key={`x${v}`} x={X(v)} y={M.top + h + 16} className={styles.axisX}>
                {fmt(v, 1)}
              </text>
            ))}
            {/* 가로축 이름: x축 아래 가운데, 화살표 없이 (2026-11-14) */}
            <text x={M.left + w / 2} y={height - 4} textAnchor="middle" className={styles.scatterAxisTitle}>
              {xLabel}
            </text>
            {/* 세로축 이름: y축 바깥 왼쪽에 아래에서 위로 세워 씀 (일반 그래프 방식, 2026-11-14) */}
            <text x={14} y={M.top + h / 2} transform={`rotate(-90 14 ${M.top + h / 2})`} textAnchor="middle" className={styles.scatterAxisTitle}>
              {yLabel}
            </text>
            <g clipPath={`url(#${clipId})`}>
              <line x1={X(mx)} x2={X(mx)} y1={M.top} y2={M.top + h} className={styles.medianLine} />
              <line x1={M.left} x2={M.left + w} y1={Y(my)} y2={Y(my)} className={styles.medianLine} />
            </g>
            {quadrants ? (
              <>
                <text x={M.left + 6} y={M.top + 16} className={styles.quadLabel}>
                  {quadrants[0]}
                </text>
                <text x={M.left + w - 6} y={M.top + 16} className={styles.quadLabel} textAnchor="end">
                  {quadrants[1]}
                </text>
                <text x={M.left + 6} y={M.top + h - 7} className={styles.quadLabel}>
                  {quadrants[2]}
                </text>
                <text x={M.left + w - 6} y={M.top + h - 7} className={styles.quadLabel} textAnchor="end">
                  {quadrants[3]}
                </text>
              </>
            ) : null}
            <g clipPath={`url(#${clipId})`}>
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
            </g>
          </svg>
        ) : null}
        <Tooltip tip={t} width={width} />
      </div>
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
  cluster: string; // 군집 이름 A · B · C … (서버가 Louvain 으로 찾음, 뜻 없는 임의 이름)
};
export type NetEdge = { source: string; target: string; weight: number };

type Pos = { x: number; y: number; vx: number; vy: number };

/** 군집 색 — 기술(보라) · 욕망(주황) 점 색과 겹치지 않는 색만 돌려 쓴다 (2026-11-15). 이름 A=0, B=1 … 순서로 */
const CLUSTER_PALETTE = ["var(--viz-1)", "var(--viz-3)", "var(--viz-4)", "var(--viz-5)", "var(--viz-8)", "var(--viz-domain-mobile)", "var(--viz-6)"];
export function clusterColor(name: string): string {
  const k = name.charCodeAt(0) - 65 + (name.length > 1 ? 26 * (Number(name.slice(1)) - 1) : 0);
  return CLUSTER_PALETTE[((k % CLUSTER_PALETTE.length) + CLUSTER_PALETTE.length) % CLUSTER_PALETTE.length];
}

/**
 * 힘 배치 (같은 상상에 함께 나온 태그끼리 끌어당김, 모두 서로 밀어냄) — 결과가 늘 같도록 시작 위치는 고정
 *   2026-11-15: 군집마다 둥글게 떨어진 자리에서 출발하고, 같은 군집끼리 가운데로 조금 더 끌어당겨 군집이 덩어리로 보이게
 */
function layout(nodes: NetNode[], edges: NetEdge[], w: number, h: number): Map<string, Pos> {
  const pos = new Map<string, Pos>();
  const clusters = [...new Set(nodes.map((n) => n.cluster))].sort();
  const seen = new Map<string, number>();
  nodes.forEach((n) => {
    const c = clusters.indexOf(n.cluster);
    const j = seen.get(n.cluster) ?? 0;
    seen.set(n.cluster, j + 1);
    const ca = (c / Math.max(1, clusters.length)) * Math.PI * 2;
    const cr = clusters.length > 1 ? 0.3 : 0;
    const a = j * 2.4;
    const r = 8 + 7 * Math.sqrt(j);
    pos.set(n.id, {
      x: w / 2 + Math.cos(ca) * w * cr + Math.cos(a) * r,
      y: h / 2 + Math.sin(ca) * h * cr + Math.sin(a) * r,
      vx: 0,
      vy: 0,
    });
  });
  const list = nodes.map((n) => pos.get(n.id)!);
  const groupOf = nodes.map((n) => n.cluster);
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
        const f = ((k * k) / d2) * (groupOf[i] === groupOf[j] ? 1 : 1.6); // 다른 군집끼리는 조금 더 밀어냄
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
    // 같은 군집의 가운데로 끌어당김
    const cen = new Map<string, { x: number; y: number; n: number }>();
    list.forEach((p, i) => {
      const c = cen.get(groupOf[i]) ?? { x: 0, y: 0, n: 0 };
      cen.set(groupOf[i], { x: c.x + p.x, y: c.y + p.y, n: c.n + 1 });
    });
    list.forEach((p, i) => {
      const c = cen.get(groupOf[i])!;
      p.vx += (c.x / c.n - p.x) * 0.03;
      p.vy += (c.y / c.n - p.y) * 0.03;
    });
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
  // 처음 배율을 크게 (2026-11-15 사용자 요청): 배치가 끝난 무리를 그림 영역에 꽉 차게 펼친다.
  //   가로 · 세로를 따로 늘리되 한쪽이 다른 쪽의 1.8배를 넘지 않게 해서 군집 모양이 크게 찌그러지지 않게 한다.
  //   여백: 좌우 44px · 위 40px(점 위 이름 · 군집 글자) · 아래 24px
  if (list.length > 1) {
    const xs = list.map((p) => p.x);
    const ys = list.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const FIT = { side: 44, top: 40, bottom: 24, ratio: 1.8 };
    let sx = (w - 2 * FIT.side) / Math.max(1, x1 - x0);
    let sy = (h - FIT.top - FIT.bottom) / Math.max(1, y1 - y0);
    sx = Math.min(sx, sy * FIT.ratio);
    sy = Math.min(sy, sx * FIT.ratio);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const my = FIT.top + (h - FIT.top - FIT.bottom) / 2;
    for (const p of list) {
      p.x = w / 2 + (p.x - cx) * sx;
      p.y = my + (p.y - cy) * sy;
    }
  }
  return pos;
}

/** 볼록 껍질 (모노톤 체인) — 군집 영역을 그릴 때 */
function convexHull(pts: [number, number][]): [number, number][] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

const NODE_COLOR = { tech: "var(--viz-tech)", desire: "var(--viz-desire)" };

/**
 * 기술 × 욕망 네트워크 — 원 = 태그(크기 = 상상 수), 선 = 같은 상상에 함께 나옴(굵기 · 진하기 = 횟수)
 *   2026-11-15: 군집(A · B · C …)마다 옅은 영역 + 글자. 위 [군집] 칩을 누르면 그 군집만 진하게,
 *   그 군집과 이어진 다른 태그는 반쯤, 나머지는 흐리게 → 군집이 어떤 기술 · 욕망과 이어지는지 한눈에
 *   원에 올리면 이어진 태그만 진하게 (군집 칩보다 우선)
 */
export function Network({ nodes, edges, height = 460 }: { nodes: NetNode[]; edges: NetEdge[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [t, setT] = useState<Tip>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const pos = useMemo(() => (width > 0 ? layout(nodes, edges, width, height) : new Map<string, Pos>()), [nodes, edges, width, height]);
  const maxCount = Math.max(1, ...nodes.map((n) => n.count));
  const radius = (c: number) => 4 + Math.sqrt(c / maxCount) * 16;
  const clusterOf = useMemo(() => new Map(nodes.map((n) => [n.id, n.cluster])), [nodes]);
  const clusters = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of nodes) m.set(n.cluster, (m.get(n.cluster) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].length - b[0].length || a[0].localeCompare(b[0]));
  }, [nodes]);
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
  const active = focus && clusters.some(([c]) => c === focus) ? focus : null;
  // 군집과 이어진 바깥 태그
  const focusNear = useMemo(() => {
    const s = new Set<string>();
    if (!active) return s;
    for (const e of edges) {
      const ca = clusterOf.get(e.source) === active;
      const cb = clusterOf.get(e.target) === active;
      if (ca && !cb) s.add(e.target);
      if (cb && !ca) s.add(e.source);
    }
    return s;
  }, [active, edges, clusterOf]);
  const maxW = Math.max(1, ...edges.map((e) => e.weight));
  const labelMin = [...nodes].sort((a, b) => b.count - a.count)[Math.min(nodes.length - 1, 14)]?.count ?? 0;

  // 군집 영역: 원 둘레 점들의 볼록 껍질 (여백 10px), 글자는 영역 맨 위
  const hulls = useMemo(() => {
    const out: { name: string; d: string; top: [number, number] }[] = [];
    for (const [name, size] of clusters) {
      if (size < 2) continue;
      const pts: [number, number][] = [];
      for (const n of nodes) {
        const p = pos.get(n.id);
        if (!p || n.cluster !== name) continue;
        const r = radius(n.count) + 10;
        for (let i = 0; i < 12; i++) pts.push([p.x + Math.cos((i / 12) * Math.PI * 2) * r, p.y + Math.sin((i / 12) * Math.PI * 2) * r]);
      }
      const hull = convexHull(pts);
      if (hull.length < 3) continue;
      const top = hull.reduce((m, q) => (q[1] < m[1] ? q : m), hull[0]);
      out.push({ name, d: `M${hull.map((q) => `${q[0]},${q[1]}`).join("L")}Z`, top });
    }
    return out;
  }, [clusters, nodes, pos]);

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
    if ((e.target as Element).closest("[data-node]")) return; // 원 위에서는 끌지 않음 (툴팁)
    e.preventDefault(); // 끄는 동안 바깥 글자가 선택되지 않게
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

  const nodeOpacity = (n: NetNode) => {
    if (hover) return hover === n.id || near?.has(n.id) ? 1 : 0.18;
    if (active) return n.cluster === active ? 1 : focusNear.has(n.id) ? 0.5 : 0.1;
    return 1;
  };
  const edgeOpacity = (e: NetEdge) => {
    const base = 0.12 + (e.weight / maxW) * 0.5; // 많이 함께 나올수록 진하게
    if (hover) return e.source === hover || e.target === hover ? 0.9 : 0.04;
    if (active) return clusterOf.get(e.source) === active || clusterOf.get(e.target) === active ? Math.min(0.9, base + 0.2) : 0.03;
    return base;
  };

  return (
    <div className={styles.chartBox}>
      <div className={styles.netHead}>
        <Legend
          items={[
            { label: "기술", color: NODE_COLOR.tech },
            { label: "욕망", color: NODE_COLOR.desire },
          ]}
        />
        {/* 군집 칩 — 누르면 그 군집이 활성화 (다시 누르면 전체) */}
        <div className={styles.clusterChips} role="group" aria-label="군집 고르기">
          <span className={styles.clusterChipsLabel}>군집</span>
          <button type="button" className={styles.clusterChip} aria-pressed={!active} onClick={() => setFocus(null)}>
            전체
          </button>
          {clusters.map(([name, size]) => (
            <button
              key={name}
              type="button"
              className={styles.clusterChip}
              aria-pressed={active === name}
              onClick={() => setFocus((f) => (f === name ? null : name))}
              title={`군집 ${name} · 태그 ${size}개`}
            >
              <span className={styles.clusterSwatch} style={{ background: clusterColor(name) }} aria-hidden="true" />
              {name}
              <span className={styles.clusterSize}>{size}</span>
            </button>
          ))}
        </div>
      </div>
      <div ref={ref} className={styles.plot} style={{ height }} onMouseLeave={() => (setT(null), setHover(null))}>
        {width > 0 ? (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label="기술 × 욕망 네트워크"
            className={styles.netSvg}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            {/* 바탕 = 사분면(상상 빈도 × 욕망 강도)과 같은 옅은 회색 (2026-11-15). 확대해도 바탕은 그대로 */}
            <rect x={0} y={0} width={width} height={height} rx={6} className={styles.plotBg} />
            <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
              {hulls.map((hl) => {
                const on = !active || active === hl.name;
                return (
                  <g key={`h${hl.name}`} opacity={hover ? 0.35 : on ? 1 : 0.25}>
                    <path d={hl.d} fill={clusterColor(hl.name)} fillOpacity={active === hl.name ? 0.14 : 0.07} stroke={clusterColor(hl.name)} strokeOpacity={0.55} className={styles.clusterHull} />
                    <text x={hl.top[0]} y={hl.top[1] - 4} fill={clusterColor(hl.name)} className={styles.clusterName}>
                      {hl.name}
                    </text>
                  </g>
                );
              })}
              {edges.map((e) => {
                const a = pos.get(e.source);
                const b = pos.get(e.target);
                if (!a || !b) return null;
                return (
                  <line
                    key={`${e.source}|${e.target}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    className={styles.netEdge}
                    strokeWidth={0.5 + (e.weight / maxW) * 4.5}
                    opacity={edgeOpacity(e)}
                  />
                );
              })}
              {nodes.map((n) => {
                const p = pos.get(n.id);
                if (!p) return null;
                const show = hover ? hover === n.id || near?.has(n.id) : active ? n.cluster === active : n.count >= labelMin;
                return (
                  <g
                    key={n.id}
                    data-node=""
                    opacity={nodeOpacity(n)}
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
                            <TipRow color={clusterColor(n.cluster)} label="군집" value={n.cluster} />
                            <TipRow label="Thunder" value={n.thunders} />
                            <TipRow label="함께 나온 태그" value={`${neighbors.get(n.id)?.size ?? 0}개`} />
                          </>
                        ),
                      });
                    }}
                  >
                    <circle cx={p.x} cy={p.y} r={radius(n.count)} fill={NODE_COLOR[n.type]} className={styles.netNode} />
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
export function Sankey({
  nodes,
  links,
  colorOf,
  height = 420,
  valueText = (n) => `상상 ${n.value}개`,
  bandColor,
}: {
  nodes: SankeyNode[];
  links: SankeyLink[];
  colorOf: (n: SankeyNode) => string;
  height?: number;
  valueText?: (n: SankeyNode) => string; // 상자 툴팁 숫자 (2026-11-15)
  bandColor?: (source: SankeyNode) => string; // 띠 색 (없으면 출발 상자 색, 2026-11-15)
}) {
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
                fill={bandColor ? bandColor(s.n) : colorOf(s.n)}
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
                  content: <TipRow color={colorOf(n)} label={n.label} value={valueText(n)} />,
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
