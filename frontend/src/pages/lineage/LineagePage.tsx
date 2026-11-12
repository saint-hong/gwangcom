import clsx from "clsx";
import { Maximize2, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { ShakeIcon } from "../../components/actions/ShakeIcon";
import { PageHeader } from "../../components/layout/PageHeader";
import { Avatar, Button } from "../../design-system";
import type { Lineage, LineageNode } from "../../types/api";
import styles from "./LineagePage.module.css";

const NODE_W = 168;
const NODE_H = 64;
const GAP_X = 24;
const GAP_Y = 76;
const PAD = 32;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2.5;

type Placed = LineageNode & { x: number; y: number };

/** 층(depth)마다 한 줄로 놓는다. 위 = 조상(재료), 가운데 = 현재 글, 아래 = 자손(혼합 글) */
function layout(data: Lineage): { nodes: Placed[]; width: number; height: number } {
  const rows = new Map<number, LineageNode[]>();
  for (const n of data.nodes) rows.set(n.depth, [...(rows.get(n.depth) ?? []), n]);
  const depths = [...rows.keys()].sort((a, b) => a - b);
  const widest = Math.max(...[...rows.values()].map((r) => r.length));
  const width = PAD * 2 + widest * NODE_W + (widest - 1) * GAP_X;
  const nodes: Placed[] = [];
  depths.forEach((d, row) => {
    const list = rows.get(d)!;
    const rowW = list.length * NODE_W + (list.length - 1) * GAP_X;
    const left = (width - rowW) / 2;
    list.forEach((n, i) => nodes.push({ ...n, x: left + i * (NODE_W + GAP_X), y: PAD + row * (NODE_H + GAP_Y) }));
  });
  return { nodes, width, height: PAD * 2 + depths.length * NODE_H + (depths.length - 1) * GAP_Y };
}

/**
 * S15 계보 (기획안 v10 F9, 화면 이름 "계보 그래프" → "계보" 2026-11-12)
 *   색: Shake it 글 = 보라 테두리, 사람이 쓴 상상(재료) = 회색 테두리 → 고르면(또는 지금 보는 글이면) 옅은 초록.
 *   색 안내 줄은 뺐다 (그래프가 커지면 다시 넣는다, 2026-11-12 사용자 지정)
 *   Shake it 으로 이어진 글들의 그물: 화살표 = 재료 글 → 혼합 글. 현재 글을 가운데 강조.
 *   기본 위 · 아래 3단계, 노드 최대 100개 (넘으면 "더 깊이 보기").
 * - 노드를 한 번 누르면 아래에 미리보기 카드, 한 번 더 누르면 그 글 상세로 간다
 * - 확대 · 축소 · 이동: 버튼, 마우스 휠, 끌기, 모바일 두 손가락
 */
export function LineagePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [depth, setDepth] = useState(3);
  const [data, setData] = useState<Lineage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    setError(null);
    api<Lineage>(`/api/imaginations/${id}/lineage?up=${depth}&down=${depth}`).then(
      (d) => {
        setData(d);
        setSelected(null);
      },
      (e) => setError(e instanceof ApiError ? e.message : "계보를 불러오지 못했어요."),
    );
  }, [id, depth]);

  const graph = useMemo(() => (data ? layout(data) : null), [data]);
  const byId = useMemo(() => new Map(graph?.nodes.map((n) => [n.id, n]) ?? []), [graph]);

  // ── 확대 · 이동 ──
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const fit = useCallback(() => {
    const el = box.current;
    if (!el || !graph) return;
    const k = Math.min(1, el.clientWidth / graph.width, el.clientHeight / graph.height);
    setView({ k, x: (el.clientWidth - graph.width * k) / 2, y: (el.clientHeight - graph.height * k) / 2 });
  }, [graph]);
  useEffect(fit, [fit]);

  const zoomAt = (factor: number, cx?: number, cy?: number) =>
    setView((v) => {
      const el = box.current;
      const px = cx ?? (el ? el.clientWidth / 2 : 0);
      const py = cy ?? (el ? el.clientHeight / 2 : 0);
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k * factor));
      return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
    });

  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left, e.clientY - r.top);
  };

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(0);
  const pinch = useRef<number | null>(null);
  // 누르자마자 붙잡으면(capture) 노드 클릭이 판으로 넘어간다 → 실제로 끌기 시작했을 때만 붙잡는다
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = 0;
    pinch.current = null;
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current) {
        const r = e.currentTarget.getBoundingClientRect();
        zoomAt(dist / pinch.current, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      }
      pinch.current = dist;
      moved.current += 10;
      return;
    }
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    moved.current += Math.abs(dx) + Math.abs(dy);
    if (moved.current > 6 && !e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const press = (n: Placed) => {
    if (moved.current > 6 || n.deleted) return; // 끌기였으면 누른 것으로 보지 않는다
    if (selected === n.id) navigate(`/i/${n.id}`);
    else setSelected(n.id);
  };

  const picked = selected !== null ? byId.get(selected) : undefined;
  return (
    <div>
      <PageHeader title="계보" />
      <p className={styles.intro}>
        Shake it 으로 섞여 이어진 상상들이에요. 화살표는 <b>재료 상상 → 섞여서 태어난 상상</b> 방향이에요.
      </p>

      {error ? (
        <p className={styles.status}>{error}</p>
      ) : !data || !graph ? (
        <p className={styles.status}>불러오는 중…</p>
      ) : (
        <>
          <div
            ref={box}
            className={styles.canvas}
            onWheel={onWheel}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onPointerLeave={onUp}
          >
            <div
              className={styles.world}
              style={{
                width: graph.width,
                height: graph.height,
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
              }}
            >
              <svg className={styles.edges} width={graph.width} height={graph.height} aria-hidden="true">
                <defs>
                  <marker id="lineage-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0,0 L10,5 L0,10 z" className={styles.arrow} />
                  </marker>
                </defs>
                {data.edges.map((e) => {
                  const a = byId.get(e.source);
                  const b = byId.get(e.target);
                  if (!a || !b) return null;
                  const x1 = a.x + NODE_W / 2;
                  const y1 = a.y + NODE_H;
                  const x2 = b.x + NODE_W / 2;
                  const y2 = b.y - 2;
                  const mid = (y1 + y2) / 2;
                  return (
                    <path
                      key={`${e.source}-${e.target}`}
                      d={`M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}`}
                      className={styles.edge}
                      markerEnd="url(#lineage-arrow)"
                    />
                  );
                })}
              </svg>

              {graph.nodes.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={clsx(
                    styles.node,
                    n.kind === "blend" && styles.blend,
                    n.id === data.center_id && styles.center,
                    n.id === selected && styles.selected,
                    n.deleted && styles.deleted,
                  )}
                  style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H }}
                  onClick={() => press(n)}
                  aria-label={n.deleted ? "삭제된 상상" : `${n.display_title} — ${n.author?.nickname}`}
                  disabled={n.deleted}
                >
                  {n.deleted ? (
                    <span className={styles.nodeTitle}>삭제된 상상</span>
                  ) : (
                    <>
                      <span className={styles.nodeHead}>
                        {n.author ? <Avatar name={n.author.nickname} src={n.author.avatar_url} size={20} /> : null}
                        <span className={styles.nodeName}>{n.author?.nickname}</span>
                        {n.kind === "blend" ? <ShakeIcon className={styles.nodeShake} aria-hidden="true" /> : null}
                      </span>
                      <span className={styles.nodeTitle}>{n.display_title}</span>
                    </>
                  )}
                </button>
              ))}
            </div>

            <div className={styles.tools} onPointerDown={(e) => e.stopPropagation()}>
              <button type="button" aria-label="확대" onClick={() => zoomAt(1.2)}>
                <Plus aria-hidden="true" />
              </button>
              <button type="button" aria-label="축소" onClick={() => zoomAt(1 / 1.2)}>
                <Minus aria-hidden="true" />
              </button>
              <button type="button" aria-label="화면에 맞추기" onClick={fit}>
                <Maximize2 aria-hidden="true" />
              </button>
            </div>
          </div>

          {data.truncated || (depth < 5 && data.nodes.some((n) => Math.abs(n.depth) === depth)) ? (
            <div className={styles.more}>
              {data.truncated ? <span>상상이 너무 많아 일부만 보여요.</span> : null}
              {depth < 5 ? (
                <Button size="sm" variant="outline" onClick={() => setDepth(5)}>
                  더 깊이 보기
                </Button>
              ) : null}
            </div>
          ) : null}

          {picked && !picked.deleted ? (
            <div className={styles.preview}>
              <div className={styles.previewHead}>
                {picked.author ? <Avatar name={picked.author.nickname} src={picked.author.avatar_url} size={20} /> : null}
                <span className={styles.nodeName}>{picked.author?.nickname}</span>
                <span className={styles.previewKind}>
                  {picked.kind === "blend" ? "Shake it" : picked.kind === "quote" ? "인용" : "원본"}
                  {picked.domain ? ` · ${picked.domain.name}` : ""}
                </span>
              </div>
              <p className={styles.previewTitle}>{picked.display_title}</p>
              <div className={styles.previewFoot}>
                <span className={styles.previewHint}>노드를 한 번 더 누르면 상세로 가요</span>
                <Link to={`/i/${picked.id}`} className={styles.previewLink}>
                  상세 보기
                </Link>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
