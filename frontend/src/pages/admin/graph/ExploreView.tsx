import { ChevronRight, Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../../api/client";
import { Button } from "../../../design-system";
import type { GEdge, GNode, GraphExpand, GraphHit, Imagination, Topics } from "../../../types/api";
import adminStyles from "../Admin.module.css";
import { shortDate } from "../adminFormat";
import { DOMAIN_NAME } from "../dashboard/parts";
import { queryString, type GraphQuery } from "./AdminGraphPage";
import styles from "./Graph.module.css";
import { GraphCanvas } from "./GraphCanvas";

/** 탐색 시작: 점 하나("t:tech:드론" …) */
export type Seed = { kind: "node"; id: string };

const KIND_LABEL: Record<GNode["kind"], string> = { imagination: "상상", dreamer: "Dreamer", tech: "주제", desire: "욕망" };
const edgeKey = (e: GEdge) => [e.source, e.target].sort().join("|") + `|${e.kind}`;

type Trail = { id: string; label: string };

/**
 * 파고들기 — 점 하나에서 시작해 이어진 상상 · 주제 · 욕망 · Dreamer 를 따라간다
 *   맨 위: 시작점 찾기(주제 · 욕망 · Dreamer · 상상) / 지나온 길 (누르면 그 점을 다시 고름)
 *   가운데: 그래프 (점을 누르면 오른쪽에 상세) / 오른쪽: 고른 점 상세 + [여기서 펼치기]
 *   운영자가 여기서 상상을 열어 봐도 조회 기록은 남지 않는다 (운영자 상세 API 를 쓴다)
 */
export function ExploreView({ query, seed, onSeed }: { query: GraphQuery; seed: Seed | null; onSeed: (s: Seed) => void }) {
  const [nodes, setNodes] = useState<Map<string, GNode>>(new Map());
  const [edges, setEdges] = useState<Map<string, GEdge>>(new Map());
  const [trail, setTrail] = useState<Trail[]>([]);
  const [more, setMore] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qs = queryString(query);
  const req = useRef(0);

  const merge = (out: GraphExpand, reset: boolean) => {
    setNodes((prev) => {
      const next = reset ? new Map<string, GNode>() : new Map(prev);
      for (const n of [out.center, ...out.nodes]) next.set(n.id, n);
      return next;
    });
    setEdges((prev) => {
      const next = reset ? new Map<string, GEdge>() : new Map(prev);
      for (const e of out.edges) if (!next.has(edgeKey(e))) next.set(edgeKey(e), e);
      return next;
    });
    setMore((prev) => ({ ...(reset ? {} : prev), [out.center.id]: out.more.imagination ?? 0 }));
  };

  const expand = useCallback(
    async (id: string, reset = false) => {
      const my = ++req.current;
      setLoading(true);
      setError(null);
      try {
        const out = await api<GraphExpand>(`/api/admin/graph/expand?node=${encodeURIComponent(id)}&${qs}`);
        if (my !== req.current) return;
        merge(out, reset);
        setTrail((prev) => [...(reset ? [] : prev.filter((t) => t.id !== out.center.id)), { id: out.center.id, label: out.center.label }]);
        setSelected(out.center.id);
      } catch (e) {
        if (my === req.current) setError(e instanceof ApiError ? e.message : "그래프를 불러오지 못했어요.");
      } finally {
        if (my === req.current) setLoading(false);
      }
    },
    [qs],
  );

  // 시작점이 바뀌거나 기간 · 분야가 바뀌면 처음부터
  useEffect(() => {
    if (seed) void expand(seed.id, true);
  }, [seed, expand]);

  const nodeList = [...nodes.values()];
  const edgeList = [...edges.values()];
  const expanded = trail.map((t) => t.id);
  const current = selected ? nodes.get(selected) ?? null : null;

  return (
    <div className={styles.explore}>
      <div className={styles.exploreTop}>
        <StartSearch onPick={(id) => onSeed({ kind: "node", id })} />
        {trail.length ? (
          <nav className={styles.trail} aria-label="지나온 길">
            {trail.map((t, i) => (
                <span key={t.id} className={styles.trailItem}>
                  {i > 0 ? <ChevronRight aria-hidden="true" /> : null}
                  <button type="button" aria-current={t.id === selected} onClick={() => setSelected(t.id)}>
                    {t.label}
                  </button>
                </span>
              ))}
          </nav>
        ) : null}
      </div>

      {nodeList.length === 0 ? (
        loading ? (
          <p className={adminStyles.status}>불러오는 중…</p>
        ) : (
          <Starters error={error} onPick={(id) => onSeed({ kind: "node", id })} />
        )
      ) : (
        <div className={styles.exploreBody}>
          <div className={styles.graphCol}>
            <GraphCanvas nodes={nodeList} edges={edgeList} selected={selected} expanded={expanded} onSelect={setSelected} />
            <Legend />
            {error ? <p className={styles.error}>{error}</p> : null}
          </div>
          <aside className={styles.panel} aria-label="고른 점">
            {current ? (
              <NodePanel
                node={current}
                edges={edgeList}
                nodes={nodes}
                expanded={expanded.includes(current.id)}
                more={more[current.id] ?? 0}
                loading={loading}
                onExpand={() => void expand(current.id)}
              />
            ) : (
              <p className={styles.panelEmpty}>그래프에서 점을 누르면 여기에 자세히 보여요.</p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

/** 처음 화면: 많이 상상된 주제를 바로 눌러 시작 (2026-11-19 — 빈 화면 대신) */
function Starters({ error, onPick }: { error: string | null; onPick: (id: string) => void }) {
  const [topics, setTopics] = useState<Topics["popular"] | null>(null);
  useEffect(() => {
    api<Topics>("/api/topics").then(
      (d) => setTopics(d.popular),
      () => setTopics([]),
    );
  }, []);
  return (
    <div className={styles.empty}>
      {error ? <p className={styles.error}>{error}</p> : null}
      <b>어디서부터 볼까요?</b>
      <p>위에서 주제 · 욕망 · Dreamer · 상상을 찾거나, 많이 상상된 주제에서 시작해 보세요.</p>
      {topics && topics.length ? (
        <div className={styles.tagRow}>
          {topics.map((t) => (
            <button key={t.name} type="button" className={styles.techPill} onClick={() => onPick(`t:tech:${t.name}`)}>
              #{t.label} <span>{t.count}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Legend() {
  const items: [string, string][] = [
    ["--viz-1", "상상"],
    ["--viz-5", "Shake it 혼합 글"],
    ["--viz-tech", "주제"],
    ["--viz-desire", "욕망"],
    ["--viz-3", "Dreamer"],
  ];
  return (
    <div className={styles.legend}>
      {items.map(([c, l]) => (
        <span key={l}>
          <i style={{ background: `var(${c})` }} aria-hidden="true" />
          {l}
        </span>
      ))}
      <span>
        <b className={styles.legendLine} aria-hidden="true" />
        비슷한 상상 (굵을수록 비슷함)
      </span>
    </div>
  );
}

/** 시작점 찾기 — 입력하고 Enter → 주제 · 욕망 · Dreamer · 상상 후보 (운영자 화면이라 욕망도 찾는다, 검색 기록은 남기지 않음) */
function StartSearch({ onPick }: { onPick: (id: string) => void }) {
  const [text, setText] = useState("");
  const [hits, setHits] = useState<GraphHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const q = text.trim();
    if (!q) return;
    setError(null);
    try {
      setHits(await api<GraphHit[]>(`/api/admin/graph/search?q=${encodeURIComponent(q)}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "찾지 못했어요.");
    }
  };
  return (
    <div className={styles.start}>
      <form className={styles.startForm} role="search" onSubmit={submit}>
        <Search aria-hidden="true" />
        <input
          value={text}
          maxLength={50}
          aria-label="탐색 시작점 찾기"
          placeholder="주제 · 욕망 · Dreamer · 상상 찾기"
          onChange={(e) => setText(e.target.value)}
        />
        {hits || text ? (
          <button
            type="button"
            aria-label="지우기"
            onClick={() => {
              setText("");
              setHits(null);
            }}
          >
            <X aria-hidden="true" />
          </button>
        ) : null}
      </form>
      {error ? <p className={styles.error}>{error}</p> : null}
      {hits ? (
        <ul className={styles.hits}>
          {hits.length === 0 ? <li className={styles.hitEmpty}>맞는 것이 없어요.</li> : null}
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(h.id);
                  setHits(null);
                }}
              >
                <span className={styles[`kind_${h.kind}`]}>{KIND_LABEL[h.kind]}</span>
                <b>{h.kind === "tech" ? `#${h.label}` : h.label}</b>
                {h.sub ? <small>{h.sub}</small> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** 고른 점 상세. 상상은 운영자 상세 API 로 읽는다 (조회 기록을 남기지 않음) */
function NodePanel({
  node,
  edges,
  nodes,
  expanded,
  more,
  loading,
  onExpand,
}: {
  node: GNode;
  edges: GEdge[];
  nodes: Map<string, GNode>;
  expanded: boolean;
  more: number;
  loading: boolean;
  onExpand: () => void;
}) {
  const [item, setItem] = useState<Imagination | null>(null);
  const itemId = node.kind === "imagination" ? Number(node.id.slice(2)) : null;
  useEffect(() => {
    setItem(null);
    if (itemId === null) return;
    let alive = true;
    api<Imagination>(`/api/admin/imaginations/${itemId}`).then(
      (d) => alive && setItem(d),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [itemId]);

  // 이 점과 비슷한 상상 연결 (AI 가 붙인 이유)
  const similar = edges
    .filter((e) => e.kind === "similar" && (e.source === node.id || e.target === node.id))
    .map((e) => ({ other: nodes.get(e.source === node.id ? e.target : e.source), e }))
    .filter((x) => x.other)
    .sort((a, b) => b.e.weight - a.e.weight);
  const tagName = node.kind === "tech" || node.kind === "desire" ? node.id.split(":").slice(2).join(":") : null;

  return (
    <div className={styles.panelBody}>
      <span className={styles[`kind_${node.kind}`]}>{KIND_LABEL[node.kind]}{node.blend ? " · Shake it" : ""}</span>
      <h3 className={styles.panelTitle}>{node.kind === "tech" ? `#${node.label}` : node.label}</h3>
      {node.sub ? <p className={styles.panelSub}>{node.sub}</p> : null}

      {node.kind === "imagination" ? (
        item ? (
          <>
            <p className={styles.panelMeta}>
              {item.author.nickname} · {DOMAIN_NAME[item.domain.slug] ?? item.domain.name} · {shortDate(item.created_at)}
            </p>
            <p className={styles.panelText}>{item.body}</p>
            {item.desire ? <p className={styles.panelDesire}>왜 원하나요 · {item.desire}</p> : null}
            {item.tags.length ? <p className={styles.panelTags}>{item.tags.map((t) => `#${t.label}`).join(" ")}</p> : null}
            <p className={styles.panelMeta}>
              Thunder {item.counts.thunders} · Wave {item.counts.waves} · 댓글 {item.counts.comments} · Shake it {item.counts.shakes}
            </p>
          </>
        ) : (
          <p className={styles.panelMeta}>불러오는 중…</p>
        )
      ) : null}

      {similar.length ? (
        <div className={styles.panelSimilar}>
          <b>비슷한 상상</b>
          <ul>
            {similar.slice(0, 6).map(({ other, e }) => (
              <li key={other!.id}>
                {other!.label} <small>· {other!.sub}</small>
                {e.reason ? <span>{e.reason}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {expanded && more > 0 ? <p className={styles.panelMeta}>상상 {more}개는 더 있어요 (Thunder 많은 것부터 보여요)</p> : null}

      <div className={styles.panelActions}>
        <Button size="sm" disabled={expanded || loading} onClick={onExpand}>
          {expanded ? "펼쳤어요" : "여기서 펼치기"}
        </Button>
        {node.kind === "imagination" && itemId ? (
          <Link className={styles.panelLink} to={`/i/${itemId}`}>
            상상 상세
          </Link>
        ) : null}
        {node.kind === "tech" && tagName ? (
          <Link className={styles.panelLink} to={`/tags/${encodeURIComponent(tagName)}`}>
            태그별 상상
          </Link>
        ) : null}
        {node.kind === "dreamer" ? (
          <>
            <Link className={styles.panelLink} to={`/@${node.label}`}>
              프로필
            </Link>
            <Link className={styles.panelLink} to={`/admin/users/${node.id.slice(2)}`}>
              사용자 관리
            </Link>
          </>
        ) : null}
      </div>
    </div>
  );
}
