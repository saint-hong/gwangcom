import { fmt } from "../../../components/charts/core";
import { TimeChart } from "../../../components/charts/TimeChart";
import adminStyles from "../Admin.module.css";
import type { AnAi, PeriodKey } from "../../../types/api";
import styles from "./Dashboard.module.css";
import { KpiTile, Loading, Panel, downloadCsv, useAnalytics, ScrollBox } from "./parts";
import { PeriodSetting, PickSetting, periodOf, usePeriodPanel, useSettings, type PanelPeriod } from "./settings";

const FEATURE: Record<string, string> = {
  tagging: "자동 태깅",
  shake: "Shake it 혼합",
  similar_rerank: "비슷한 상상 리랭킹",
  user_summary: "사용자 요약 (AI 비서)",
  reaction_summary: "반응 쏠림 요약 (AI 비서)",
  note_summary: "Observe Note 요약 (AI 비서)",
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
  const used = data.features.filter((f) => f.calls > 0);
  const picked = st.v.features.length ? used.filter((f) => st.v.features.includes(f.feature)) : used;
  return (
    <Panel
      wide
      loading={loading}
      title="기능별 호출 흐름"
      hint="일자별 AI 기능 호출 횟수 누적 그래프"
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
      {/* 긴 기간도 하루 칸 + 모든 날짜 · 좌우 스크롤 (2026-11-17 사용자 요청) */}
      <TimeChart
        buckets={data.daily_buckets}
        unit="day"
        mode="bar"
        height={220}
        minBand={40}
        series={used
          .map((f, i) => ({ f, color: FEATURE_COLOR[i % 8] }))
          .filter(({ f }) => picked.includes(f))
          .map(({ f, color }) => ({ key: f.feature, label: FEATURE[f.feature] ?? f.feature, color, values: data.daily_series[f.feature] ?? [] }))}
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
      title="AI 기능별 사용량"
      hint="AI를 사용한 각 기능별 호출, 토큰, 비용 현황 테이블"
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
                {/* 잘리는 긴 글자는 마우스를 올리면 전체가 보임 (2026-11-17) */}
                <td className={styles.left} title={FEATURE[f.feature] ?? f.feature}>
                  {FEATURE[f.feature] ?? f.feature}
                </td>
                <td className={styles.muted} title={`${f.provider} · ${f.model}`}>
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
