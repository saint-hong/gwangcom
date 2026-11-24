import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../../../api/client";
import { Legend, TipRow, fmt } from "../../../components/charts/core";
import type { FusionEdge, FusionNode, FusionOut, PeriodKey } from "../../../types/api";
import { Panel, SIGNAL, pct } from "../dashboard/parts";
import { ChoiceSetting } from "../dashboard/settings";
import { domainName, queryString, type GraphQuery, type Selection } from "./explorer";
import { ScopeSettings, useScope } from "./Scope";
import styles from "./Graph.module.css";
import { StatusNote } from "./Status";
import { XCanvas, type XEdge, type XNode } from "./XCanvas";

type Lines = "all" | "desire" | "tech";
const DEFAULTS = { techs: 12, desires: 8, lines: "all" as Lines, desireMin: 0.88 };

const EDGE_LABEL: Record<FusionEdge["kind"], string> = { desire: "기술 × 욕망", collision: "기술 충돌", combo: "기술 조합" };
const EDGE_COLOR: Record<FusionEdge["kind"], string> = { desire: "var(--viz-axis)", collision: "var(--color-thunder)", combo: "var(--viz-tech)" };
const radius = (n: FusionNode) => Math.min(22, 6 + Math.sqrt(n.count) * 1.6);

/**
 * ① 융합과 충돌 — 기술(보라) × 욕망 묶음(주황) 2부 그래프 (2026-11-20 사용자 결정, 설계안 ①)
 *   가운데 줄 = 욕망 묶음, 양옆 = 기술. 선 굵기 = 함께 나온 상상 수
 *   노란 선 = 기술 충돌(대표 분야가 다른 두 기술이 상상 2개 이상에 함께), 보라 점선 = 같은 분야 기술 조합
 *   점 · 선을 누르면 오른쪽에 수치 + 원문, 점을 두 번 누르면 아직 안 보이는 이웃(2단계)을 펼친다
 */
export function FusionView({ page, focus, onSelect, selected }: { page: PeriodKey; focus: string | null; onSelect: (s: Selection | null) => void; selected: string | null }) {
  // 기간 · 분야 · 혼합 글은 이 그래프의 [설정]에서 (2026-11-20 사용자)
  const sc = useScope(page);
  const query = sc.query;
  const [set, setSet] = useState(DEFAULTS);
  const [data, setData] = useState<FusionOut | null>(null);
  const [extra, setExtra] = useState<FusionOut>({ nodes: [], edges: [], total: 0, clustered: false });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // 욕망 묶기 기준도 상세 · 펼치기 요청에 함께 보낸다 (같은 묶음으로 보이게)
  const qs = queryString(query, { desire_min: set.desireMin });

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api<FusionOut>(`/api/admin/graph/fusion?${qs}&${new URLSearchParams({ techs: String(set.techs), desires: String(set.desires), ...(focus ? { focus } : {}) })}`).then(
      (d) => {
        if (!alive) return;
        setData(d);
        setExtra({ nodes: [], edges: [], total: 0, clustered: false });
        setLoading(false);
        if (d.focus) {
          const n = d.nodes.find((x) => x.id === d.focus);
          if (n) onSelect(nodeSelection(n, qs, query, d.nodes.map((m) => m.id)));
        }
      },
      (e) => alive && (setError(e instanceof ApiError ? e.message : "불러오지 못했어요."), setLoading(false)),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qs, set.techs, set.desires, focus]);

  const nodes = useMemo(() => [...(data?.nodes ?? []), ...extra.nodes.filter((n) => !data?.nodes.some((m) => m.id === n.id))], [data, extra]);
  const edges = useMemo(() => {
    const seen = new Set<string>();
    return [...(data?.edges ?? []), ...extra.edges].filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      if (set.lines === "desire") return e.kind === "desire";
      if (set.lines === "tech") return e.kind !== "desire";
      return true;
    });
  }, [data, extra, set.lines]);

  const layout = useMemo(() => place(nodes, edges), [nodes, edges]);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const expand = async (id: string) => {
    try {
      const more = await api<FusionOut>(`/api/admin/graph/fusion/expand?${qs}&${new URLSearchParams({ node: id, shown: nodes.map((n) => n.id).join(",") })}`);
      if (!more.nodes.length) return;
      setExtra((prev) => ({ ...prev, nodes: [...prev.nodes, ...more.nodes], edges: [...prev.edges, ...more.edges] }));
      // 펼친 뒤 상세를 다시 읽어 숨은 이웃 수를 맞춘다
      const n = byId.get(id);
      if (n) onSelect(nodeSelection(n, qs, query, [...nodes.map((m) => m.id), ...more.nodes.map((m) => m.id)]));
    } catch {
      /* 펼칠 이웃이 없으면 그대로 */
    }
  };

  const xNodes: XNode[] = nodes.map((n) => {
    const p = layout.get(n.id) ?? { x: 0, y: 0 };
    return {
      id: n.id,
      x: p.x,
      y: p.y,
      r: radius(n),
      fill: n.kind === "tech" ? "var(--viz-tech)" : "var(--viz-desire)",
      dash: n.extra,
      stroke: n.extra ? "var(--color-text-secondary)" : undefined,
      strokeWidth: n.extra ? 1.5 : 1,
      opacity: n.extra ? 0.6 : 0.85,
      label: n.kind === "tech" ? `#${n.label}` : n.label,
      labelAlways: true,
      tip: (
        <>
          <b>{n.kind === "tech" ? `#${n.label}` : `욕망 묶음 · ${n.label}`}</b>
          <TipRow label="상상" value={`${n.count}개`} />
          <TipRow label="평균 Thunder" value={fmt(n.thunder_avg, 1)} />
          {n.domain ? <TipRow label="대표 분야" value={domainName(n.domain)} /> : null}
          <TipRow label="흐름" value={`${SIGNAL[n.trend.signal].label} ${n.trend.growth !== null ? pct(n.trend.growth) : ""}`} />
          {n.members.length > 1 ? <TipRow label="묶인 욕망" value={n.members.slice(0, 3).map((m) => m.label).join(" · ")} /> : null}
        </>
      ),
    };
  });
  const xEdges: XEdge[] = edges.map((e) => {
    const a = layout.get(e.source);
    const b = layout.get(e.target);
    const sameCol = a && b && Math.abs(a.x - b.x) < 1;
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      width: 0.8 + Math.sqrt(e.weight) * (e.kind === "collision" ? 0.9 : 0.6),
      color: EDGE_COLOR[e.kind],
      dash: e.kind === "combo" || e.extra,
      opacity: e.kind === "desire" ? 0.35 : 0.6,
      bend: e.kind === "desire" ? 0 : sameCol ? (a!.x < 500 ? -1 : 1) : 0.3,
      tip: (
        <>
          <b>
            {e.kind === "collision" ? "⚡ " : ""}
            {EDGE_LABEL[e.kind]}: {label(byId.get(e.source))} × {label(byId.get(e.target))}
          </b>
          <TipRow label="함께 나온 상상" value={`${e.weight}개 · 상위 ${Math.max(1, Math.round(e.rank_pct * 100))}%`} />
          <TipRow label="흐름" value={`${SIGNAL[e.trend.signal].label} ${e.trend.growth !== null ? pct(e.trend.growth) : ""}`} />
        </>
      ),
    };
  });

  // 점 한 번 누르기 = 주요 관계 보기 (그 점의 선만 켜지고 상세가 열림)
  const pick = (id: string) => {
    const n = byId.get(id);
    if (n) onSelect(nodeSelection(n, qs, query, nodes.map((m) => m.id)));
  };

  const selectEdge = (id: string) => {
    const e = edges.find((x) => x.id === id);
    if (!e) return;
    const a = byId.get(e.source);
    const b = byId.get(e.target);
    onSelect({
      id,
      kind: e.kind === "collision" ? "collision" : "fusion",
      badge: e.kind === "collision" ? "⚡ 기술 충돌" : EDGE_LABEL[e.kind],
      heading: `${label(a)} × ${label(b)}`,
      note:
        e.kind === "collision"
          ? `대표 분야가 다른 두 기술(${domainName(a?.domain)} · ${domainName(b?.domain)})이 같은 상상에 함께 나왔어요. 붕괴 신호인지는 원문을 보고 판단하세요.`
          : e.kind === "combo"
            ? "같은 분야의 두 기술이 같은 상상에 함께 나왔어요."
            : "이 기술과 이 욕망이 함께 나온 상상이에요.",
      url: `/api/admin/graph/fusion/inspect?${qs}&${new URLSearchParams({ a: e.source, b: e.target })}`,
      ref: { view: "fusion", a: e.source, b: e.target, ...query },
    });
  };

  return (
    <Panel
      wide
      title="융합과 충돌 — 기술 × 욕망"
      hint={
        <>
          욕망 클러스터를 매개로 서로 다른 기술간의 융합과 충돌 경향을 시각화한 그래프 (보라색 노드 : 기술, 오렌지색 노드 : 의미가 비슷한 욕망 묶음(
          {set.desireMin >= 1 ? "묶지 않음" : `유사도 ${set.desireMin}이상`}), 선 굵기 : 상상의 수, 주황색 선 : 기술 충돌 선), 노드 클릭시 요약 정보 상자에서 주요 관계 / 숨은 이웃 관계 선택 가능
          <StatusNote />
        </>
      }
      loading={loading}
      aside={
        extra.nodes.length ? (
          <button type="button" className={styles.smallBtn} onClick={() => setExtra({ nodes: [], edges: [], total: 0, clustered: false })}>
            펼친 점 {extra.nodes.length}개 지우기
          </button>
        ) : null
      }
      changed={sc.changed || set.techs !== DEFAULTS.techs || set.desires !== DEFAULTS.desires || set.lines !== DEFAULTS.lines || set.desireMin !== DEFAULTS.desireMin}
      onReset={() => (setSet(DEFAULTS), sc.reset())}
      settings={
        <>
          <ScopeSettings s={sc} page={page} />
          <ChoiceSetting label="기술" options={[8, 12, 20, 30].map((k) => ({ key: k, label: `${k}개` }))} value={set.techs} onChange={(v) => setSet({ ...set, techs: v })} />
          <ChoiceSetting label="욕망 묶음" options={[5, 8, 12, 20].map((k) => ({ key: k, label: `${k}개` }))} value={set.desires} onChange={(v) => setSet({ ...set, desires: v })} />
          <ChoiceSetting
            label="욕망 묶기 기준"
            options={[
              { key: 0.85, label: "0.85 (넓게)" },
              { key: 0.88, label: "0.88 (기본)" },
              { key: 0.9, label: "0.9 (같은 뜻만)" },
              { key: 1, label: "묶지 않음" },
            ]}
            value={set.desireMin}
            onChange={(v) => setSet({ ...set, desireMin: v })}
          />
          <ChoiceSetting
            label="선"
            options={[
              { key: "all" as Lines, label: "모두" },
              { key: "desire" as Lines, label: "기술 × 욕망만" },
              { key: "tech" as Lines, label: "기술 충돌 · 조합만" },
            ]}
            value={set.lines}
            onChange={(v) => setSet({ ...set, lines: v })}
          />
        </>
      }
    >
      {error ? <p className={styles.error}>{error}</p> : null}
      {data && !nodes.length ? <p className={styles.emptyLine}>이 기간 · 분야에는 상상 2개 이상에 쓰인 기술 · 욕망이 없어요.</p> : null}
      {nodes.length ? (
        <>
          <Legend
            items={[
              { label: "기술", color: "var(--viz-tech)" },
              { label: "욕망 묶음", color: "var(--viz-desire)" },
              { label: "기술 × 욕망", color: "var(--viz-axis)", shape: "line" },
              { label: "⚡ 기술 충돌 (분야가 다름)", color: "var(--color-thunder)", shape: "line" },
              { label: "기술 조합 (같은 분야)", color: "var(--viz-tech)", shape: "line" },
            ]}
          />
          <XCanvas
            nodes={xNodes}
            edges={xEdges}
            height={Math.max(640, layout.rows * 74 + 80)}
            onBackground={() => onSelect(null)}
            selected={selected}
            onNode={pick}
            onNodeDouble={(id) => void expand(id)}
            nodeMenu={[
              { label: "주요 관계", onPick: pick },
              { label: "숨은 이웃 관계", onPick: (id) => (pick(id), void expand(id)) },
            ]}
            onReset={() => setExtra({ nodes: [], edges: [], total: 0, clustered: false })}
            onEdge={selectEdge}
            ariaLabel="기술과 욕망 묶음 연결 그래프"
            pad={[110, 30]}
          />
          <p className={styles.caption}>
            거른 상상 {data?.total.toLocaleString()}개 · 기술 {nodes.filter((n) => n.kind === "tech").length} · 욕망 묶음 {nodes.filter((n) => n.kind === "desire").length} · 선 {edges.length} (기술 충돌{" "}
            {edges.filter((e) => e.kind === "collision").length})
          </p>
        </>
      ) : null}
    </Panel>
  );
}

const label = (n: FusionNode | undefined) => (n ? (n.kind === "tech" ? `#${n.label}` : n.label) : "?");

function nodeSelection(n: FusionNode, qs: string, query?: GraphQuery, shown: string[] = []): Selection {
  return {
    id: n.id,
    kind: n.kind === "tech" ? "tech" : "desire",
    badge: n.kind === "tech" ? "기술" : "욕망 묶음",
    heading: label(n),
    note: n.kind === "desire" && n.members.length > 1 ? `뜻이 가까운 욕망 태그 ${n.members.length}개를 묶었어요 (이름 = 가장 많이 쓰인 태그).` : undefined,
    // shown = 지금 그림의 점 → 상세의 "숨은 이웃" 수
    url: `/api/admin/graph/fusion/inspect?${qs}&${new URLSearchParams({ a: n.id, shown: shown.join(",") })}`,
    ref: { view: "fusion", a: n.id, ...(query ?? {}) },
  };
}

/** 자리 잡기 — 욕망 묶음은 가운데 줄, 기술은 양옆 줄(많은 순으로 번갈아), 펼친 점은 바깥 줄. 줄 안에서는 이어진 욕망 높이 순 */
function place(nodes: FusionNode[], edges: FusionEdge[]): Map<string, { x: number; y: number }> & { rows: number } {
  const out = new Map<string, { x: number; y: number }>() as Map<string, { x: number; y: number }> & { rows: number };
  const desires = nodes.filter((n) => n.kind === "desire" && !n.extra).sort((a, b) => b.count - a.count);
  const techs = nodes.filter((n) => n.kind === "tech" && !n.extra).sort((a, b) => b.count - a.count);
  const extras = nodes.filter((n) => n.extra);
  const rows = Math.max(desires.length, Math.ceil(techs.length / 2), Math.ceil(extras.length / 2), 4);
  out.rows = rows;
  const H = rows * 46;
  const spread = (list: FusionNode[], x: number) => list.forEach((n, i) => out.set(n.id, { x, y: list.length === 1 ? H / 2 : (i * H) / Math.max(1, list.length - 1) }));
  // 욕망: 큰 묶음을 가운데에 (가운데 → 위 · 아래 번갈아)
  const mid: FusionNode[] = [];
  desires.forEach((d, i) => (i % 2 ? mid.push(d) : mid.unshift(d)));
  spread(mid, 500);
  const want = (n: FusionNode) => {
    let sum = 0;
    let w = 0;
    for (const e of edges) {
      const other = e.source === n.id ? e.target : e.target === n.id ? e.source : null;
      const p = other ? out.get(other) : undefined;
      if (p && other?.startsWith("d:")) {
        sum += p.y * e.weight;
        w += e.weight;
      }
    }
    return w ? sum / w : H / 2;
  };
  const left: FusionNode[] = [];
  const right: FusionNode[] = [];
  techs.forEach((t, i) => (i % 2 ? right : left).push(t));
  spread([...left].sort((a, b) => want(a) - want(b)), 160);
  spread([...right].sort((a, b) => want(a) - want(b)), 840);
  const xl: FusionNode[] = [];
  const xr: FusionNode[] = [];
  for (const n of extras) {
    const nb = edges.find((e) => e.source === n.id || e.target === n.id);
    const other = nb ? (nb.source === n.id ? nb.target : nb.source) : null;
    const p = other ? out.get(other) : undefined;
    (p && p.x > 500 ? xr : xl).push(n);
  }
  spread(xl, -120);
  spread(xr, 1120);
  return out;
}
