import clsx from "clsx";
import { Waves } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../../../api/client";
import { Legend, TipRow, fmt } from "../../../components/charts/core";
import type { CascadeNode, CascadeOut, CascadeSummary, GraphHit, PeriodKey } from "../../../types/api";
import { shortDate } from "../adminFormat";
import { Panel } from "../dashboard/parts";
import { domainName, queryString, type Selection } from "./explorer";
import { ScopeSettings, useScope } from "./Scope";
import styles from "./Graph.module.css";
import { StatusNote } from "./Status";
import { XCanvas, type XEdge, type XNode } from "./XCanvas";

const ROLE: Record<CascadeNode["role"], { label: string; color: string; hint: string }> = {
  origin: { label: "최초 발화자", color: "var(--color-accent)", hint: "상상을 쓴 사람" },
  hub: { label: "핵심 전파자", color: "var(--color-thunder)", hint: "이 사람의 Wave 를 보고 2명 이상이 다시 Wave" },
  spreader: { label: "전파자", color: "var(--viz-1)", hint: "이 사람의 Wave 를 보고 1명이 다시 Wave" },
  leaf: { label: "도착", color: "var(--viz-axis)", hint: "여기서 더 퍼지지 않음" },
};

/**
 * ④ 전파와 공명 — Wave 확산 경로 (2026-11-20 사용자 결정, 설계안 ④)
 *   왼쪽 목록 = Wave 가 있는 상상 (깊이 → 다른 사람을 거친 Wave 순), 오른쪽 = 고른 상상의 확산 나무
 *   나무: 맨 위 = 작성자, 아래 = Wave 한 사람. 선 = 누구의 Wave 를 보고 Wave 했는지(via), via 가 없으면 작성자 글을 직접 보고 한 Wave
 *   점 크기 = 그 사람을 거쳐 퍼진 Wave 수, 색 = 역할, 분홍 테두리 = 이 상상을 재료로 Shake it 한 사람
 */
export function CascadeView({
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
  const [list, setList] = useState<CascadeSummary[] | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [data, setData] = useState<CascadeOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 시작점 찾기 (2026-11-20): 기술 · 욕망 → 목록을 그 태그가 붙은 상상만, 상상 → 그 상상의 확산 나무를 바로
  const hitItem = hit?.kind === "imagination" ? Number(hit.id.slice(2)) : null;
  const qs = queryString(query, { hit: hit && hit.kind !== "imagination" ? hit.id : null });
  useEffect(() => {
    if (hitItem !== null) setPick(hitItem);
  }, [hitItem]);

  useEffect(() => {
    let alive = true;
    setError(null);
    api<CascadeSummary[]>(`/api/admin/graph/cascades?${qs}`).then(
      (d) => {
        if (!alive) return;
        setList(d);
        setPick((p) => (hitItem !== null ? hitItem : p && d.some((c) => c.id === p) ? p : (d[0]?.id ?? null)));
      },
      (e) => alive && setError(e instanceof ApiError ? e.message : "불러오지 못했어요."),
    );
    return () => {
      alive = false;
    };
  }, [qs]);

  useEffect(() => {
    if (pick === null) return setData(null);
    let alive = true;
    api<CascadeOut>(`/api/admin/graph/cascade/${pick}`).then(
      (d) => alive && setData(d),
      (e) => alive && setError(e instanceof ApiError ? e.message : "불러오지 못했어요."),
    );
    return () => {
      alive = false;
    };
  }, [pick]);

  // 검색 창 옆 결과 안내 (2026-11-20 사용자)
  const resultNote = !hit
    ? null
    : hitItem !== null
      ? data && data.item.id === hitItem
        ? data.total_waves === 0
          ? "아직 Wave 없음 (확산 경로 없음)"
          : `Wave ${data.total_waves}번 · ${data.depth}단계 확산 나무 표시`
        : null
      : list
        ? `확산 경로 ${list.length}개`
        : null;
  useEffect(() => onHitNote(resultNote), [resultNote]); // eslint-disable-line react-hooks/exhaustive-deps
  const pos = useMemo(() => (data ? place(data.nodes) : new Map<string, { x: number; y: number }>()), [data]);
  const byId = new Map((data?.nodes ?? []).map((n) => [n.id, n]));

  const wholeSel = (d: CascadeOut): Selection => {
    const origin = d.nodes[0];
    return {
      id: "cascade",
      kind: "cascade",
      badge: "확산 경로",
      heading: `「${d.item.title}」의 확산 경로`,
      rows: [
        ["전체 Wave", `${d.total_waves}번`],
        ["다른 사람을 거친 Wave", `${d.via_waves}번`],
        ["가장 깊은 단계", `${d.depth}단계`],
        ["핵심 전파자", `${d.hubs}명`],
      ],
      items: [d.item],
      pin: {
        kind: "cascade",
        title: `「${d.item.title}」의 확산 경로`,
        summary: `@${origin?.nickname} 의 상상이 Wave ${d.total_waves}번 퍼졌고, 그중 ${d.via_waves}번은 다른 사람의 Wave 를 거쳤어요 (최대 ${d.depth}단계, 핵심 전파자 ${d.hubs}명).`,
        stat: `Thunder ${d.item.thunders} · Wave ${d.item.waves} · ${domainName(d.item.domain)}`,
        ref: { view: "cascade", id: d.item.id, count: 1, ids: [d.item.id] },
      },
      ref: { view: "cascade", id: d.item.id },
    };
  };
  const nodeSel = (n: CascadeNode, d: CascadeOut): Selection => ({
    id: n.id,
    kind: "cascade",
    badge: `확산 경로 · ${ROLE[n.role].label}`,
    heading: `@${n.nickname}`,
    note: ROLE[n.role].hint,
    rows: [
      ["단계", `${n.depth}단계`],
      ["거쳐 퍼진 Wave", `${n.downstream}번 (전체의 ${fmt(n.share * 100)}%)`],
      ["닿은 Thunder", `${n.reached_thunders}개`],
      ["Thunder 줌", n.thundered ? "예" : "아니요"],
      ["Shake it 재료로 씀", n.shaker ? "예" : "아니요"],
      ...(n.at ? ([["Wave 한 때", shortDate(n.at)]] as [string, string][]) : []),
    ],
    items: [d.item],
    pin: {
      kind: "cascade",
      title: `「${d.item.title}」 확산 — @${n.nickname} (${ROLE[n.role].label})`,
      summary: `@${n.nickname} 를 거쳐 Wave ${n.downstream}번이 더 퍼졌어요 (전체 ${d.total_waves}번 중 ${fmt(n.share * 100)}%, ${n.depth}단계).${n.shaker ? " 이 사람은 이 상상을 재료로 Shake it 도 했어요." : ""}`,
      stat: `닿은 Thunder ${n.reached_thunders} · 전체 Wave ${d.total_waves}`,
      ref: { view: "cascade", id: d.item.id, user: n.user_id, count: 1, ids: [d.item.id] },
    },
    ref: { view: "cascade", id: d.item.id, user: n.user_id },
  });

  const xNodes: XNode[] = (data?.nodes ?? []).map((n) => {
    const p = pos.get(n.id) ?? { x: 0, y: 0 };
    return {
      id: n.id,
      x: p.x,
      y: p.y,
      r: Math.min(22, 8 + Math.sqrt(n.downstream) * 4),
      fill: ROLE[n.role].color,
      stroke: n.shaker ? "var(--color-shake-from)" : undefined,
      strokeWidth: n.shaker ? 3 : 1,
      label: `@${n.nickname}`,
      labelAlways: true,
      labelBelow: true,
      badge: n.thundered ? "⚡" : undefined,
      tip: (
        <>
          <b>@{n.nickname}</b>
          <TipRow label="역할" value={ROLE[n.role].label} />
          <TipRow label="거쳐 퍼진 Wave" value={`${n.downstream}번`} />
          <TipRow label="닿은 Thunder" value={n.reached_thunders} />
          {n.shaker ? <TipRow label="" value="이 상상을 재료로 Shake it" /> : null}
        </>
      ),
    };
  });
  const xEdges: XEdge[] = (data?.nodes ?? [])
    .filter((n) => n.parent)
    .map((n) => ({
      id: `${n.parent}>${n.id}`,
      source: n.parent!,
      target: n.id,
      width: 1 + Math.sqrt(n.downstream + 1) * 1.2,
      color: n.depth >= 2 ? "var(--color-wave)" : "var(--viz-axis)",
      opacity: 0.7,
      arrow: true,
    }));

  return (
    <Panel
      wide
      title="전파와 공명 — Wave 확산 경로"
      hint={
        <>
          어떤 상상이 Thunder(호감)를 넘어 다른 사람에게 퍼지며(Wave) 커지는지 따라가요. 맨 위 = 작성자, 아래 = Wave 한 사람. 선 = 누구의 Wave 를 보고 Wave 했는지(via).{" "}
          <b>노란 점 = 핵심 전파자</b>(이 사람을 보고 2명 이상이 다시 Wave), ⚡ = Thunder 도 줌, 분홍 테두리 = 이 상상으로 Shake it.
          <StatusNote />
        </>
      }
      changed={sc.changed}
      onReset={sc.reset}
      settings={<ScopeSettings s={sc} page={page} />}
      aside={
        data ? (
          <button type="button" className={styles.smallBtn} onClick={() => onSelect(wholeSel(data))}>
            이 경로 전체 보기
          </button>
        ) : null
      }
    >
      {error ? <p className={styles.error}>{error}</p> : null}
      {list && !list.length ? <p className={styles.emptyLine}>이 기간 · 분야에는 Wave 가 있는 상상이 없어요.</p> : null}
      {list && list.length ? (
        <div className={styles.cascadeBody}>
          <ul className={styles.cascadeList} aria-label="확산 경로가 있는 상상">
            {list.map((c) => (
              <li key={c.id}>
                <button type="button" className={clsx(styles.cascadeItem, pick === c.id && styles.cascadeItemOn)} onClick={() => setPick(c.id)}>
                  <b>{c.title}</b>
                  <span>
                    @{c.author} · <Waves aria-hidden="true" /> {c.waves} · 거친 Wave {c.via_waves} · {c.depth}단계
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className={styles.cascadeCanvas}>
            {data ? (
              <>
                <Legend items={Object.values(ROLE).map((r) => ({ label: r.label, color: r.color }))} />
                <XCanvas
                  nodes={xNodes}
                  edges={xEdges}
                  height={Math.max(360, (data.depth + 1) * 110)}
                  onBackground={() => onSelect(null)}
                  selected={selected}
                  onNode={(id) => {
                    const n = byId.get(id);
                    if (n) onSelect(n.role === "origin" ? wholeSel(data) : nodeSel(n, data));
                  }}
                  ariaLabel="Wave 확산 나무"
                  pad={[60, 40]}
                  keepRatio
                />
                <p className={styles.caption}>
                  「{data.item.title}」 · 전체 Wave {data.total_waves} · 다른 사람을 거친 Wave {data.via_waves} · {data.depth}단계 · 핵심 전파자 {data.hubs}명
                </p>
              </>
            ) : (
              <p className={styles.emptyLine}>왼쪽에서 상상을 골라 주세요.</p>
            )}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

/** 나무 자리 — 잎은 왼쪽부터 차례로, 부모는 자식들 가운데, 단계마다 한 줄 */
function place(nodes: CascadeNode[]): Map<string, { x: number; y: number }> {
  const kids = new Map<string, string[]>();
  for (const n of nodes) if (n.parent) kids.set(n.parent, [...(kids.get(n.parent) ?? []), n.id]);
  const depth = new Map(nodes.map((n) => [n.id, n.depth]));
  const out = new Map<string, { x: number; y: number }>();
  let leaf = 0;
  const walk = (id: string): number => {
    const cs = kids.get(id) ?? [];
    const x = cs.length ? cs.map(walk).reduce((a, b) => a + b, 0) / cs.length : leaf++ * 120;
    out.set(id, { x, y: (depth.get(id) ?? 0) * 110 });
    return x;
  };
  const root = nodes.find((n) => !n.parent);
  if (root) walk(root.id);
  return out;
}
