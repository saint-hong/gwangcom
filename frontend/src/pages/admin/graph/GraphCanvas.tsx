import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import chart from "../../../components/charts/Charts.module.css";
import { TipRow, Tooltip, fmt, localPoint, useWidth, type Tip } from "../../../components/charts/core";
import type { GEdge, GNode } from "../../../types/api";
import { DOMAIN_NAME } from "../dashboard/parts";

const KIND_LABEL: Record<GNode["kind"], string> = { imagination: "상상", dreamer: "Dreamer", tech: "주제", desire: "욕망" };

/** 점 색 — 대시보드와 같은 시각화 색 (상상 파랑 · 혼합 분홍 · 주제 보라 · 욕망 주황 · Dreamer 초록) */
const colorOf = (n: GNode) =>
  n.kind === "imagination" ? (n.blend ? "var(--viz-5)" : "var(--viz-1)") : n.kind === "tech" ? "var(--viz-tech)" : n.kind === "desire" ? "var(--viz-desire)" : "var(--viz-3)";

/** 원 크기: 대시보드 사분면처럼 4 + 제곱근 (상상 = Thunder, 주제 · Dreamer = 상상 수) */
const radiusOf = (n: GNode) => Math.min(16, 4 + Math.sqrt(Math.max(0, n.size)) * (n.kind === "imagination" ? 1.2 : 1.6));

const SHORT = 14;
const short = (s: string) => (s.length > SHORT ? `${s.slice(0, SHORT)}…` : s);
const ZOOM_STEP = 1.25;
const ZOOM_MAX = 6;
const LABEL_TOP = 8;
const PAD = 28;

type Props = {
  nodes: GNode[];
  edges: GEdge[];
  selected: string | null;
  /** 펼친 점 (지나온 길) — 이름이 늘 보인다 */
  expanded: string[];
  onSelect: (id: string) => void;
  height?: number;
};

/**
 * 탐색기 그래프 — 대시보드 "상상 빈도 × 욕망 강도" 산점도와 같은 모양 (2026-11-19 사용자: 그래프가 보기 어렵다)
 *   옅은 회색 그림 영역 · 반투명 원(흰 테두리) · 이름은 큰 점 몇 개와 고른 점만, 나머지는 마우스를 올리면 · 툴팁
 *   선은 옅게 깔고, 마우스를 올리거나 고른 점의 선만 진하게 (비슷한 상상 = 파랑, 나머지 = 회색)
 *   위 오른쪽 [+ · − · 처음 크기로], 확대하면 빈 곳을 끌어서 옮긴다
 *   자리 잡기: graphology + ForceAtlas2. 이미 있던 점은 제자리, 새 점만 이웃 옆에서 출발
 */
export function GraphCanvas({ nodes, edges, selected, expanded, onSelect, height = 560 }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [t, setT] = useState<Tip>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState({ k: 1, tx: 0, ty: 0 });
  const drag = useRef<{ px: number; py: number; tx: number; ty: number } | null>(null);
  const layout = useRef(new Graph({ type: "undirected" }));

  // 자리 계산 (점 · 선이 바뀔 때만)
  const pos = useMemo(() => {
    const g = layout.current;
    const keep = new Set(nodes.map((n) => n.id));
    g.forEachNode((id) => {
      if (!keep.has(id)) g.dropNode(id);
    });
    const fresh: string[] = [];
    for (const n of nodes) {
      if (!g.hasNode(n.id)) {
        g.addNode(n.id, { x: 0, y: 0 });
        fresh.push(n.id);
      }
    }
    g.clearEdges();
    for (const e of edges) {
      if (e.source !== e.target && g.hasNode(e.source) && g.hasNode(e.target) && !g.hasEdge(e.source, e.target)) {
        g.addEdge(e.source, e.target, { weight: e.kind === "similar" ? 1 + Math.max(0, e.weight - 0.8) * 10 : Math.min(3, Math.sqrt(e.weight)) });
      }
    }
    fresh.forEach((id, k) => {
      const placed = g.neighbors(id).filter((nb) => !fresh.includes(nb));
      const a = (k / Math.max(1, fresh.length)) * Math.PI * 2;
      if (placed.length) {
        const p = g.getNodeAttributes(placed[0]);
        g.mergeNodeAttributes(id, { x: (p.x as number) + Math.cos(a) * 30, y: (p.y as number) + Math.sin(a) * 30 });
      } else {
        g.mergeNodeAttributes(id, { x: Math.cos(a) * 100, y: Math.sin(a) * 100 });
      }
    });
    if (fresh.length && g.order > 1) {
      forceAtlas2.assign(g, {
        iterations: fresh.length === g.order ? 300 : 120,
        settings: { ...forceAtlas2.inferSettings(g), gravity: 1.5, scalingRatio: 10, edgeWeightInfluence: 1, adjustSizes: false },
      });
    }
    const out = new Map<string, { x: number; y: number }>();
    g.forEachNode((id, a) => out.set(id, { x: a.x as number, y: a.y as number }));
    return out;
  }, [nodes, edges]);

  // 데이터 자리 → 그림 자리 (전체가 그림 영역에 들어가게 맞춘 뒤, 확대 · 이동)
  const xs = [...pos.values()].map((p) => p.x);
  const ys = [...pos.values()].map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = Math.max(x1 - x0, y1 - y0, 1e-6);
  const fit = Math.min((width - 2 * PAD) / Math.max(x1 - x0, 1e-6), (height - 2 * PAD) / Math.max(y1 - y0, 1e-6), (Math.min(width, height) - 2 * PAD) / span * 2);
  const cx = width / 2;
  const cy = height / 2;
  const S = (p: { x: number; y: number }) => ({
    x: cx + ((p.x - (x0 + x1) / 2) * fit) * view.k + view.tx,
    y: cy + ((p.y - (y0 + y1) / 2) * fit) * view.k + view.ty,
  });

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const focus = hover ?? selected;
  const near = new Set<string>();
  if (focus) {
    near.add(focus);
    for (const e of edges) {
      if (e.source === focus) near.add(e.target);
      if (e.target === focus) near.add(e.source);
    }
  }
  const zoomed = view.k > 1;
  const labelled = new Set<string>([
    ...expanded,
    ...(selected ? [selected] : []),
    ...(hover ? [hover] : []),
    ...[...nodes].sort((a, b) => b.size - a.size).slice(0, LABEL_TOP).map((n) => n.id),
    ...(zoomed ? nodes.map((n) => n.id) : []),
  ]);
  const draw = [...nodes].sort((a, b) => radiusOf(b) - radiusOf(a)); // 큰 원 먼저 (작은 원이 위로)

  const zoom = (f: number) =>
    setView((v) => {
      const k = Math.min(ZOOM_MAX, Math.max(1, v.k * f));
      return k === 1 ? { k, tx: 0, ty: 0 } : { k, tx: (v.tx * k) / v.k, ty: (v.ty * k) / v.k };
    });
  const onDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (!zoomed || (e.target as Element).tagName === "circle") return;
    e.preventDefault();
    drag.current = { px: e.clientX, py: e.clientY, tx: view.tx, ty: view.ty };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (d) setView((v) => ({ ...v, tx: d.tx + e.clientX - d.px, ty: d.ty + e.clientY - d.py }));
  };

  return (
    <div className={chart.chartBox}>
      <div className={chart.zoomRow}>
        <div className={chart.zoomBarInline} role="group" aria-label="그래프 확대 · 축소">
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
            aria-label="상상 연결 그래프"
            className={zoomed ? chart.scatterPan : undefined}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={() => (drag.current = null)}
          >
            <rect x={0} y={0} width={width} height={height} rx={6} className={chart.plotBg} />
            {edges.map((e) => {
              const a = pos.get(e.source);
              const b = pos.get(e.target);
              if (!a || !b) return null;
              const pa = S(a);
              const pb = S(b);
              const on = focus !== null && (e.source === focus || e.target === focus);
              const sim = e.kind === "similar";
              return (
                <line
                  key={`${e.source}|${e.target}|${e.kind}`}
                  x1={pa.x}
                  y1={pa.y}
                  x2={pb.x}
                  y2={pb.y}
                  stroke={sim ? "var(--viz-1)" : "var(--viz-axis)"}
                  strokeWidth={sim ? 0.8 + Math.max(0, e.weight - 0.85) * 12 : 0.8 + Math.min(2, Math.sqrt(e.weight) * 0.4)}
                  strokeLinecap="round"
                  opacity={on ? 0.75 : focus ? 0.06 : 0.16}
                />
              );
            })}
            {draw.map((n) => {
              const p = pos.get(n.id);
              if (!p) return null;
              const s = S(p);
              const r = radiusOf(n);
              return (
                <g key={n.id}>
                  {n.id === selected || expanded.includes(n.id) ? (
                    <circle cx={s.x} cy={s.y} r={r + 3.5} fill="none" stroke="var(--color-text)" strokeWidth={n.id === selected ? 2 : 1} opacity={0.7} />
                  ) : null}
                  <circle
                    cx={s.x}
                    cy={s.y}
                    r={r}
                    fill={colorOf(n)}
                    className={chart.point}
                    style={{ cursor: "pointer" }}
                    opacity={focus && !near.has(n.id) ? 0.25 : 0.78}
                    onClick={() => onSelect(n.id)}
                    onMouseMove={(e) => {
                      setHover(n.id);
                      setT({
                        ...localPoint(e, ref.current),
                        content: (
                          <>
                            <b>{n.kind === "tech" ? `#${n.label}` : n.label}</b>
                            <TipRow label="종류" value={`${KIND_LABEL[n.kind]}${n.blend ? " · Shake it" : ""}`} />
                            {n.sub ? <TipRow label={n.kind === "imagination" ? "작성자" : "수"} value={n.sub} /> : null}
                            {n.kind === "imagination" ? <TipRow label="Thunder" value={n.size} /> : null}
                            {n.domain ? <TipRow label="분야" value={DOMAIN_NAME[n.domain] ?? n.domain} /> : null}
                          </>
                        ),
                      });
                    }}
                    onMouseLeave={() => (setHover(null), setT(null))}
                  />
                </g>
              );
            })}
            {draw
              .filter((n) => labelled.has(n.id) && (!focus || near.has(n.id) || n.id === selected))
              .map((n) => {
                const p = pos.get(n.id);
                if (!p) return null;
                const s = S(p);
                const r = radiusOf(n);
                const right = s.x > width * 0.8;
                return (
                  <text key={`l${n.id}`} x={right ? s.x - r - 3 : s.x + r + 3} y={s.y + 4} textAnchor={right ? "end" : "start"} className={chart.pointLabel}>
                    {short(n.kind === "tech" ? `#${n.label}` : byId.get(n.id)?.label ?? n.label)}
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
