import { ChevronRight } from "lucide-react";
import { Bars, Delta, Sparkline } from "../../../components/charts/basic";
import { DOMAIN_COLORS, fmt } from "../../../components/charts/core";
import { TimeChart } from "../../../components/charts/TimeChart";
import type { AnOverview, AnSummary, PeriodKey, TechSignal } from "../../../types/api";
import styles from "./Dashboard.module.css";
import { DOMAIN_NAME, KpiTile, Loading, Panel, SIGNAL, SignalBadge, downloadCsv, pct, useAnalytics } from "./parts";
import { ChoiceSetting, CountSetting, PeriodSetting, PickSetting, periodOf, useSettings, type PanelPeriod } from "./settings";

const KPI_COLOR: Record<string, string> = {
  posts: "var(--viz-3)",
  thunders: "var(--color-chart-thunder)",
  waves: "var(--color-chart-wave)",
  comments: "var(--color-chart-comment)",
  new_tech: "var(--viz-tech)",
  new_users: "var(--viz-3)",
};

const DOMAINS = Object.keys(DOMAIN_NAME);
const SIGNALS = Object.keys(SIGNAL) as TechSignal["signal"][];
const ACTIVITY = [
  { key: "posts", label: "상상", color: "var(--viz-3)" },
  { key: "thunders", label: "Thunder", color: "var(--color-chart-thunder)" },
  { key: "waves", label: "Wave", color: "var(--color-chart-wave)" },
  { key: "comments", label: "댓글", color: "var(--color-chart-comment)" },
  { key: "blends", label: "Shake it 혼합", color: "var(--viz-7)" },
] as const;
type ActivityKey = (typeof ACTIVITY)[number]["key"];

/**
 * 개요 — 한 화면에서 "지금 무엇이 상상되고, 무엇을 원하고, 어떤 기술이 떠오르나"
 *   ⓪ 전체 현황 (기간 · 설정과 상관없이 처음부터 지금까지: 콘텐츠 · 활동 · 사용자)
 *   ① 기간 통계: 핵심 숫자 7칸 (이전 기간 대비 · 흐름선, [설정 ▾] 기간 · 숫자 고르기 · 흐름선)  ② 분야별 상상의 흐름 (쌓은 막대 + 질문 시작 표시) · 분야 비중
 *   ③ 떠오르는 기술 신호 카드 (→ 기술 흐름 탭)  ④ 반응의 흐름 (상상 · Thunder · Wave · 댓글)
 *   그래프마다 [설정 ▾]: 기간 · 보여 줄 항목 · 개수 (2026-11-13)
 */
export function OverviewTab({ period, onTab }: { period: PeriodKey; onTab: (tab: string) => void }) {
  const { data, error } = useAnalytics<AnOverview>("overview", period);
  if (!data) return <Loading error={error} />;

  return (
    <div className={styles.grid}>
      <Summary />

      <PeriodStats page={period} />

      <DomainFlow page={period} />
      <Signals page={period} onTab={onTab} />
      <ActivityFlow page={period} />
    </div>
  );
}

const KPI_KEYS = ["posts", "active", "thunders", "waves", "comments", "new_tech", "new_users"];

/** 기간 통계 — 핵심 숫자 칸 (기간 · 보여 줄 숫자 · 흐름선) */
function PeriodStats({ page }: { page: PeriodKey }) {
  const st = useSettings({ period: "page" as PanelPeriod, keys: KPI_KEYS, spark: true });
  const { data, loading } = useAnalytics<AnOverview>("overview", periodOf(page, st.v.period));
  if (!data) return null;
  const p = data.period;
  const kpis = data.kpis.filter((k) => st.v.keys.includes(k.key));
  return (
    <Panel
      wide
      loading={loading}
      title="기간 통계"
      hint={
        <>
          {p.start} ~ {p.end} · 대중 상상(원본 · 인용, 혼합 글 제외) 기준. 기술 태그가 붙은 상상 <b>{fmt(data.tagged_ratio * 100)}%</b> — 분석에 쓸 수 있는 데이터 비율이에요.
          {p.has_prev ? " ▲▼ 는 바로 앞 같은 길이 기간과 비교해요." : " 전체 기간은 비교 기간이 없어요."}
        </>
      }
      csv={() => downloadCsv(`기간_통계_${p.start}.csv`, [["숫자", "이번 기간", "이전 기간"], ...kpis.map((k) => [k.label, k.value, k.prev])])}
      changed={st.changed}
      onReset={st.reset}
      settings={
        <>
          <PeriodSetting page={page} value={st.v.period} onChange={(v) => st.set("period", v)} />
          <PickSetting label="보여 줄 숫자" options={data.kpis.map((k) => ({ key: k.key, label: k.label, color: KPI_COLOR[k.key] }))} value={st.v.keys} onChange={(v) => st.set("keys", v)} />
          <ChoiceSetting
            label="흐름선"
            options={[
              { key: 1, label: "표시" },
              { key: 0, label: "숨김" },
            ]}
            value={st.v.spark ? 1 : 0}
            onChange={(v) => st.set("spark", v === 1)}
          />
        </>
      }
    >
      <div className={styles.kpiRow} style={{ ["--n" as string]: Math.min(kpis.length, 7) }}>
        {kpis.map((k) => (
          <KpiTile key={k.key} label={k.label} value={k.value} prev={k.prev} series={st.v.spark ? k.series : undefined} unit={k.unit} color={KPI_COLOR[k.key]} />
        ))}
      </div>
    </Panel>
  );
}

function DomainFlow({ page }: { page: PeriodKey }) {
  const st = useSettings({ period: "page" as PanelPeriod, domains: DOMAINS, shape: "bar" as "bar" | "line", events: true });
  const { data, loading } = useAnalytics<AnOverview>("overview", periodOf(page, st.v.period));
  if (!data) return null;
  const p = data.period;
  const shown = data.domains.filter((d) => st.v.domains.includes(d.slug));
  const total = shown.reduce((s, d) => s + d.count, 0);
  return (
    <Panel
      wide
      loading={loading}
      title="상상의 흐름 — 분야별"
      hint={
        st.v.shape === "bar"
          ? "하루(긴 기간은 한 주)마다 올라온 상상 수를 분야별로 쌓은 막대예요. 색 칸 하나의 높이가 그 분야의 수, 막대 꼭대기는 그날 전체 수예요. ▼ 점선은 이번 주 질문이 시작된 날이에요."
          : "하루(긴 기간은 한 주)마다 올라온 상상 수를 분야마다 선으로 그렸어요. ▼ 점선은 이번 주 질문이 시작된 날이에요."
      }
      csv={() => downloadCsv(`분야별_흐름_${p.start}.csv`, [["날짜", ...shown.map((d) => d.name)], ...p.buckets.map((b, i) => [b, ...shown.map((d) => d.series[i])])])}
      changed={st.changed}
      onReset={st.reset}
      settings={
        <>
          <PeriodSetting page={page} value={st.v.period} onChange={(v) => st.set("period", v)} />
          <PickSetting label="분야" options={DOMAINS.map((k) => ({ key: k, label: DOMAIN_NAME[k], color: DOMAIN_COLORS[k] }))} value={st.v.domains} onChange={(v) => st.set("domains", v)} />
          <ChoiceSetting
            label="모양"
            options={[
              { key: "bar", label: "쌓은 막대" },
              { key: "line", label: "선" },
            ]}
            value={st.v.shape}
            onChange={(v) => st.set("shape", v)}
          />
          <ChoiceSetting
            label="질문 시작일"
            options={[
              { key: 1, label: "표시" },
              { key: 0, label: "숨김" },
            ]}
            value={st.v.events ? 1 : 0}
            onChange={(v) => st.set("events", v === 1)}
          />
        </>
      }
    >
      <div className={styles.split}>
        <TimeChart
          buckets={p.buckets}
          unit={p.unit}
          mode={st.v.shape}
          height={260}
          events={st.v.events ? data.events.map((e) => ({ date: e.date, label: e.label })) : []}
          series={shown.map((d) => ({ key: d.slug, label: d.name, color: DOMAIN_COLORS[d.slug], values: d.series }))}
        />
        <div className={styles.sideList}>
          <h4 className={styles.subTitle}>분야 비중</h4>
          <Bars
            labelWidth={96}
            items={[...shown]
              .sort((a, b) => b.count - a.count)
              .map((d) => ({
                key: d.slug,
                label: d.name,
                value: d.count,
                color: DOMAIN_COLORS[d.slug],
                note: (
                  <>
                    {total ? `${fmt((d.count / total) * 100)}%` : "—"} <Delta cur={d.count} prev={d.prev} />
                  </>
                ),
              }))}
          />
        </div>
      </div>
    </Panel>
  );
}

function Signals({ page, onTab }: { page: PeriodKey; onTab: (tab: string) => void }) {
  const st = useSettings({ period: "page" as PanelPeriod, kinds: SIGNALS, count: 8 });
  const { data, loading } = useAnalytics<AnOverview>("overview", periodOf(page, st.v.period));
  if (!data) return null;
  const cards = data.signals.filter((s) => st.v.kinds.includes(s.signal)).slice(0, st.v.count);
  return (
    <Panel
      wide
      loading={loading}
      title="떠오르는 기술 신호"
      hint="계산 규칙으로만 정해요: 새로 등장 = 이번 기간에 처음 나옴 · 떠오름 = 전체 상상 중 그 기술의 비중이 이전 기간의 1.5배 이상 · 식는 중 = 2/3 미만 (상상 수가 늘어도 모두 떠오름이 되지 않게 비중으로 비교). 신호가 무엇을 뜻하는지는 운영자가 판단해요."
      aside={
        <button type="button" className={styles.moreBtn} onClick={() => onTab("tech")}>
          기술 흐름 전체 <ChevronRight aria-hidden="true" />
        </button>
      }
      changed={st.changed}
      onReset={st.reset}
      settings={
        <>
          <PeriodSetting page={page} value={st.v.period} onChange={(v) => st.set("period", v)} />
          <PickSetting label="신호 종류" options={SIGNALS.map((k) => ({ key: k, label: SIGNAL[k].label }))} value={st.v.kinds} onChange={(v) => st.set("kinds", v)} />
          <CountSetting label="카드 수" options={[4, 8, 12, 16]} recommend={12} value={st.v.count} onChange={(v) => st.set("count", v)} why="한눈에 비교하기 어려워요" />
        </>
      }
    >
      {cards.length === 0 ? (
        <p className={styles.empty}>고른 신호에 해당하는 기술이 없어요.</p>
      ) : (
        <ul className={styles.signals}>
          {cards.map((s) => (
            <li key={s.tag_id} className={styles.signalCard}>
              <div className={styles.signalTop}>
                <SignalBadge signal={s.signal} />
                <span className={styles.domainDot} style={{ background: DOMAIN_COLORS[s.domain] }} title={DOMAIN_NAME[s.domain]} />
              </div>
              <strong className={styles.signalName}>#{s.label}</strong>
              <span className={styles.signalNums}>
                상상 <b>{s.count}</b> · Thunder <b>{s.thunders}</b> · {s.authors}명
                {s.growth !== null ? <span className={s.growth >= 0 ? styles.signalGrowth : styles.down}> 비중 {pct(s.growth)}</span> : null}
              </span>
              <Sparkline values={s.series} color="var(--viz-tech)" width={160} height={26} />
              {s.desires.length ? <span className={styles.signalDesires}>욕망: {s.desires.join(" · ")}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ActivityFlow({ page }: { page: PeriodKey }) {
  const st = useSettings({ period: "page" as PanelPeriod, series: ["posts", "thunders", "waves", "comments"] as ActivityKey[], events: true });
  const { data, loading } = useAnalytics<AnOverview>("overview", periodOf(page, st.v.period));
  if (!data) return null;
  const p = data.period;
  const shown = ACTIVITY.filter((a) => st.v.series.includes(a.key));
  return (
    <Panel
      wide
      loading={loading}
      title="반응의 흐름"
      hint="상상이 올라온 수와 사람들이 반응한 수(Thunder · Wave · 댓글)를 함께 봐요. 상상은 적은데 반응이 몰리는 날은 특정 상상이 공감을 얻은 날이에요."
      csv={() => downloadCsv(`반응_흐름_${p.start}.csv`, [["날짜", ...shown.map((a) => a.label)], ...p.buckets.map((b, i) => [b, ...shown.map((a) => data.activity[a.key][i])])])}
      changed={st.changed}
      onReset={st.reset}
      settings={
        <>
          <PeriodSetting page={page} value={st.v.period} onChange={(v) => st.set("period", v)} />
          <PickSetting label="보여 줄 선" options={ACTIVITY.map((a) => ({ key: a.key, label: a.label, color: a.color }))} value={st.v.series} onChange={(v) => st.set("series", v)} />
          <ChoiceSetting
            label="질문 시작일"
            options={[
              { key: 1, label: "표시" },
              { key: 0, label: "숨김" },
            ]}
            value={st.v.events ? 1 : 0}
            onChange={(v) => st.set("events", v === 1)}
          />
        </>
      }
    >
      <TimeChart
        buckets={p.buckets}
        unit={p.unit}
        height={240}
        events={st.v.events ? data.events.map((e) => ({ date: e.date, label: e.label })) : []}
        series={shown.map((a) => ({ key: a.key, label: a.label, color: a.color, values: data.activity[a.key] }))}
      />
    </Panel>
  );
}

/** 전체 현황 — 기간 · 설정과 상관없이 서비스를 연 날부터 지금까지 (맨 위 기간을 바꿔도 그대로) */
function Summary() {
  const { data } = useAnalytics<AnSummary>("summary", "all");
  const groups: { title: string; items: { label: string; value: number | null; today?: number; note?: string }[] }[] = data
    ? [
        {
          title: "콘텐츠",
          items: [
            { label: "상상", value: data.imaginations, today: data.today.imaginations },
            { label: "댓글", value: data.comments, today: data.today.comments },
            { label: "인용", value: data.quotes, today: data.today.quotes },
          ],
        },
        {
          title: "활동",
          items: [
            { label: "Thunder", value: data.thunders, today: data.today.thunders },
            { label: "Wave", value: data.waves, today: data.today.waves },
            { label: "Shake it", value: data.blends, today: data.today.blends, note: `시도 ${fmt(data.shake_attempts)}회` },
          ],
        },
        {
          title: "사용자",
          items: [
            { label: "Dreamer", value: data.users, today: data.today.users, note: `운영자 ${data.admins}명 제외` },
            { label: "탈퇴", value: data.withdrawn, note: "탈퇴 기능이 아직 없어요" },
          ],
        },
      ]
    : [];
  return (
    <Panel
      wide
      title="전체 현황"
      hint={`기간 · 그래프 설정과 상관없이 서비스를 연 날부터 지금까지의 숫자예요. 글은 보이는 것만 세요${data?.hidden ? ` (숨김 · 삭제 ${fmt(data.hidden)}개 제외)` : ""}. Thunder · Wave 는 지금 켜져 있는 수, Shake it 은 올라온 혼합 글 수예요.`}
    >
      {!data ? (
        <p className={styles.status}>통계를 계산하는 중…</p>
      ) : (
        <div className={styles.summary}>
          {groups.map((g) => (
            <section key={g.title} className={styles.sumGroup} aria-label={g.title}>
              <h4 className={styles.sumTitle}>{g.title}</h4>
              <div className={styles.sumItems}>
                {g.items.map((it) => (
                  <div key={it.label} className={styles.sumItem}>
                    <span className={styles.kpiLabel}>{it.label}</span>
                    <span className={styles.sumValue}>{it.value === null ? "—" : fmt(it.value)}</span>
                    <span className={styles.kpiPrev}>
                      {it.today !== undefined ? <span className={it.today > 0 ? styles.up : undefined}>오늘 +{fmt(it.today)}</span> : null}
                      {it.today !== undefined && it.note ? " · " : null}
                      {it.note}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </Panel>
  );
}
