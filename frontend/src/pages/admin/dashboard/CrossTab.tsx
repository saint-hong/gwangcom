import { useState } from "react";
import { Bars, Delta, Heatmap } from "../../../components/charts/basic";
import { DOMAIN_COLORS, TipRow, fmt } from "../../../components/charts/core";
import { Network, Sankey, clusterColor, type SankeyNode } from "../../../components/charts/relations";
import { SortHeader, type Sort, type SortOption } from "../SortHeader";
import adminStyles from "../Admin.module.css";
import type { AnCross, AnTech, PeriodKey } from "../../../types/api";
import styles from "./Dashboard.module.css";
import { Loading, Panel, downloadCsv, useAnalytics, ScrollBox } from "./parts";
import { ChoiceSetting, PeriodSetting, periodOf, useSettings, type PanelPeriod } from "./settings";
import { GroupPicker, PickSetting, TechPickSetting, type PickGroup, type PickItem } from "./TechPicker";

// 생키 색 (2026-11-15): 분야 = 분야 색, 가운데 기술 = 옅은 검정, 욕망 = 주황. 기술 → 욕망 띠는 회색 (분야 색 띠와 겹치지 않게)
const colorOf = (n: SankeyNode) => (n.column === 0 ? (DOMAIN_COLORS[n.id.slice(2)] ?? "var(--viz-1)") : n.column === 1 ? "var(--viz-flow-tech)" : "var(--viz-desire)");
const bandOf = (source: SankeyNode) => (source.column === 1 ? "var(--viz-flow-band)" : colorOf(source));

/**
 * 교차 분석 — 상상(분야) · 기술 · 욕망이 만나는 지점. 인사이트는 여기서 나온다
 *   ① 생키: 분야 → 기술 → 욕망 흐름  ② 네트워크: 기술 · 욕망 태그가 함께 나온 관계(군집)
 *   ③ 욕망 × 기술 표 (칸 = 함께 나온 상상 수, 툴팁에 Thunder)  ④ 기술 조합 순위 · 욕망 순위
 *   그래프마다 [설정 ▾]: 기간 · 기술 / 욕망 수 · 최소 연결 (2026-11-13). 수가 늘면 그림 높이도 늘어난다
 *   ① 생키는 2026-11-15 부터 기술 고르기(기본 상상 많은 10개) + 욕망은 고른 기술에서 저절로
 */
export function CrossTab({ period }: { period: PeriodKey }) {
  const { data, error } = useAnalytics<AnCross>("cross", period);
  if (!data) return <Loading error={error} />;
  return (
    <div className={styles.grid}>
      <p className={`${styles.lead} ${styles.wide}`}>
        상상의 <b>형태</b>(분야) · <b>수단</b>(기술) · <b>이유</b>(욕망)가 같은 상상 안에서 어떻게 만나는지 봐요. 자주 만나는 지점, 새로 생긴 연결, Thunder 가 몰린 조합이 기술 변화의 단서가 돼요. 욕망
        태그는 아직 문장 그대로 세요(비슷한 욕망 묶기는 Sprint 7).
      </p>
      <SankeyPanel page={period} />
      <NetworkPanel page={period} />
      <MatrixPanel page={period} />
      <PairsPanel page={period} />
      <DesiresPanel page={period} />
    </div>
  );
}

/** 기술을 고르지 않았을 때 보이는 기술 수 (상상 많은 순, 2026-11-15 "기술 수" 설정 대신) */
const SANKEY_TOP = 10;
/** 생키 높이: 줄(가장 긴 열의 상자 수)마다 44px, 적어도 560px. 보이는 높이는 CSS 에서 최대 680px, 넘으면 상하 스크롤 */
const SANKEY_ROW_H = 44;
const SANKEY_MIN_H = 560;

/**
 * ① 분야 → 기술 → 욕망 흐름 (2026-11-15 사용자 요청으로 바꿈)
 *   기술 = [기술 고르기 ▾](기술 흐름 탭과 같은 방식), 고르지 않으면 상상 많은 기술 10개
 *   욕망 = 고르지 않는다. 고른 기술에 이어진 욕망이 모두 저절로 나온다 (분야 · 기술 흐름에서 유도)
 *   분야 · 욕망 상자 크기 = 고른 기술과 이어진 띠의 합. 그림은 세로로 넉넉하게, 길어지면 상하 스크롤
 */
function SankeyPanel({ page }: { page: PeriodKey }) {
  const st = useSettings({ period: "page" as PanelPeriod, picked: [] as string[] });
  const pk = periodOf(page, st.v.period);
  const { data, loading } = useAnalytics<AnCross>("cross", pk);
  const tech = useAnalytics<AnTech>("tech", pk); // 기술 고르기 목록 (신호 그룹)
  if (!data) return null;
  const techs = tech.data?.techs ?? [];
  const ranked = data.sankey_nodes
    .filter((n) => n.column === 1)
    .sort((a, b) => b.value - a.value)
    .slice(0, SANKEY_TOP);
  const pickedLabels = techs.filter((t) => st.v.picked.includes(String(t.tag_id))).map((t) => t.label);
  const keepT = new Set(st.v.picked.length ? pickedLabels.map((l) => `t:${l}`) : ranked.map((n) => n.id));
  // 분야 → (고른 기술), (고른 기술) → 욕망 띠만 남긴다. 욕망은 여기서 이어진 것이 저절로 정해진다
  const links = data.sankey_links.filter((l) => keepT.has(l.source) || keepT.has(l.target));
  const flow = new Map<string, number>();
  for (const l of links) {
    flow.set(l.source, (flow.get(l.source) ?? 0) + l.value);
    flow.set(l.target, (flow.get(l.target) ?? 0) + l.value);
  }
  const used = new Set(links.flatMap((l) => [l.source, l.target]));
  const nodes = [0, 1, 2].flatMap((c) => {
    const col = data.sankey_nodes.filter((n) => n.column === c && used.has(n.id)).map((n) => (c === 1 ? n : { ...n, value: flow.get(n.id) ?? 0 }));
    return c === 2 ? col.sort((a, b) => b.value - a.value) : col; // 욕망은 띠 합이 큰 순
  });
  const rows = Math.max(...[0, 1, 2].map((c) => nodes.filter((n) => n.column === c).length), 1);
  const fallback = techs.filter((t) => keepT.has(`t:${t.label}`)).map((t) => String(t.tag_id));
  return (
    <Panel
      wide
      loading={loading || tech.loading}
      title="분야 → 기술 → 욕망 흐름"
      hint="분야별 상상에 사용된 기술과 욕망의 흐름 그래프 (선의 굵기는 상상의 수와 욕망의 수를 의미함)"
      changed={st.changed}
      onReset={st.reset}
      settings={
        <>
          <PeriodSetting page={page} value={st.v.period} onChange={(v) => st.set("period", v)} />
          <TechPickSetting
            techs={techs}
            picked={st.v.picked}
            fallback={fallback}
            emptyNote={`고르지 않으면 상상 많은 기술 ${SANKEY_TOP}개가 보여요. 욕망은 고른 기술에 이어진 것이 저절로 나와요`}
            onChange={(ids) => st.set("picked", ids)}
          />
        </>
      }
    >
      {links.length === 0 ? (
        <p className={styles.empty}>함께 나온 분야 · 기술 · 욕망이 아직 없어요.</p>
      ) : (
        <div className={styles.sankeyScroll} tabIndex={0} role="region" aria-label="스크롤할 수 있는 흐름 그래프">
          <div className={styles.wideInner}>
            <Sankey
              nodes={nodes}
              links={links}
              colorOf={colorOf}
              height={Math.max(SANKEY_MIN_H, rows * SANKEY_ROW_H)}
              valueText={(n) => (n.column === 1 ? `상상 ${n.value}개` : `이어진 띠 ${n.value}`)}
              bandColor={bandOf}
            />
          </div>
        </div>
      )}
    </Panel>
  );
}

/**
 * ② 기술 × 욕망 네트워크 (2026-11-15 사용자 요청으로 바꿈)
 *   기본 = 기술 · 욕망 모두. 군집(A · B · C …, 서버 Louvain)을 영역으로 그리고, 그림 위 군집 칩으로 한 군집을 활성화
 *   설정 = [기술 고르기] · [욕망 고르기] — 왼쪽 묶음이 군집이라, 군집 하나를 통째로 고르거나 그 안에서 골라 섞을 수 있다
 *   최소 연결은 없앰 — 함께 나온 횟수는 선 굵기 · 진하기로 보인다
 */
function NetworkPanel({ page }: { page: PeriodKey }) {
  const st = useSettings({ period: "page" as PanelPeriod, techs: [] as string[], desires: [] as string[] });
  const { data, loading } = useAnalytics<AnCross>("cross", periodOf(page, st.v.period));
  if (!data) return null;
  const all = data.net_nodes;
  const clusterNames = [...new Set(all.map((n) => n.cluster))].sort((a, b) => a.length - b.length || a.localeCompare(b));
  const pickGroups = (type: "tech" | "desire"): PickGroup[] =>
    clusterNames.filter((c) => all.some((n) => n.type === type && n.cluster === c)).map((c) => ({ key: c, label: `군집 ${c}`, color: clusterColor(c) }));
  const pickItems = (type: "tech" | "desire"): PickItem[] =>
    all
      .filter((n) => n.type === type)
      .map((n) => ({ id: n.id, label: type === "tech" ? `#${n.label}` : n.label, group: n.cluster, count: n.count, badge: <span className={styles.pickNote}>{n.cluster}</span> }));
  const keepT = new Set(st.v.techs);
  const keepX = new Set(st.v.desires);
  const nodes = all.filter((n) => (n.type === "tech" ? !keepT.size || keepT.has(n.id) : !keepX.size || keepX.has(n.id)));
  const shown = new Set(nodes.map((n) => n.id));
  const edges = data.net_edges.filter((e) => shown.has(e.source) && shown.has(e.target));
  const height = Math.max(600, Math.min(900, 380 + nodes.length * 7));
  const clusterOf = new Map(all.map((n) => [n.id, n.cluster]));
  const picker = (type: "tech" | "desire", picked: string[], key: "techs" | "desires") => (close: () => void) => (
    <GroupPicker
      groups={pickGroups(type)}
      items={pickItems(type)}
      initial={picked.length ? picked : all.filter((n) => n.type === type).map((n) => n.id)}
      help={`군집을 고른 뒤 ${type === "tech" ? "기술" : "욕망"}을 고르세요. 군집 하나를 통째로 고르려면 그 군집의 "모두"를 누르세요. 다른 군집으로 옮겨도 고른 것은 남아요.`}
      groupAria="군집"
      onApply={(ids) => st.set(key, ids.length === all.filter((n) => n.type === type).length ? [] : ids)}
      onClose={close}
    />
  );
  return (
    <Panel
      wide
      loading={loading}
      title="기술 × 욕망 네트워크"
      hint="상상 군집이 욕망과 연결된 네트워크 그래프 (원의 크기는 상상의 수)"
      csv={() =>
        downloadCsv(`태그_연결_${data.period.start}.csv`, [
          ["태그 1", "군집 1", "태그 2", "군집 2", "함께 나온 수"],
          ...edges.map((e) => [e.source.slice(2), clusterOf.get(e.source) ?? "", e.target.slice(2), clusterOf.get(e.target) ?? "", e.weight]),
        ])
      }
      changed={st.changed}
      onReset={st.reset}
      settings={
        <>
          <PeriodSetting page={page} value={st.v.period} onChange={(v) => st.set("period", v)} />
          <PickSetting label="기술 고르기" picked={st.v.techs} emptyNote="고르지 않으면 기술 모두가 보여요" onChange={(ids) => st.set("techs", ids)} picker={picker("tech", st.v.techs, "techs")} />
          <PickSetting label="욕망 고르기" picked={st.v.desires} emptyNote="고르지 않으면 욕망 모두가 보여요" onChange={(ids) => st.set("desires", ids)} picker={picker("desire", st.v.desires, "desires")} />
        </>
      }
    >
      {nodes.length === 0 ? <p className={styles.empty}>이 조건에 맞는 태그가 없어요.</p> : <Network key={`${nodes.length}-${edges.length}`} nodes={nodes} edges={edges} height={height} />}
    </Panel>
  );
}

/** 욕망 × 기술 표: 고르지 않았을 때 욕망 · 기술 각각 상상 많은 10개 (2026-11-15) */
const MATRIX_TOP = 10;

/**
 * ③ 욕망 × 기술 히트맵 (2026-11-15 사용자 요청으로 바꿈)
 *   설정 = [욕망 고르기] · [기술 고르기] (왼쪽 묶음 = 네트워크와 같은 군집 A · B · C), 고르지 않으면 각각 상상 많은 10개
 *   표가 넓거나 길면 가로 · 세로 스크롤 (욕망 이름 · 기술 이름 줄은 붙어 있음)
 */
function MatrixPanel({ page }: { page: PeriodKey }) {
  const st = useSettings({ period: "page" as PanelPeriod, desires: [] as string[], techs: [] as string[] });
  const { data, loading } = useAnalytics<AnCross>("cross", periodOf(page, st.v.period));
  if (!data) return null;
  const clusterOf = new Map(data.net_nodes.map((n) => [n.id, n.cluster]));
  const countOf = new Map(data.net_nodes.map((n) => [n.id, n.count]));
  // 표의 줄 · 칸 순서는 서버 순서(상상 많은 순) 그대로, 고른 것만 남긴다
  const ri = data.matrix_rows.map((_, i) => i).filter((i) => (st.v.desires.length ? st.v.desires.includes(`x:${data.matrix_rows[i]}`) : i < MATRIX_TOP));
  const ci = data.matrix_cols.map((_, i) => i).filter((i) => (st.v.techs.length ? st.v.techs.includes(`t:${data.matrix_cols[i]}`) : i < MATRIX_TOP));
  const rows = ri.map((i) => data.matrix_rows[i]);
  const cols = ci.map((i) => data.matrix_cols[i]);
  const cell = (r: number, c: number) => data.matrix[ri[r]][ci[c]];
  const groupsOf = (ids: string[]): PickGroup[] =>
    [...new Set(ids.map((id) => clusterOf.get(id) ?? ""))]
      .filter(Boolean)
      .sort((a, b) => a.length - b.length || a.localeCompare(b))
      .map((c) => ({ key: c, label: `군집 ${c}`, color: clusterColor(c) }));
  const picker = (kind: "desire" | "tech") => (close: () => void) => {
    const labels = kind === "desire" ? data.matrix_rows : data.matrix_cols;
    const ids = labels.map((l) => `${kind === "desire" ? "x" : "t"}:${l}`);
    const picked = kind === "desire" ? st.v.desires : st.v.techs;
    return (
      <GroupPicker
        groups={groupsOf(ids)}
        items={ids.map((id, i) => ({
          id,
          label: kind === "tech" ? `#${labels[i]}` : labels[i],
          group: clusterOf.get(id) ?? "",
          count: countOf.get(id) ?? 0,
          badge: <span className={styles.pickNote}>{clusterOf.get(id)}</span>,
        }))}
        initial={picked.length ? picked : ids.slice(0, MATRIX_TOP)}
        help={`군집을 고른 뒤 ${kind === "tech" ? "기술" : "욕망"}을 고르세요. 군집은 기술 × 욕망 네트워크와 같아요. 다른 군집으로 옮겨도 고른 것은 남아요.`}
        groupAria="군집"
        onApply={(v) => st.set(kind === "desire" ? "desires" : "techs", v)}
        onClose={close}
      />
    );
  };
  return (
    <Panel
      wide
      loading={loading}
      title="욕망 × 기술"
      hint="욕망과 기술이 함께 나온 상상의 수를 나타내는 히트맵 (진할 수록 상상의 수가 많음)"
      csv={() => downloadCsv(`욕망x기술_${data.period.start}.csv`, [["욕망 \\ 기술", ...cols], ...rows.map((r, i) => [r, ...cols.map((_, j) => cell(i, j).count)])])}
      changed={st.changed}
      onReset={st.reset}
      settings={
        <>
          <PeriodSetting page={page} value={st.v.period} onChange={(v) => st.set("period", v)} />
          <PickSetting label="욕망 고르기" picked={st.v.desires} emptyNote={`고르지 않으면 상상 많은 욕망 ${MATRIX_TOP}개가 보여요`} onChange={(ids) => st.set("desires", ids)} picker={picker("desire")} />
          <PickSetting label="기술 고르기" picked={st.v.techs} emptyNote={`고르지 않으면 상상 많은 기술 ${MATRIX_TOP}개가 보여요`} onChange={(ids) => st.set("techs", ids)} picker={picker("tech")} />
        </>
      }
    >
      {rows.length === 0 ? (
        <p className={styles.empty}>욕망과 기술이 함께 나온 상상이 아직 없어요.</p>
      ) : (
        <Heatmap
          rows={rows}
          cols={cols.map((c) => `#${c}`)}
          values={rows.map((_, i) => cols.map((_, j) => cell(i, j).count))}
          cell={40}
          rowWidth={120}
          maxHeight={520}
          rotateCols
          tip={(r, c) => (
            <>
              <b>
                {rows[r]} × #{cols[c]}
              </b>
              <TipRow label="함께 나온 상상" value={`${cell(r, c).count}개`} />
              <TipRow label="받은 Thunder" value={cell(r, c).thunders} />
            </>
          )}
        />
      )}
    </Panel>
  );
}

/**
 * ④ 기술 조합 순위 (2026-11-15 사용자 요청으로 바꿈)
 *   설정 = 조합(기술 2 · 3 · 4 … 개, 그 기간에 있는 가장 큰 조합까지) · 개수(5 · 10 · 15 · 20 · 전체). 기본 2개 · 10개
 *   오른쪽 = 상상 수 | Thunder (앞줄 맞춤) | 이전 기간 대비 (이전에 없던 조합은 "New")
 */
function PairsPanel({ page }: { page: PeriodKey }) {
  const st = useSettings({ period: "page" as PanelPeriod, size: 2, count: 10 });
  const { data, loading } = useAnalytics<AnCross>("cross", periodOf(page, st.v.period));
  if (!data) return null;
  const maxSize = Math.max(2, ...data.combos.map((c) => c.techs.length));
  const size = Math.min(st.v.size, maxSize);
  const ofSize = data.combos.filter((c) => c.techs.length === size);
  const combos = st.v.count > 0 ? ofSize.slice(0, st.v.count) : ofSize;
  return (
    <Panel
      wide
      loading={loading}
      title="기술 조합 순위"
      hint="상상에 기술이 여러개 사용된 조합의 수를 나타내는 그래프 (New 조합은 새로운 쓰임의 신호)"
      csv={() =>
        downloadCsv(`기술_조합_${size}개_${data.period.start}.csv`, [
          [...Array.from({ length: size }, (_, i) => `기술 ${i + 1}`), "상상 수", "이전 기간", "Thunder"],
          ...combos.map((x) => [...x.techs, x.count, x.prev, x.thunders]),
        ])
      }
      changed={st.changed}
      onReset={st.reset}
      settings={
        <>
          <PeriodSetting page={page} value={st.v.period} onChange={(v) => st.set("period", v)} />
          <ChoiceSetting
            label="조합"
            options={Array.from({ length: maxSize - 1 }, (_, i) => ({ key: i + 2, label: `${i + 2}개` }))}
            value={size}
            onChange={(v) => st.set("size", v)}
          />
          <ChoiceSetting
            label="개수"
            options={[
              { key: 5, label: "5개" },
              { key: 10, label: "10개" },
              { key: 15, label: "15개" },
              { key: 20, label: "20개" },
              { key: 0, label: "전체" },
            ]}
            value={st.v.count}
            onChange={(v) => st.set("count", v)}
          />
        </>
      }
    >
      {combos.length === 0 ? (
        <p className={styles.empty}>기술이 {size}개 이상 붙은 상상이 아직 없어요.</p>
      ) : (
        <Bars
          labelWidth={size > 2 ? 360 : 280}
          color="var(--viz-tech)"
          items={combos.map((x) => ({
            key: x.techs.join("|"),
            label: x.techs.map((t) => `#${t}`).join(" + "),
            value: x.count,
            note: (
              <span className={styles.comboNote}>
                <span>Thunder {x.thunders}</span>
                <span className={styles.comboDelta}>
                  <Delta cur={x.count} prev={x.prev} newLabel="New" />
                </span>
              </span>
            ),
          }))}
        />
      )}
    </Panel>
  );
}

/** 욕망 순위 테이블: 고르지 않았을 때 상상 많은 욕망 10개 (2026-11-15) */
const DESIRE_TOP = 10;
type DesireRow = AnCross["desires"][number];
const DESIRE_SORTS: Record<string, SortOption[]> = {
  count: [
    { key: "count", order: "desc", label: "상상 많은 순" },
    { key: "count", order: "asc", label: "상상 적은 순" },
  ],
  growth: [
    { key: "growth", order: "desc", label: "많이 는 순" },
    { key: "growth", order: "asc", label: "많이 준 순" },
  ],
  thunder_avg: [
    { key: "thunder_avg", order: "desc", label: "Thunder 평균 높은 순" },
    { key: "thunder_avg", order: "asc", label: "Thunder 평균 낮은 순" },
  ],
};
/** 이전 기간 대비 증감률. 이전에 없던 욕망(New)은 가장 크게, 비교할 이전 기간이 없으면 가장 작게 */
const desireGrowth = (d: DesireRow) => (d.prev === null ? -Infinity : d.prev === 0 ? (d.count > 0 ? Infinity : 0) : (d.count - d.prev) / d.prev);

/**
 * ⑤ 욕망 순위 테이블 (2026-11-15 사용자 요청으로 바꿈)
 *   설정 = [욕망 고르기] (왼쪽 묶음 = 네트워크와 같은 군집), 고르지 않으면 상상 많은 욕망 10개
 *   상상 · 이전 기간 대비 · Thunder 평균 머리글에서 높은 순 / 낮은 순 정렬 (기본 상상 많은 순)
 */
function DesiresPanel({ page }: { page: PeriodKey }) {
  const st = useSettings({ period: "page" as PanelPeriod, desires: [] as string[] });
  const [sort, setSort] = useState<Sort>({ key: "count", order: "desc" });
  const { data, loading } = useAnalytics<AnCross>("cross", periodOf(page, st.v.period));
  if (!data) return null;
  const clusterOf = new Map(data.net_nodes.map((n) => [n.id, n.cluster]));
  const base = st.v.desires.length ? data.desires.filter((d) => st.v.desires.includes(`x:${d.label}`)) : data.desires.slice(0, DESIRE_TOP);
  const val = (d: DesireRow) => (sort.key === "growth" ? desireGrowth(d) : sort.key === "thunder_avg" ? d.thunder_avg : d.count);
  const desires = [...base].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    const diff = x === y ? 0 : sort.order === "asc" ? (x < y ? -1 : 1) : x > y ? -1 : 1;
    return diff || b.count - a.count;
  });
  const ids = data.desires.map((d) => `x:${d.label}`);
  return (
    <Panel
      wide
      loading={loading}
      title="욕망 순위 테이블"
      hint="욕망의 순위를 보여주는 테이블 (Thunder 평균은 욕망에 대한 직접적인 호감도가 아닌 상상과 욕망에 대한 호감도)"
      csv={() =>
        downloadCsv(`욕망_순위_${data.period.start}.csv`, [
          ["욕망", "상상 수", "이전 기간", "Thunder 합", "Thunder 평균", "함께 나온 기술"],
          ...desires.map((d) => [d.label, d.count, d.prev, d.thunders, d.thunder_avg, d.techs.join(" | ")]),
        ])
      }
      changed={st.changed}
      onReset={st.reset}
      settings={
        <>
          <PeriodSetting page={page} value={st.v.period} onChange={(v) => st.set("period", v)} />
          <PickSetting
            label="욕망 고르기"
            picked={st.v.desires}
            emptyNote={`고르지 않으면 상상 많은 욕망 ${DESIRE_TOP}개가 보여요`}
            onChange={(v) => st.set("desires", v)}
            picker={(close) => (
              <GroupPicker
                groups={[...new Set(ids.map((id) => clusterOf.get(id) ?? ""))]
                  .filter(Boolean)
                  .sort((a, b) => a.length - b.length || a.localeCompare(b))
                  .map((c) => ({ key: c, label: `군집 ${c}`, color: clusterColor(c) }))}
                items={data.desires.map((d) => {
                  const id = `x:${d.label}`;
                  return { id, label: d.label, group: clusterOf.get(id) ?? "", count: d.count, badge: <span className={styles.pickNote}>{clusterOf.get(id)}</span> };
                })}
                initial={st.v.desires.length ? st.v.desires : ids.slice(0, DESIRE_TOP)}
                help="군집을 고른 뒤 욕망을 고르세요. 군집은 기술 × 욕망 네트워크와 같아요. 다른 군집으로 옮겨도 고른 것은 남아요."
                groupAria="군집"
                onApply={(v) => st.set("desires", v)}
                onClose={close}
              />
            )}
          />
        </>
      }
    >
      <ScrollBox min={760}>
        <table className={`${adminStyles.table} ${styles.dataTable}`}>
          <colgroup>
            <col style={{ width: 220 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 130 }} />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th>욕망</th>
              <th>
                <SortHeader label="상상" options={DESIRE_SORTS.count} value={sort} onChange={setSort} />
              </th>
              <th>
                <SortHeader label="이전 기간 대비" options={DESIRE_SORTS.growth} value={sort} onChange={setSort} />
              </th>
              <th>
                <SortHeader label="Thunder 평균" options={DESIRE_SORTS.thunder_avg} value={sort} onChange={setSort} />
              </th>
              <th>함께 나온 기술</th>
            </tr>
          </thead>
          <tbody>
            {desires.map((d) => (
              <tr key={d.label}>
                <td className={styles.left} title={d.label}>
                  {d.label}
                </td>
                <td className={styles.num}>{d.count}</td>
                <td className={styles.num}>{d.prev === null ? <span className={styles.muted}>—</span> : <Delta cur={d.count} prev={d.prev} newLabel="New" />}</td>
                <td className={styles.num}>{fmt(d.thunder_avg, 1)}</td>
                <td className={`${styles.left} ${styles.muted}`} title={d.techs.map((t) => `#${t}`).join(" ")}>
                  {d.techs.map((t) => `#${t}`).join(" ") || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollBox>
    </Panel>
  );
}
