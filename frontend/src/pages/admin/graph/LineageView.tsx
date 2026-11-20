import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../../../api/client";
import { SelectMenu } from "../../../components/common/SelectMenu";
import { DOMAIN_COLORS, Legend, TipRow, fmt } from "../../../components/charts/core";
import type { GraphHit, XLineageNode, LineageOut, LineageTree, PeriodKey } from "../../../types/api";
import { Panel } from "../dashboard/parts";
import { ChoiceSetting } from "../dashboard/settings";
import { domainName, queryString, type Selection } from "./explorer";
import { ScopeSettings, useScope } from "./Scope";
import styles from "./Graph.module.css";
import { StatusNote } from "./Status";
import { XCanvas, type XArea, type XEdge, type XNode } from "./XCanvas";

const SYNERGY = [
  { value: "", label: "시너지 전체" },
  { value: "0", label: "시너지 0 이상" },
  { value: "1", label: "시너지 +1 이상" },
  { value: "3", label: "시너지 +3 이상" },
  { value: "5", label: "시너지 +5 이상" },
  { value: "10", label: "시너지 +10 이상" },
];
const signed = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${fmt(v, 1)}`);
const COL = 120;
const ROW = 110;
const GAP = 70;
const WRAP = 1300;

/**
 * ③ 변이와 진화 — Shake it 계보 숲 (2026-11-20 사용자 결정, 설계안 ③)
 *   위 = 원본 재료, 아래로 갈수록 혼합 → 다시 혼합. 계보마다 영역으로 묶고 A · B · C
 *   시너지 = 혼합 글이 재료(평균)보다 더 받은 Thunder (게시 후 같은 기간, 대시보드 Shake it 탭과 같은 규칙)
 *   [분야를 넘는 혼합만] · [시너지 ○ 이상] → 조건에 맞는 혼합 글이 있는 계보만, 맞는 글은 진하게
 *   혼합 글은 놀이 영역이라 대중 상상 지표와 따로 본다 (원칙 3)
 */
export function LineageView({
  page,
  onSelect,
  selected,
  hit,
  onHitNote,
}: {
  page: PeriodKey;
  onSelect: (s: Selection | null) => void;
  selected: string | null;
  hit: GraphHit | null;
  /** 찾기 결과 안내 (검색 창 옆에 보임, 2026-11-20 사용자) */
  onHitNote: (note: string | null) => void;
}) {
  // 기간 · 분야 · 혼합 글은 이 그래프의 [설정]에서 (2026-11-20 사용자)
  const sc = useScope(page);
  const query = sc.query;
  const [cross, setCross] = useState(false);
  const [synergy, setSynergy] = useState("");
  const [trees, setTrees] = useState(12);
  const [data, setData] = useState<LineageOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // 시작점 찾기 (2026-11-20): 기술 · 욕망 → 그 태그가 붙은 상상이 든 계보만(그 점 강조), 상상 → 그 상상의 계보를 맨 앞에 · 고름
  const hitItem = hit?.kind === "imagination" ? Number(hit.id.slice(2)) : null;
  const qs = queryString(
    { ...query, blend: false },
    { cross: cross || null, min_synergy: synergy, trees, hit: hit && hit.kind !== "imagination" ? hit.id : null, item: hitItem },
  );
  const [hitIds, setHitIds] = useState<Set<number> | null>(null);
  useEffect(() => {
    setHitIds(null);
    if (!hit) return;
    if (hit.kind === "imagination") return setHitIds(new Set([Number(hit.id.slice(2))]));
    let alive = true;
    api<number[]>(`/api/admin/graph/find?${queryString({ ...query, blend: true }, { hit: hit.id })}`).then((ids) => alive && setHitIds(new Set(ids)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hit?.id, query.period, query.domain]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api<LineageOut>(`/api/admin/graph/lineage?${qs}`).then(
      (d) => alive && (setData(d), setLoading(false)),
      (e) => alive && (setError(e instanceof ApiError ? e.message : "불러오지 못했어요."), setLoading(false)),
    );
    return () => {
      alive = false;
    };
  }, [qs]);

  const lay = useMemo(() => (data ? place(data) : null), [data]);
  const byId = new Map((data?.nodes ?? []).map((n) => [n.id, n]));
  const hitMissing = hitItem !== null && data !== null && !byId.has(hitItem);
  // 검색 창 옆 결과 안내 (2026-11-20 사용자)
  const resultNote =
    !hit || !data
      ? null
      : hitItem !== null
        ? hitMissing
          ? "Shake it 재료로 쓰인 적 없음 (계보 없음)"
          : `계보 ${byId.get(hitItem)?.tree} 맨 앞에 표시`
        : `계보 ${data.trees.length}개 · 찾은 상상 = 보라 테두리`;
  useEffect(() => onHitNote(resultNote), [resultNote]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (hitItem === null || !data) return;
    const n = data.nodes.find((x) => x.id === hitItem);
    if (n) onSelect(nodeSel(n));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hitItem, data]);

  const nodeSel = (n: XLineageNode): Selection => ({
    id: `i:${n.id}`,
    kind: "quote",
    badge: n.kind === "blend" ? `Shake it 혼합 · ${n.depth}단계` : "원본 재료",
    heading: n.title,
    rows: [
      ["계보", n.tree],
      ...(n.kind === "blend" ? ([["조합 시너지", signed(n.synergy)], ["분야를 넘는 혼합", n.cross ? "예" : "아니요"]] as [string, string][]) : []),
    ],
    url: `/api/admin/graph/items/inspect?${queryString(query, { ids: n.id, kind: "quote", title: n.title })}`,
    ref: { view: "lineage", id: n.id, tree: n.tree },
  });
  const treeSel = (t: LineageTree): Selection => {
    const ids = (data?.nodes ?? []).filter((n) => n.tree === t.key).map((n) => n.id);
    return {
      id: `tree:${t.key}`,
      kind: "lineage",
      badge: "Shake it 계보",
      heading: `계보 ${t.key} — 혼합 ${t.blends}개 · ${t.depth}단계`,
      note: "재료 → 혼합 → 다시 혼합으로 이어진 상상 묶음이에요. 시너지는 혼합 글이 재료보다 더 받은 Thunder 예요.",
      rows: [
        ["최고 시너지", signed(t.best_synergy)],
        ["분야를 넘는 혼합", `${t.cross_blends}개`],
        ["Thunder 합", `${t.thunders}`],
      ],
      url: `/api/admin/graph/items/inspect?${queryString(query, { ids: ids.join(","), kind: "lineage", title: `계보 ${t.key}` })}`,
      ref: { view: "lineage", tree: t.key, cross, synergy },
    };
  };

  const xNodes: XNode[] = (data?.nodes ?? []).map((n) => {
    const p = lay?.pos.get(n.id) ?? { x: 0, y: 0 };
    const blend = n.kind === "blend";
    return {
      id: `i:${n.id}`,
      x: p.x,
      y: p.y,
      r: Math.min(16, 6 + Math.sqrt(n.thunders) * 1.4),
      fill: blend ? "var(--color-shake-from)" : n.domain ? DOMAIN_COLORS[n.domain] : "var(--viz-axis)",
      stroke: hitIds?.has(n.id) ? "var(--color-accent)" : blend && n.cross ? "var(--color-thunder)" : "var(--color-bg)",
      strokeWidth: hitIds?.has(n.id) ? 3 : blend && n.cross ? 2.5 : 1,
      opacity: blend ? (n.match ? 0.95 : 0.35) : 0.7,
      label: n.title,
      labelBelow: true,
      badge: blend && n.synergy !== null ? signed(n.synergy) : undefined,
      tip: (
        <>
          <b>{n.title.length > 30 ? `${n.title.slice(0, 30)}…` : n.title}</b>
          <TipRow label="종류" value={blend ? `Shake it 혼합 · ${n.depth}단계` : "원본 재료"} />
          <TipRow label="작성자" value={`@${n.author}`} />
          <TipRow label="분야" value={`${domainName(n.domain)}${n.domain2 ? ` × ${domainName(n.domain2)}` : ""}`} />
          <TipRow label="Thunder" value={n.thunders} />
          {blend ? <TipRow label="조합 시너지" value={signed(n.synergy)} /> : null}
          {blend && n.cross ? <TipRow label="" value="분야를 넘는 혼합 (재료 분야가 둘 이상)" /> : null}
        </>
      ),
    };
  });
  const xEdges: XEdge[] = (data?.edges ?? []).map(([p, c]) => ({
    id: `${p}>${c}`,
    source: `i:${p}`,
    target: `i:${c}`,
    width: 1.4,
    color: byId.get(c)?.match ? "var(--color-lineage-edge-active)" : "var(--color-lineage-edge)",
    opacity: byId.get(c)?.match ? 0.85 : 0.4,
    arrow: true,
  }));
  const areas: XArea[] = (data?.trees ?? []).flatMap((t) => {
    const box = lay?.box.get(t.key);
    if (!box) return [];
    const [x0, y0, x1, y1] = box;
    return [
      {
        id: `tree:${t.key}`,
        points: [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
        ],
        color: "var(--viz-axis)",
        label: `${t.key} · 혼합 ${t.blends} · 최고 ${signed(t.best_synergy)}`,
      },
    ];
  });

  return (
    <Panel
      wide
      title="변이와 진화 — Shake it 계보"
      hint={
        <>
          서로 다른 상상이 Shake it 으로 섞여 사람들의 Thunder 를 받은 "예상 밖 결합"을 찾아요. 위 = 원본 재료, 아래 = 혼합 · 다시 혼합. 숫자 = 조합 시너지(재료보다 더 받은 Thunder),{" "}
          <b>노란 테두리 = 분야를 넘는 혼합</b>. 혼합 글은 놀이 영역이라 대중 상상 지표와 따로 봐요.
          <StatusNote />
        </>
      }
      loading={loading}
      aside={
        <>
          <label className={styles.check}>
            <input type="checkbox" checked={cross} onChange={(e) => setCross(e.target.checked)} />
            분야를 넘는 혼합만
          </label>
          <SelectMenu value={synergy} options={SYNERGY} onChange={setSynergy} label="조합 시너지" />
        </>
      }
      changed={sc.changed || trees !== 12}
      onReset={() => (setTrees(12), sc.reset())}
      settings={
        <>
          <ScopeSettings s={sc} page={page} blend={false} />
          <ChoiceSetting label="계보 수" options={[6, 12, 24, 40].map((k) => ({ key: k, label: `${k}개` }))} value={trees} onChange={setTrees} />
        </>
      }
    >
      {error ? <p className={styles.error}>{error}</p> : null}
      {data && !data.nodes.length ? <p className={styles.emptyLine}>조건에 맞는 혼합 글이 없어요. 거르기를 풀어 보세요.</p> : null}
      {data && data.nodes.length && lay ? (
        <>
          <Legend
            items={[
              { label: "원본 재료 (분야 색)", color: "var(--viz-1)" },
              { label: "Shake it 혼합", color: "var(--color-shake-from)" },
              { label: "분야를 넘는 혼합 (노란 테두리)", color: "var(--color-thunder)" },
              { label: "재료 → 혼합", color: "var(--color-lineage-edge)", shape: "line" },
            ]}
          />
          <XCanvas
            nodes={xNodes}
            edges={xEdges}
            areas={areas}
            height={Math.min(900, Math.max(380, lay.height * 0.75))}
            onBackground={() => onSelect(null)}
            selected={selected}
            keepRatio
            onNode={(id) => {
              const n = byId.get(Number(id.slice(2)));
              if (n) onSelect(nodeSel(n));
            }}
            onArea={(id) => {
              const t = data.trees.find((x) => `tree:${x.key}` === id);
              if (t) onSelect(treeSel(t));
            }}
            ariaLabel="Shake it 계보 숲"
            pad={[30, 40]}
          />
          <p className={styles.caption}>
            조건에 맞는 혼합 글 {data.blends_total}개 · 보이는 계보 {data.trees.length}개 (시너지가 큰 순)
          </p>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>계보</th>
                  <th>상상</th>
                  <th>혼합</th>
                  <th>단계</th>
                  <th>최고 시너지</th>
                  <th>분야를 넘는 혼합</th>
                  <th>Thunder 합</th>
                </tr>
              </thead>
              <tbody>
                {data.trees.map((t) => (
                  <tr key={t.key} className={clsx(styles.row, selected === `tree:${t.key}` && styles.rowOn)} onClick={() => onSelect(treeSel(t))}>
                    <td>
                      <span className={styles.zoneKey}>{t.key}</span>
                    </td>
                    <td>{t.size}</td>
                    <td>{t.blends}</td>
                    <td>{t.depth}</td>
                    <td>{signed(t.best_synergy)}</td>
                    <td>{t.cross_blends}</td>
                    <td>{t.thunders}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </Panel>
  );
}

/** 자리 잡기 — 계보마다 단계(깊이)별 줄, 줄 안에서는 재료 자리의 평균 순. 계보는 왼쪽부터 놓고 넘치면 다음 줄 */
function place(data: LineageOut) {
  const pos = new Map<number, { x: number; y: number }>();
  const box = new Map<string, [number, number, number, number]>();
  const parents = new Map<number, number[]>();
  for (const [p, c] of data.edges) parents.set(c, [...(parents.get(c) ?? []), p]);
  let cx = 0;
  let cy = 0;
  let rowH = 0;
  for (const t of data.trees) {
    const members = data.nodes.filter((n) => n.tree === t.key);
    const layers: XLineageNode[][] = [];
    for (const n of members) (layers[n.depth] ??= []).push(n);
    const widest = Math.max(...layers.map((l) => l?.length ?? 0));
    const w = Math.max(1, widest) * COL;
    const h = layers.length * ROW;
    if (cx > 0 && cx + w > WRAP) {
      cx = 0;
      cy += rowH + GAP;
      rowH = 0;
    }
    layers.forEach((layer, depth) => {
      if (!layer) return;
      const want = (n: XLineageNode) => {
        const ps = (parents.get(n.id) ?? []).map((p) => pos.get(p)?.x).filter((x): x is number => x !== undefined);
        return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : n.id;
      };
      const ordered = depth === 0 ? [...layer].sort((a, b) => a.id - b.id) : [...layer].sort((a, b) => want(a) - want(b));
      const off = (w - ordered.length * COL) / 2;
      ordered.forEach((n, i) => pos.set(n.id, { x: cx + off + i * COL + COL / 2, y: cy + depth * ROW + ROW / 2 }));
    });
    box.set(t.key, [cx + 6, cy + 8, cx + w - 6, cy + h - 4]);
    cx += w + GAP;
    rowH = Math.max(rowH, h);
  }
  return { pos, box, height: cy + rowH };
}
