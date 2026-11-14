import { useState } from "react";
import { Heatmap, Sparkline } from "../../../components/charts/basic";
import { Legend, TipRow, fmt, shortDay } from "../../../components/charts/core";
import { TimeChart } from "../../../components/charts/TimeChart";
import { Scatter } from "../../../components/charts/relations";
import { SortHeader, type Sort, type SortOption } from "../SortHeader";
import adminStyles from "../Admin.module.css";
import type { AnTech, PeriodKey, TechSignal } from "../../../types/api";
import styles from "./Dashboard.module.css";
import { DOMAIN_NAME, Loading, Panel, SIGNAL, SIGNAL_COLOR, SignalBadge, downloadCsv, pct, useAnalytics, ScrollBox } from "./parts";
import { ChoiceSetting, PeriodSetting, periodOf, useSettings, type PanelPeriod } from "./settings";
import { TechPickSetting } from "./TechPicker";

const SIGNALS = Object.keys(SIGNAL) as TechSignal["signal"][];

const SORTS: Record<string, SortOption[]> = {
  count: [
    { key: "count", order: "desc", label: "상상 많은 순" },
    { key: "count", order: "asc", label: "상상 적은 순" },
  ],
  growth: [
    { key: "growth", order: "desc", label: "비중이 많이 는 순" },
    { key: "growth", order: "asc", label: "비중이 많이 준 순" },
  ],
  thunder_avg: [
    { key: "thunder_avg", order: "desc", label: "Thunder 평균 높은 순" },
    { key: "thunder_avg", order: "asc", label: "Thunder 평균 낮은 순" },
  ],
  authors: [
    { key: "authors", order: "desc", label: "Dreamer 많은 순" },
    { key: "authors", order: "asc", label: "Dreamer 적은 순" },
  ],
  first_seen: [
    { key: "first_seen", order: "desc", label: "최근 등장 순" },
    { key: "first_seen", order: "asc", label: "오래된 순" },
  ],
};

/**
 * 기술 흐름 — 어떤 기술이 언제 상상되기 시작했고, 얼마나 원해지는가
 *   ① 기술 빈도 시계열: 기술마다 선(신호 그룹 색 + 위 범례) · 비중 · 7일 평균 · [기술 고르기 ▾] 설정 안 펼침 — 2026-11-14 시간 히트맵 대신
 *   ①-2 기술 × 분야 히트맵: 그 기술이 어느 분야의 상상에서 나오는지 (퍼짐)
 *   ② 사분면: 가로 = 상상 수(얼마나 자주) · 세로 = Thunder 평균(얼마나 원하나) · 원 = Dreamer 수
 *   ③ 기술 활동 테이블 (기술 고르기로 줄을 고름, 빈도 · Thunder · Dreamer 등): 신호 · 비중 증감 · Thunder 평균 · Dreamer · 처음 등장 · 흐름선 · 함께 나온 욕망 (정렬 · CSV)
 *   그래프마다 [설정 ▾]: 기간 · 개수 · 신호 종류 (2026-11-13)
 */
export function TechTab({ period }: { period: PeriodKey }) {
  const { data, error } = useAnalytics<AnTech>("tech", period);
  if (!data) return <Loading error={error} />;
  return (
    <div className={styles.grid}>
      {/* 순서 (2026-11-14 사용자 요청): 기술 × 분야 → 상상 빈도 × 욕망 강도 → 기술 빈도 시계열 → 기술 활동 테이블 */}
      <TechDomainHeat page={period} />
      <TechQuadrant page={period} />
      <TechTrend page={period} />
      <TechTable page={period} />
    </div>
  );
}

const DOMAINS = Object.keys(DOMAIN_NAME);

/** 앞 k칸(그 칸 포함)을 합친 값 — 하루 값이 들쭉날쭉해서 7일 평균으로 매끄럽게 본다 */
function rolling(values: number[], k: number): number[] {
  return values.map((_, i) => values.slice(Math.max(0, i - k + 1), i + 1).reduce((a, b) => a + b, 0));
}

/** 고르지 않았을 때 보이는 기술 수 (상상 많은 순, 2026-11-14 랭킹 설정은 없앰) */
const DEFAULT_TOP = 20;
/** 선 색 = 신호 그룹 색을 옅게 (2026-11-14 사용자 요청: 기술마다가 아니라 신호 그룹마다 색, 섞어 골라도 그룹이 보이게) */
const lineColor = (s: TechSignal["signal"]) => `color-mix(in srgb, ${SIGNAL_COLOR[s]} 60%, transparent)`;

/**
 * ① 기술 빈도 시계열 (2026-11-14 히트맵 대신) — 기술마다 선 하나, 색은 신호 그룹 (위에 신호별 범례)
 *   세로 = 비중(그 칸 상상 중 이 기술의 몫, 신호 계산과 같은 기준) 또는 개수 · 7일 평균선(하루 단위일 때)
 *   기본 = 상상 많은 순 20개. [기술 고르기 ▾](설정 안에서 펼침)에서 신호 그룹 → 기술을 섞어 고르면 그것만 보인다
 */
function TechTrend({ page }: { page: PeriodKey }) {
  const st = useSettings({
    period: "page" as PanelPeriod,
    axis: "share" as "share" | "count",
    smooth: true,
    picked: [] as string[],
  });
  const { data, loading } = useAnalytics<AnTech>("tech", periodOf(page, st.v.period));
  if (!data) return null;
  const p = data.period;
  const ranked = data.techs.slice(0, DEFAULT_TOP);
  const shown = st.v.picked.length ? data.techs.filter((t) => st.v.picked.includes(String(t.tag_id))) : ranked;
  const smooth = st.v.smooth && p.unit === "day";
  const totals = smooth ? rolling(data.total_series, 7) : data.total_series;
  const valuesOf = (t: TechSignal) => {
    const v = smooth ? rolling(t.series, 7) : t.series;
    // 개수 평균은 실제로 합친 칸 수로 나눈다 (기간 앞쪽은 7칸이 안 됨)
    if (st.v.axis === "count") return smooth ? v.map((x, i) => Math.round((x / Math.min(7, i + 1)) * 10) / 10) : v;
    return v.map((x, i) => (totals[i] ? Math.round((x / totals[i]) * 1000) / 10 : 0));
  };
  return (
    <Panel
      wide
      loading={loading}
      changed={st.changed}
      onReset={st.reset}
      settings={
        <>
          <PeriodSetting page={page} value={st.v.period} onChange={(v) => st.set("period", v)} />
          <ChoiceSetting
            label="세로축"
            options={[
              { key: "share", label: "비중" },
              { key: "count", label: "개수" },
            ]}
            value={st.v.axis}
            onChange={(v) => st.set("axis", v)}
          />
          <ChoiceSetting
            label="7일 평균"
            options={[
              { key: 1, label: "켜짐" },
              { key: 0, label: "꺼짐" },
            ]}
            value={st.v.smooth ? 1 : 0}
            onChange={(v) => st.set("smooth", v === 1)}
          />
          <TechPickSetting
            techs={data.techs}
            picked={st.v.picked}
            fallback={shown.map((t) => String(t.tag_id))}
            emptyNote={`고르지 않으면 상상 많은 기술 ${DEFAULT_TOP}개가 보여요`}
            onChange={(ids) => st.set("picked", ids)}
          />
        </>
      }
      title="기술 빈도 시계열"
      hint="설정한 기간 동안 기술의 빈도수를 4가지 신호로 구분하는 시계열"
      csv={() =>
        downloadCsv(`기술_빈도_${p.start}.csv`, [["날짜", "전체 상상", ...shown.map((t) => `#${t.label}`)], ...p.buckets.map((b, i) => [b, data.total_series[i], ...shown.map((t) => t.series[i])])])
      }
    >
      {shown.length === 0 ? (
        <p className={styles.empty}>이 기간에 해당하는 기술이 없어요.</p>
      ) : (
        <>
          {/* 그래프 위 신호별 색 범례 (지금 그려진 선 수) */}
          <Legend
            items={SIGNALS.filter((k) => shown.some((t) => t.signal === k)).map((k) => ({
              label: `${SIGNAL[k].label} ${shown.filter((t) => t.signal === k).length}`,
              color: SIGNAL_COLOR[k],
              shape: "line" as const,
            }))}
          />
          <TimeChart
            buckets={p.buckets}
            unit={p.unit}
            height={380}
            legend={false}
            format={st.v.axis === "share" ? (n) => `${fmt(n, n < 10 && n % 1 ? 1 : 0)}%` : (n) => fmt(n, n % 1 ? 1 : 0)}
            events={data.events.map((e) => ({ date: e.date, label: e.label }))}
            series={shown.map((t) => ({
              key: String(t.tag_id),
              label: `#${t.label} · ${SIGNAL[t.signal].label}`,
              color: lineColor(t.signal),
              values: valuesOf(t),
            }))}
          />
        </>
      )}
    </Panel>
  );
}

/**
 * ② 기술 × 분야 히트맵 (2026-11-14) — 그 기술이 어느 분야의 상상에서 나오는지
 *   보기: 기술 안 비중(한 줄 = 100%, 기본) · 개수 · 기술 고르기(기본 상상 많은 20개) · 줄 순서 = 상상 많은 순
 *   원래 분야를 벗어나 여러 분야로 퍼지는 기술 = 쓰임이 바뀌는 신호일 수 있다 (해석은 운영자)
 */
function TechDomainHeat({ page }: { page: PeriodKey }) {
  const st = useSettings({
    period: "page" as PanelPeriod,
    view: "share" as "share" | "count",
    picked: [] as string[], // 기술 수 대신 기술 고르기 (2026-11-14) — 고르지 않으면 상상 많은 기술 20개 (정렬 설정은 없앰: 줄 순서 = 상상 많은 순)
  });
  const { data, loading } = useAnalytics<AnTech>("tech", periodOf(page, st.v.period));
  if (!data) return null;
  const p = data.period;
  const spread = (t: TechSignal) => Object.values(t.domain_counts).filter((n) => n > 0).length;
  const base = st.v.picked.length ? data.techs.filter((t) => st.v.picked.includes(String(t.tag_id))) : data.techs.slice(0, DEFAULT_TOP);
  const rows = base;
  const values = rows.map((t) => DOMAINS.map((d) => (st.v.view === "count" ? (t.domain_counts[d] ?? 0) : t.count ? Math.round(((t.domain_counts[d] ?? 0) / t.count) * 100) : 0)));
  return (
    <Panel
      wide
      loading={loading}
      changed={st.changed}
      onReset={st.reset}
      settings={
        <>
          <PeriodSetting page={page} value={st.v.period} onChange={(v) => st.set("period", v)} />
          <ChoiceSetting
            label="칸 값"
            options={[
              { key: "share", label: "기술 안 비중" },
              { key: "count", label: "개수" },
            ]}
            value={st.v.view}
            onChange={(v) => st.set("view", v)}
          />
          <TechPickSetting
            techs={data.techs}
            picked={st.v.picked}
            fallback={data.techs.slice(0, DEFAULT_TOP).map((t) => String(t.tag_id))}
            emptyNote={`고르지 않으면 상상 많은 기술 ${DEFAULT_TOP}개가 보여요`}
            onChange={(ids) => st.set("picked", ids)}
          />
        </>
      }
      title="기술 × 분야"
      hint={st.v.view === "share" ? "기술이 어떤 상상에서 많이 나왔는지 보여주는 히트맵 (각 칸은 기술이 분야에 포함된 비중 %)" : "기술이 어떤 상상에서 많이 나왔는지 보여주는 히트맵 (각 칸은 그 분야에서 나온 상상 수)"}
      csv={() =>
        downloadCsv(`기술_분야_${p.start}.csv`, [
          ["기술", "상상 수", "퍼진 분야 수", ...DOMAINS.map((d) => DOMAIN_NAME[d])],
          ...rows.map((t) => [t.label, t.count, spread(t), ...DOMAINS.map((d) => t.domain_counts[d] ?? 0)]),
        ])
      }
    >
      {rows.length === 0 ? (
        <p className={styles.empty}>이 기간에 기술 태그가 없어요.</p>
      ) : (
        <Heatmap
          rows={rows.map((t) => `#${t.label}`)}
          cols={DOMAINS}
          values={values}
          cell={32}
          rowWidth={130}
          maxHeight={560}
          colLabel={(c) => DOMAIN_NAME[c]}
          tip={(r, c) => {
            const t = rows[r];
            const d = DOMAINS[c];
            const n = t.domain_counts[d] ?? 0;
            return (
              <>
                <b>
                  #{t.label} · {DOMAIN_NAME[d]}
                </b>
                <TipRow label="상상" value={`${n}개 (${t.count ? fmt((n / t.count) * 100) : 0}%)`} />
                <TipRow label="Thunder" value={fmt(t.domain_thunders[d] ?? 0)} />
                <TipRow label="퍼진 분야" value={`${spread(t)}개`} />
                {t.domain_top[d] ? <TipRow label="대표 상상" value={t.domain_top[d]} /> : null}
              </>
            );
          }}
        />
      )}
    </Panel>
  );
}

function TechQuadrant({ page }: { page: PeriodKey }) {
  // 신호 종류 · 점 수 · 이름 표시 대신 기술 고르기 (2026-11-14) — 고르지 않으면 상상 많은 기술 20개
  const st = useSettings({ period: "page" as PanelPeriod, picked: [] as string[] });
  const { data, loading } = useAnalytics<AnTech>("tech", periodOf(page, st.v.period));
  if (!data) return null;
  const pts = st.v.picked.length ? data.techs.filter((t) => st.v.picked.includes(String(t.tag_id))) : data.techs.slice(0, DEFAULT_TOP);
  return (
    <Panel
      wide
      loading={loading}
      changed={st.changed}
      onReset={st.reset}
      settings={
        <>
          <PeriodSetting page={page} value={st.v.period} onChange={(v) => st.set("period", v)} />
          <TechPickSetting
            techs={data.techs}
            picked={st.v.picked}
            fallback={data.techs.slice(0, DEFAULT_TOP).map((t) => String(t.tag_id))}
            emptyNote={`고르지 않으면 상상 많은 기술 ${DEFAULT_TOP}개가 보여요`}
            onChange={(ids) => st.set("picked", ids)}
          />
        </>
      }
      title="상상 빈도 × 욕망 강도"
      hint="상상의 빈도와 욕망의 강도를 나타내는 사분면 그래프 (가로 : 기술이 해당하는 상상의 수, 세로 : 상상이 받은 Thunder의 평균, 원의 크기 : Dreamer 수, 점선 : 중앙값)"
    >
      {pts.length === 0 ? (
        <p className={styles.empty}>이 기간에 기술 태그가 없어요.</p>
      ) : (
        <Scatter
          height={480}
          labelTop={10}
          xLabel="상상 수"
          yLabel="Thunder 평균"
          quadrants={["적게 상상 · 크게 원함", "많이 상상 · 크게 원함", "조용함", "많이 상상 · 반응 적음"]}
          points={pts.map((t) => ({
            id: String(t.tag_id),
            label: t.label,
            x: t.count,
            y: t.thunder_avg,
            r: 4 + Math.sqrt(t.authors) * 3,
            color: "var(--viz-tech)",
            tip: (
              <>
                <b>#{t.label}</b>
                <TipRow label="상상" value={`${t.count}개`} />
                <TipRow label="Thunder 평균" value={fmt(t.thunder_avg, 2)} />
                <TipRow label="Dreamer" value={`${t.authors}명`} />
                <TipRow label="주 분야" value={DOMAIN_NAME[t.domain]} />
                <TipRow label="신호" value={SIGNAL[t.signal].label} />
              </>
            ),
          }))}
        />
      )}
    </Panel>
  );
}

function TechTable({ page }: { page: PeriodKey }) {
  // 신호 종류 · 줄 수 대신 기술 고르기 (2026-11-14) — 고르지 않으면 상상 많은 기술 20개 (표는 상하 스크롤)
  const st = useSettings({ period: "page" as PanelPeriod, picked: [] as string[] });
  const { data, loading } = useAnalytics<AnTech>("tech", periodOf(page, st.v.period));
  const [sort, setSort] = useState<Sort>({ key: "count", order: "desc" });
  if (!data) return null;
  const p = data.period;
  const val = (t: TechSignal) => (sort.key === "growth" ? (t.growth ?? -Infinity) : sort.key === "first_seen" ? Date.parse(t.first_seen) : (t[sort.key as keyof TechSignal] as number));
  // 고르지 않으면 상상 많은 기술 20개 (시계열과 같은 기본, 2026-11-14)
  const base = st.v.picked.length ? data.techs.filter((t) => st.v.picked.includes(String(t.tag_id))) : data.techs.slice(0, DEFAULT_TOP);
  const rows = [...base].sort((a, b) => (sort.order === "asc" ? val(a) - val(b) : val(b) - val(a)));
  return (
    <Panel
      wide
      loading={loading}
      changed={st.changed}
      onReset={st.reset}
      settings={
        <>
          <PeriodSetting page={page} value={st.v.period} onChange={(v) => st.set("period", v)} />
          <TechPickSetting
            techs={data.techs}
            picked={st.v.picked}
            fallback={data.techs.slice(0, DEFAULT_TOP).map((t) => String(t.tag_id))}
            emptyNote={`고르지 않으면 상상 많은 기술 ${DEFAULT_TOP}개가 보여요`}
            onChange={(ids) => st.set("picked", ids)}
          />
        </>
      }
      title="기술 활동 테이블"
      hint="칸 이름 옆 아이콘으로 정렬해요. Dreamer 수가 상상 수보다 훨씬 적으면 한두 사람이 반복해서 쓴 기술일 수 있어요."
      csv={() =>
        downloadCsv(`기술_활동_테이블_${p.start}.csv`, [
          ["기술", "분야", "신호", "상상 수", "이전 기간", "비중 증감", "Thunder 합", "Thunder 평균", "Dreamer", "처음 등장", "함께 나온 욕망"],
          ...rows.map((t) => [t.label, DOMAIN_NAME[t.domain], SIGNAL[t.signal].label, t.count, t.prev, pct(t.growth), t.thunders, t.thunder_avg, t.authors, t.first_seen, t.desires.join(" | ")]),
        ])
      }
    >
      <ScrollBox min={1130}>
        <table className={`${adminStyles.table} ${styles.dataTable}`}>
          <colgroup>
            <col style={{ width: 180 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 84 }} />
            <col style={{ width: 92 }} />
            <col style={{ width: 104 }} />
            <col style={{ width: 84 }} />
            <col style={{ width: 96 }} />
            <col style={{ width: 112 }} />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th>기술</th>
              <th>분야</th>
              <th>신호</th>
              <th>
                <SortHeader label="상상" options={SORTS.count} value={sort} onChange={setSort} />
              </th>
              <th>
                <SortHeader label="비중 증감" options={SORTS.growth} value={sort} onChange={setSort} />
              </th>
              <th>
                <SortHeader label="Thunder 평균" options={SORTS.thunder_avg} value={sort} onChange={setSort} />
              </th>
              <th>
                <SortHeader label="Dreamer" options={SORTS.authors} value={sort} onChange={setSort} />
              </th>
              <th>
                <SortHeader label="처음 등장" options={SORTS.first_seen} value={sort} onChange={setSort} />
              </th>
              <th>흐름</th>
              <th>함께 나온 욕망</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.tag_id}>
                <td className={styles.left} title={`#${t.label}`}>
                  #{t.label}
                </td>
                {/* 분야 = 이 기간에 이 기술이 가장 많이 나온 분야 (2026-11-14 색 점 대신) */}
                <td title={`가장 많이 나온 분야: ${DOMAIN_NAME[t.domain]}`}>{DOMAIN_NAME[t.domain] ?? t.domain}</td>
                <td>
                  <SignalBadge signal={t.signal} colored />
                </td>
                <td className={styles.num}>
                  {t.count}
                  {t.prev !== null ? <span className={styles.muted}> / {t.prev}</span> : null}
                </td>
                <td className={styles.num}>{pct(t.growth)}</td>
                <td className={styles.num}>{fmt(t.thunder_avg, 2)}</td>
                <td className={styles.num}>{t.authors}</td>
                <td className={styles.num}>{shortDay(t.first_seen)}</td>
                <td>
                  <Sparkline values={t.series} color="var(--viz-tech)" width={100} height={22} />
                </td>
                <td className={`${styles.left} ${styles.muted}`} title={t.desires.join(" · ")}>
                  {t.desires.join(" · ") || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollBox>
    </Panel>
  );
}
