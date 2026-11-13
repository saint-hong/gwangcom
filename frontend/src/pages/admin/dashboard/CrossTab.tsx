import { Bars, Delta, Heatmap } from "../../../components/charts/basic";
import { DOMAIN_COLORS, TipRow, fmt } from "../../../components/charts/core";
import { Network, Sankey, type SankeyNode } from "../../../components/charts/relations";
import adminStyles from "../Admin.module.css";
import type { AnCross, PeriodKey } from "../../../types/api";
import styles from "./Dashboard.module.css";
import { Loading, Panel, downloadCsv, useAnalytics, ScrollBox } from "./parts";
import { ChoiceSetting, CountSetting, PeriodSetting, periodOf, useSettings, type PanelPeriod } from "./settings";

const colorOf = (n: SankeyNode) => (n.column === 0 ? (DOMAIN_COLORS[n.id.slice(2)] ?? "var(--viz-1)") : n.column === 1 ? "var(--viz-tech)" : "var(--viz-desire)");

/** 큰 값 순으로 앞 n 개의 id */
function topIds<T extends { id: string }>(items: T[], n: number, value: (t: T) => number): Set<string> {
  return new Set(
    [...items]
      .sort((a, b) => value(b) - value(a))
      .slice(0, n)
      .map((t) => t.id),
  );
}

/**
 * 교차 분석 — 상상(분야) · 기술 · 욕망이 만나는 지점. 인사이트는 여기서 나온다
 *   ① 생키: 분야 → 기술 → 욕망 흐름  ② 네트워크: 기술 · 욕망 태그가 함께 나온 관계(군집)
 *   ③ 욕망 × 기술 표 (칸 = 함께 나온 상상 수, 툴팁에 Thunder)  ④ 기술 조합 순위 · 욕망 순위
 *   그래프마다 [설정 ▾]: 기간 · 기술 / 욕망 수 · 최소 연결 (2026-11-13). 수가 늘면 그림 높이도 늘어난다
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

function SankeyPanel({ page }: { page: PeriodKey }) {
  const st = useSettings({ period: "page" as PanelPeriod, techs: 10, desires: 8 });
  const { data, loading } = useAnalytics<AnCross>("cross", periodOf(page, st.v.period));
  if (!data) return null;
  const keepT = topIds(
    data.sankey_nodes.filter((n) => n.column === 1),
    st.v.techs,
    (n) => n.value,
  );
  const keepX = topIds(
    data.sankey_nodes.filter((n) => n.column === 2),
    st.v.desires,
    (n) => n.value,
  );
  const ok = (id: string) => (id.startsWith("t:") ? keepT.has(id) : id.startsWith("x:") ? keepX.has(id) : true);
  const links = data.sankey_links.filter((l) => ok(l.source) && ok(l.target));
  const used = new Set(links.flatMap((l) => [l.source, l.target]));
  const nodes = data.sankey_nodes.filter((n) => used.has(n.id));
  const rows = Math.max(...[0, 1, 2].map((c) => nodes.filter((n) => n.column === c).length), 1);
  return (
    <Panel
      wide
      loading={loading}
      title="분야 → 기술 → 욕망 흐름"
      hint={`왼쪽 분야에서 가운데 기술(상위 ${st.v.techs}), 오른쪽 욕망(상위 ${st.v.desires})으로 이어지는 띠예요. 굵을수록 같은 상상에 함께 나온 수가 많아요. 띠나 상자에 올리면 그 흐름만 진해져요.`}
      changed={st.changed}
      onReset={st.reset}
      settings={
        <>
          <PeriodSetting page={page} value={st.v.period} onChange={(v) => st.set("period", v)} />
          <CountSetting label="기술 수" options={[5, 10, 15, 20]} recommend={15} value={st.v.techs} onChange={(v) => st.set("techs", v)} why="띠가 얇아지고 이름이 겹칠 수 있어요" />
          <CountSetting label="욕망 수" options={[5, 8, 12, 15]} recommend={12} value={st.v.desires} onChange={(v) => st.set("desires", v)} why="띠가 얇아지고 이름이 겹칠 수 있어요" />
        </>
      }
    >
      {links.length === 0 ? (
        <p className={styles.empty}>함께 나온 분야 · 기술 · 욕망이 아직 없어요.</p>
      ) : (
        <div className={styles.wideScroll}>
          <div className={styles.wideInner}>
            <Sankey nodes={nodes} links={links} colorOf={colorOf} height={Math.max(320, Math.min(760, rows * 30))} />
          </div>
        </div>
      )}
    </Panel>
  );
}

function NetworkPanel({ page }: { page: PeriodKey }) {
  const st = useSettings({ period: "page" as PanelPeriod, techs: 30, desires: 15, min: 1 });
  const { data, loading } = useAnalytics<AnCross>("cross", periodOf(page, st.v.period));
  if (!data) return null;
  const keep = new Set([
    ...topIds(
      data.net_nodes.filter((n) => n.type === "tech"),
      st.v.techs,
      (n) => n.count,
    ),
    ...topIds(
      data.net_nodes.filter((n) => n.type === "desire"),
      st.v.desires,
      (n) => n.count,
    ),
  ]);
  const edges = data.net_edges.filter((e) => e.weight >= st.v.min && keep.has(e.source) && keep.has(e.target));
  const linked = new Set(edges.flatMap((e) => [e.source, e.target]));
  const nodes = data.net_nodes.filter((n) => keep.has(n.id) && (st.v.min === 1 || linked.has(n.id)));
  const height = Math.max(360, Math.min(680, 260 + nodes.length * 6));
  return (
    <Panel
      wide
      loading={loading}
      title="기술 · 욕망 네트워크"
      hint={`원 = 태그(크기 = 상상 수), 선 = 같은 상상에 함께 나옴(굵기 = 횟수${st.v.min > 1 ? `, ${st.v.min}번 이상만` : ""}). 서로 가까이 모인 무리가 하나의 상상 군집이에요. 원에 올리면 이어진 태그만 보여요.`}
      csv={() => downloadCsv(`태그_연결_${data.period.start}.csv`, [["태그 1", "태그 2", "함께 나온 수"], ...edges.map((e) => [e.source.slice(2), e.target.slice(2), e.weight])])}
      changed={st.changed}
      onReset={st.reset}
      settings={
        <>
          <PeriodSetting page={page} value={st.v.period} onChange={(v) => st.set("period", v)} />
          <CountSetting label="기술 수" options={[10, 20, 30, 40]} recommend={30} value={st.v.techs} onChange={(v) => st.set("techs", v)} why="원과 선이 겹쳐 군집이 잘 안 보여요" />
          <CountSetting label="욕망 수" options={[5, 10, 15, 20]} recommend={15} value={st.v.desires} onChange={(v) => st.set("desires", v)} why="원과 선이 겹쳐 군집이 잘 안 보여요" />
          <ChoiceSetting
            label="최소 연결"
            options={[
              { key: 1, label: "1번 이상" },
              { key: 2, label: "2번 이상" },
              { key: 3, label: "3번 이상" },
            ]}
            value={st.v.min}
            onChange={(v) => st.set("min", v)}
          />
        </>
      }
    >
      {nodes.length === 0 ? <p className={styles.empty}>이 조건에 맞는 태그가 없어요.</p> : <Network key={`${nodes.length}-${edges.length}`} nodes={nodes} edges={edges} height={height} />}
    </Panel>
  );
}

function MatrixPanel({ page }: { page: PeriodKey }) {
  const st = useSettings({ period: "page" as PanelPeriod, rows: 10, cols: 10 });
  const { data, loading } = useAnalytics<AnCross>("cross", periodOf(page, st.v.period));
  if (!data) return null;
  const rows = data.matrix_rows.slice(0, st.v.rows);
  const cols = data.matrix_cols.slice(0, st.v.cols);
  const cell = (r: number, c: number) => data.matrix[r][c];
  return (
    <Panel
      wide
      loading={loading}
      title="욕망 × 기술"
      hint="칸 = 그 욕망과 기술이 함께 나온 상상 수 (진할수록 많음). 칸에 올리면 그 상상들이 받은 Thunder 도 보여요. 어떤 이유로 어떤 기술을 원하는지 읽어 보세요."
      csv={() => downloadCsv(`욕망x기술_${data.period.start}.csv`, [["욕망 \\ 기술", ...cols], ...rows.map((r, i) => [r, ...cols.map((_, j) => cell(i, j).count)])])}
      changed={st.changed}
      onReset={st.reset}
      settings={
        <>
          <PeriodSetting page={page} value={st.v.period} onChange={(v) => st.set("period", v)} />
          <CountSetting label="욕망 수 (줄)" options={[5, 10, 15]} recommend={10} value={st.v.rows} onChange={(v) => st.set("rows", v)} why="표가 길어져요" />
          <CountSetting label="기술 수 (칸)" options={[5, 10, 15]} recommend={10} value={st.v.cols} onChange={(v) => st.set("cols", v)} why="칸이 좁아져 숫자가 잘 안 보여요" />
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
          cell={34}
          rowWidth={120}
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

function PairsPanel({ page }: { page: PeriodKey }) {
  const st = useSettings({ period: "page" as PanelPeriod, count: 10 });
  const { data, loading } = useAnalytics<AnCross>("cross", periodOf(page, st.v.period));
  if (!data) return null;
  const pairs = data.pairs.slice(0, st.v.count);
  return (
    <Panel
      wide
      loading={loading}
      title="기술 조합 순위"
      hint="같은 상상에 함께 붙은 기술 두 개. 새로운 조합은 새로운 쓰임의 신호일 수 있어요."
      csv={() => downloadCsv(`기술_조합_${data.period.start}.csv`, [["기술 1", "기술 2", "상상 수", "이전 기간", "Thunder"], ...pairs.map((x) => [x.a, x.b, x.count, x.prev, x.thunders])])}
      changed={st.changed}
      onReset={st.reset}
      settings={
        <>
          <PeriodSetting page={page} value={st.v.period} onChange={(v) => st.set("period", v)} />
          <CountSetting label="개수" options={[5, 10, 15, 20]} recommend={15} value={st.v.count} onChange={(v) => st.set("count", v)} why="목록이 길어져요" />
        </>
      }
    >
      {pairs.length === 0 ? (
        <p className={styles.empty}>기술이 두 개 이상 붙은 상상이 아직 없어요.</p>
      ) : (
        <Bars
          labelWidth={280}
          color="var(--viz-tech)"
          items={pairs.map((x) => ({
            key: `${x.a}|${x.b}`,
            label: `#${x.a} + #${x.b}`,
            value: x.count,
            note: (
              <>
                Thunder {x.thunders} <Delta cur={x.count} prev={x.prev} />
              </>
            ),
          }))}
        />
      )}
    </Panel>
  );
}

function DesiresPanel({ page }: { page: PeriodKey }) {
  const st = useSettings({ period: "page" as PanelPeriod, count: 20 });
  const { data, loading } = useAnalytics<AnCross>("cross", periodOf(page, st.v.period));
  if (!data) return null;
  const desires = data.desires.slice(0, st.v.count);
  return (
    <Panel
      wide
      loading={loading}
      title="욕망 순위"
      hint="왜 원하나요(욕망)의 빈도. Thunder 평균이 높을수록 많은 사람이 공감한 이유예요."
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
          <CountSetting label="개수" options={[10, 20, 30]} recommend={20} value={st.v.count} onChange={(v) => st.set("count", v)} why="표가 길어져요" />
        </>
      }
    >
      <ScrollBox min={760}>
        <table className={`${adminStyles.table} ${styles.dataTable}`}>
          <colgroup>
            <col style={{ width: 220 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 120 }} />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th>욕망</th>
              <th>상상</th>
              <th>이전 기간 대비</th>
              <th>Thunder 평균</th>
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
                <td className={styles.num}>{d.prev === null ? <span className={styles.muted}>—</span> : <Delta cur={d.count} prev={d.prev} />}</td>
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
