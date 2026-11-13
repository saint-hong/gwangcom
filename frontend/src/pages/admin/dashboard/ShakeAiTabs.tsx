import { Bars, Columns } from "../../../components/charts/basic";
import { fmt } from "../../../components/charts/core";
import { TimeChart } from "../../../components/charts/TimeChart";
import adminStyles from "../Admin.module.css";
import type { AnAi, AnShake, PeriodKey } from "../../../types/api";
import styles from "./Dashboard.module.css";
import { KpiTile, Loading, Panel, downloadCsv, useAnalytics, ScrollBox } from "./parts";
import { CountSetting, PeriodSetting, PickSetting, periodOf, usePeriodPanel, useSettings, type PanelPeriod } from "./settings";

/**
 * Shake it — 놀이 영역 (대중 상상 지표와 따로, 원칙 3)
 *   핵심 숫자(혼합 글 · 삭제율 · 조합 시너지 · 고르는 시간) · 혼합 흐름 · 많이 섞인 분야 쌍 · 많이 쓰인 재료 · 계보 깊이
 */
export function ShakeTab({ period }: { period: PeriodKey }) {
  const { data, error } = useAnalytics<AnShake>("shake", period);
  if (!data) return <Loading error={error} />;
  const all = data.blends + data.deleted;
  const synergy = data.material_thunder_avg > 0 ? data.blend_thunder_avg / data.material_thunder_avg : null;
  return (
    <div className={styles.grid}>
      <p className={`${styles.lead} ${styles.wide}`}>Shake it 혼합 글은 AI 가 섞은 놀이 결과라 다른 탭(대중 상상 지표)에서는 빼고 여기서만 봐요.</p>
      <div className={`${styles.kpis} ${styles.wide}`}>
        <KpiTile label="혼합 글" value={data.blends} series={data.series} color="var(--viz-7)" />
        <KpiTile label="지운 혼합 글" value={data.deleted} note={all ? `삭제율 ${fmt((data.deleted / all) * 100)}%` : undefined} />
        <KpiTile label="혼합 글 Thunder 평균" value={data.blend_thunder_avg} format={(n) => fmt(n, 2)} note={`재료 글 ${fmt(data.material_thunder_avg, 2)}`} />
        <KpiTile label="조합 시너지" value={synergy ?? 0} format={(n) => (synergy === null ? "—" : `${fmt(n * 100)}%`)} note="혼합 ÷ 재료 Thunder" />
        <KpiTile label="재료 고르는 시간 (중앙값)" value={(data.selection_ms_median ?? 0) / 1000} format={(n) => (data.selection_ms_median === null ? "—" : fmt(n, 1))} unit="초" />
      </div>
      <ShakeFlow page={period} />
      <ShakeRank page={period} kind="pairs" />
      <ShakeRank page={period} kind="materials" />
      <ShakeDepth page={period} />
      <ShakeAttempts page={period} />
    </div>
  );
}

function ShakeFlow({ page }: { page: PeriodKey }) {
  const { data, panel } = usePeriodPanel<AnShake>("shake", page);
  if (!data) return null;
  const p = data.period;
  return (
    <Panel {...panel} wide title="혼합 흐름" hint="날마다(긴 기간은 주마다) 올라온 혼합 글 수예요.">
      <TimeChart buckets={p.buckets} unit={p.unit} mode="bar" height={170} series={[{ key: "b", label: "혼합 글", color: "var(--viz-7)", values: data.series }]} />
    </Panel>
  );
}

function ShakeRank({ page, kind }: { page: PeriodKey; kind: "pairs" | "materials" }) {
  const st = useSettings({ period: "page" as PanelPeriod, count: 10 });
  const { data, loading } = useAnalytics<AnShake>("shake", periodOf(page, st.v.period));
  if (!data) return null;
  const p = data.period;
  const panel = {
    loading,
    changed: st.changed,
    onReset: st.reset,
    settings: (
      <>
        <PeriodSetting page={page} value={st.v.period} onChange={(v) => st.set("period", v)} />
        <CountSetting label="개수" options={[5, 10, 20]} recommend={10} value={st.v.count} onChange={(v) => st.set("count", v)} why="목록이 길어져요" />
      </>
    ),
  };
  if (kind === "pairs") {
    const rows = data.domain_pairs.slice(0, st.v.count);
    return (
      <Panel {...panel} title="많이 섞인 분야 쌍" hint="두 재료 상상의 분야 조합이에요." csv={() => downloadCsv(`분야쌍_${p.start}.csv`, [["분야 1", "분야 2", "혼합 수"], ...rows])}>
        {rows.length === 0 ? (
          <p className={styles.empty}>아직 없어요.</p>
        ) : (
          <Bars labelWidth={200} color="var(--viz-7)" items={rows.map(([a, b, n]) => ({ key: `${a}|${b}`, label: `${a} + ${b}`, value: n }))} />
        )}
      </Panel>
    );
  }
  const rows = data.materials.slice(0, st.v.count);
  return (
    <Panel {...panel} title="재료로 많이 쓰인 상상" hint="다른 사람이 섞고 싶어 한 상상이에요. 누르면 상세로 가요.">
      {rows.length === 0 ? (
        <p className={styles.empty}>아직 없어요.</p>
      ) : (
        <Bars labelWidth={200} color="var(--viz-7)" items={rows.map(([id, title, n]) => ({ key: String(id), label: title, value: n, href: `/i/${id}` }))} />
      )}
    </Panel>
  );
}

function ShakeDepth({ page }: { page: PeriodKey }) {
  const { data, panel } = usePeriodPanel<AnShake>("shake", page);
  if (!data) return null;
  return (
    <Panel {...panel} title="계보 깊이" hint="혼합 글을 다시 섞은 단계 수 (1 = 원본 두 개를 섞음).">
      <Columns items={data.depths.map(([d, n]) => [`${d}단계`, n])} color="var(--viz-7)" height={140} />
    </Panel>
  );
}

function ShakeAttempts({ page }: { page: PeriodKey }) {
  const { data, panel } = usePeriodPanel<AnShake>("shake", page);
  if (!data) return null;
  return (
    <Panel {...panel} title="시도 상태" hint="Shake it 을 누른 뒤 결과 (게시 · 실패 · 진행 중 등).">
      <Bars labelWidth={120} color="var(--viz-7)" items={Object.entries(data.attempts).map(([k, n]) => ({ key: k, label: ATTEMPT[k] ?? k, value: n }))} />
    </Panel>
  );
}

const ATTEMPT: Record<string, string> = { published: "게시됨", failed: "실패", processing: "진행 중", limited: "한도 초과", refused: "거절됨" };

const FEATURE: Record<string, string> = {
  tagging: "자동 태깅",
  shake: "Shake it 혼합",
  similar_rerank: "비슷한 상상 리랭킹",
  user_summary: "사용자 요약 (AI 비서)",
  note_draft: "Observe Note 초안",
  embedding: "임베딩",
};
const FEATURE_COLOR = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)", "var(--viz-5)", "var(--viz-6)", "var(--viz-7)", "var(--viz-8)"];

/** AI 사용량 — 기능별 호출 · 실패 · 토큰 · 예상 비용, 오늘 남은 전체 한도, 지금 쓰는 제공자 · 모델 */
export function AiTab({ period }: { period: PeriodKey }) {
  const { data, error } = useAnalytics<AnAi>("ai", period);
  if (!data) return <Loading error={error} />;
  const calls = data.features.reduce((s, f) => s + f.calls, 0);
  const failed = data.features.reduce((s, f) => s + f.failed, 0);
  const cost = data.features.reduce((s, f) => s + f.cost_usd, 0);
  const used = data.daily_limit ? data.today_calls / data.daily_limit : 0;
  return (
    <div className={styles.grid}>
      <div className={`${styles.kpis} ${styles.wide}`}>
        <KpiTile label="기간 호출" value={calls} unit="회" />
        <KpiTile label="실패" value={failed} unit="회" note={calls ? `실패율 ${fmt((failed / calls) * 100, 1)}%` : undefined} />
        <KpiTile label="예상 비용" value={cost} format={(n) => `$${fmt(n, 3)}`} series={data.cost_series} />
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>오늘 전체 한도</span>
          <span className={styles.kpiValue}>
            {data.today_calls}
            <small> / {data.daily_limit}회</small>
          </span>
          <span className={styles.meter} role="meter" aria-valuenow={data.today_calls} aria-valuemin={0} aria-valuemax={data.daily_limit} aria-label="오늘 AI 호출">
            <span style={{ width: `${Math.min(100, used * 100)}%`, background: used > 0.8 ? "var(--viz-down)" : "var(--viz-1)" }} />
          </span>
          <span className={styles.kpiPrev}>한국 시간 자정에 다시 채워져요 (임베딩 제외)</span>
        </div>
      </div>
      <AiFlow page={period} />
      <AiTable page={period} />
    </div>
  );
}

function AiFlow({ page }: { page: PeriodKey }) {
  const st = useSettings({ period: "page" as PanelPeriod, features: [] as string[] });
  const { data, loading } = useAnalytics<AnAi>("ai", periodOf(page, st.v.period));
  if (!data) return null;
  const p = data.period;
  const used = data.features.filter((f) => f.calls > 0);
  const picked = st.v.features.length ? used.filter((f) => st.v.features.includes(f.feature)) : used;
  return (
    <Panel
      wide
      loading={loading}
      title="기능별 호출 흐름"
      hint="날마다 AI 를 부른 횟수를 기능별로 쌓았어요."
      changed={st.changed}
      onReset={st.reset}
      settings={
        <>
          <PeriodSetting page={page} value={st.v.period} onChange={(v) => st.set("period", v)} />
          {used.length ? (
            <PickSetting
              label="기능"
              options={used.map((f, i) => ({ key: f.feature, label: FEATURE[f.feature] ?? f.feature, color: FEATURE_COLOR[i % 8] }))}
              value={picked.map((f) => f.feature)}
              onChange={(v) => st.set("features", v)}
            />
          ) : null}
        </>
      }
    >
      <TimeChart
        buckets={p.buckets}
        unit={p.unit}
        mode="bar"
        height={220}
        series={used
          .map((f, i) => ({ f, color: FEATURE_COLOR[i % 8] }))
          .filter(({ f }) => picked.includes(f))
          .map(({ f, color }) => ({ key: f.feature, label: FEATURE[f.feature] ?? f.feature, color, values: data.series[f.feature] ?? [] }))}
      />
    </Panel>
  );
}

function AiTable({ page }: { page: PeriodKey }) {
  const { data, panel } = usePeriodPanel<AnAi>("ai", page);
  if (!data) return null;
  const p = data.period;
  return (
    <Panel
      {...panel}
      wide
      title="기능별 사용량 · 지금 설정"
      hint="제공자 · 모델은 .env 설정이에요 (기능별로 바꿀 수 있음). 비용은 토큰 수로 계산한 예상값이에요."
      csv={() =>
        downloadCsv(`AI_사용량_${p.start}.csv`, [
          ["기능", "제공자", "모델", "호출", "실패", "입력 토큰", "출력 토큰", "예상 비용(USD)", "평균 응답(ms)"],
          ...data.features.map((f) => [FEATURE[f.feature] ?? f.feature, f.provider, f.model, f.calls, f.failed, f.input_tokens, f.output_tokens, f.cost_usd, f.latency_ms_avg]),
        ])
      }
    >
      <ScrollBox min={760}>
        <table className={`${adminStyles.table} ${styles.dataTable}`}>
          <thead>
            <tr>
              <th>기능</th>
              <th>제공자 · 모델</th>
              <th>호출</th>
              <th>실패</th>
              <th>토큰 (입력 / 출력)</th>
              <th>예상 비용</th>
              <th>평균 응답</th>
            </tr>
          </thead>
          <tbody>
            {data.features.map((f) => (
              <tr key={f.feature}>
                <td className={styles.left}>{FEATURE[f.feature] ?? f.feature}</td>
                <td className={styles.muted}>
                  {f.provider} · {f.model}
                </td>
                <td className={styles.num}>{fmt(f.calls)}</td>
                <td className={styles.num}>{f.failed ? <span className={styles.down}>{f.failed}</span> : 0}</td>
                <td className={styles.num}>
                  {fmt(f.input_tokens)} / {fmt(f.output_tokens)}
                </td>
                <td className={styles.num}>${fmt(f.cost_usd, 4)}</td>
                <td className={styles.num}>{f.latency_ms_avg ? `${fmt(f.latency_ms_avg / 1000, 1)}초` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollBox>
    </Panel>
  );
}
