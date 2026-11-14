import clsx from "clsx";
import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Bars, Sparkline } from "../../../components/charts/basic";
import { DOMAIN_COLORS, fmt } from "../../../components/charts/core";
import { TimeChart } from "../../../components/charts/TimeChart";
import type { AnOverview, AnSummary, PeriodKey, TechSignal } from "../../../types/api";
import adminStyles from "../Admin.module.css";
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
 *   ① 기간 통계: 핵심 숫자 7칸 (이전 기간 대비 · 흐름선, [설정 ▾] 기간 · 숫자 고르기 · 흐름선)  ② 분야별 상상의 흐름 (쌓은 막대 + 질문 시작 표시) + 아래 [분야별 비중 ▾] 펼침
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

// 카드 순서 (2026-11-14 사용자 요청): 콘텐츠 → 활동 → 기술 → 사용자
const KPI_KEYS = ["posts", "comments", "thunders", "waves", "new_tech", "active", "new_users"];

/** 기간 통계 — 핵심 숫자 칸 (기간 · 보여 줄 숫자 · 흐름선) */
function PeriodStats({ page }: { page: PeriodKey }) {
  const st = useSettings({ period: "page" as PanelPeriod, keys: KPI_KEYS, spark: true });
  const { data, loading } = useAnalytics<AnOverview>("overview", periodOf(page, st.v.period));
  if (!data) return null;
  const p = data.period;
  const ordered = [...data.kpis].sort((a, b) => KPI_KEYS.indexOf(a.key) - KPI_KEYS.indexOf(b.key));
  const kpis = ordered.filter((k) => st.v.keys.includes(k.key));
  return (
    <Panel
      wide
      loading={loading}
      title="기간 통계"
      hint="설정 기간 내 증감하는 콘텐츠, 활동, 사용자 통계 현황 카드 (이전 동일기간 대비 증감 표시)"
      csv={() => downloadCsv(`기간_통계_${p.start}.csv`, [["숫자", "이번 기간", "이전 기간"], ...kpis.map((k) => [k.label, k.value, k.prev])])}
      changed={st.changed}
      onReset={st.reset}
      settings={
        <>
          <PeriodSetting page={page} value={st.v.period} onChange={(v) => st.set("period", v)} />
          <PickSetting label="보여 줄 숫자" options={ordered.map((k) => ({ key: k.key, label: k.label, color: KPI_COLOR[k.key] }))} value={st.v.keys} onChange={(v) => st.set("keys", v)} />
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
  const [shareOpen, setShareOpen] = useState(false);
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
          ? '분야별 하루동안 올라온 상상의 누적 막대 그래프 (점선은 "이번 주 질문" 시작일, 기간 설정에 따라 하루 -> 한주로 변경됨)'
          : '분야별 하루동안 올라온 상상의 선 그래프 (점선은 "이번 주 질문" 시작일, 기간 설정에 따라 하루 -> 한주로 변경됨)'
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
      {/* 한 상자 안에: 위 = 날짜별 쌓은 막대(한 줄 전체), 아래 = [분야별 비중 ▾] 눌러서 펼침 (2026-11-14 사용자 요청) */}
      <TimeChart
        buckets={p.buckets}
        unit={p.unit}
        mode={st.v.shape}
        height={260}
        events={st.v.events ? data.events.map((e) => ({ date: e.date, label: e.label })) : []}
        series={shown.map((d) => ({ key: d.slug, label: d.name, color: DOMAIN_COLORS[d.slug], values: d.series }))}
      />
      <div className={styles.foldBox}>
        <button type="button" className={styles.setBtn} aria-expanded={shareOpen} onClick={() => setShareOpen((o) => !o)}>
          분야별 비중 {shareOpen ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
        </button>
        {shareOpen ? (
          <div className={styles.foldBody}>
            <Bars
              labelWidth={110}
              items={[...shown]
                .sort((a, b) => b.count - a.count)
                .map((d) => ({
                  key: d.slug,
                  label: d.name,
                  value: d.count,
                  color: DOMAIN_COLORS[d.slug],
                  // 비중(앞 글자 맞춤) + 이번 기간에 처음 나온 분야만 New (증감율은 뺌)
                  note: (
                    <span className={styles.shareNote}>
                      <span>{total ? `${fmt((d.count / total) * 100)}%` : "—"}</span>
                      <span className={styles.shareNew}>{d.prev === 0 && d.count > 0 ? "New" : ""}</span>
                    </span>
                  ),
                }))}
            />
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function Signals({ page, onTab }: { page: PeriodKey; onTab: (tab: string) => void }) {
  // 신호 4가지를 탭으로 나눠 본다 (2026-11-14 사용자 요청) — 설정(기간 · 카드 수)은 모든 탭에 똑같이
  const st = useSettings({ period: "page" as PanelPeriod, count: 8 });
  const [tab, setTab] = useState<TechSignal["signal"]>("new");
  const { data, loading } = useAnalytics<AnOverview>("overview", periodOf(page, st.v.period));
  if (!data) return null;
  const counts = Object.fromEntries(SIGNALS.map((k) => [k, data.signals.filter((s) => s.signal === k).length]));
  const cards = data.signals.filter((s) => s.signal === tab).slice(0, st.v.count);
  return (
    <Panel
      wide
      loading={loading}
      title="떠오르는 기술 신호"
      hint='설정한 기간 동안 상상과 연관 된 기술의 생애를 4가지 신호로 구분하고 요약 정보를 나타내는 카드 (자세한 기술 분석은 "기술 흐름 전체"로 이동)'
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
          <CountSetting label="카드 수" options={[4, 8, 12, 16]} recommend={12} value={st.v.count} onChange={(v) => st.set("count", v)} why="한눈에 비교하기 어려워요" />
        </>
      }
    >
      <div className={styles.signalTabs}>
        <div className={adminStyles.seg} role="group" aria-label="신호 종류">
          {SIGNALS.map((k) => (
            <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)} title={SIGNAL[k].hint}>
              {SIGNAL[k].label} {counts[k]}
            </button>
          ))}
        </div>
      </div>
      {cards.length === 0 ? (
        <p className={styles.empty}>이 기간에 {SIGNAL[tab].label} 기술이 없어요.</p>
      ) : (
        <ul className={styles.signals}>
          {cards.map((s) => (
            <li key={s.tag_id} className={styles.signalCard}>
              <div className={styles.signalTop}>
                <SignalBadge signal={s.signal} />
              </div>
              <strong className={styles.signalName}>#{s.label}</strong>
              {/* 카드 순서 (2026-11-14): 숫자 → 비중 변화 → 분야 → 욕망 → 흐름선(맨 아래) */}
              <span className={styles.signalNums}>
                상상 {fmt(s.count)} · Thunder {fmt(s.thunders)} · Wave {fmt(s.waves)} · Dreamer {fmt(s.authors)}
              </span>
              {s.growth !== null ? <span className={clsx(styles.signalNums, s.growth >= 0 ? styles.signalGrowth : styles.down)}>비중 {pct(s.growth)}</span> : null}
              <span className={styles.signalDesires}>분야 : {DOMAIN_NAME[s.domain] ?? s.domain}</span>
              {s.desires.length ? <span className={styles.signalDesires}>욕망: {s.desires.join(" · ")}</span> : null}
              <span className={styles.signalSpark}>
                <Sparkline values={s.series} color="var(--viz-tech)" width={160} height={26} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ActivityFlow({ page }: { page: PeriodKey }) {
  const st = useSettings({ period: "page" as PanelPeriod, series: ["posts", "thunders", "waves", "comments", "blends"] as ActivityKey[], events: true });
  const { data, loading } = useAnalytics<AnOverview>("overview", periodOf(page, st.v.period));
  if (!data) return null;
  const p = data.period;
  const shown = ACTIVITY.filter((a) => st.v.series.includes(a.key));
  return (
    <Panel
      wide
      loading={loading}
      title="반응의 흐름"
      hint="기간 내 올라온 상상 수와 Dreamer 활동별 수 비교 그래프"
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
      hint="전체 기간에 대한 콘텐츠, 활동, 사용자 통계 현황 카드 (콘텐츠는 숨김/삭제 제외, 활동은 꺼짐 제외)"
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
