import { useState } from "react";
import { Heatmap, Sparkline } from "../../../components/charts/basic";
import { DOMAIN_COLORS, TipRow, fmt, shortDay } from "../../../components/charts/core";
import { Scatter } from "../../../components/charts/relations";
import { SortHeader, type Sort, type SortOption } from "../SortHeader";
import adminStyles from "../Admin.module.css";
import type { AnTech, PeriodKey, TechSignal } from "../../../types/api";
import styles from "./Dashboard.module.css";
import { DOMAIN_NAME, Loading, Panel, SIGNAL, SignalBadge, downloadCsv, pct, useAnalytics, ScrollBox } from "./parts";
import { ChoiceSetting, CountSetting, PeriodSetting, PickSetting, periodOf, useSettings, type PanelPeriod } from "./settings";

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
 *   ① 시간 히트맵: 기술(상위 N) × 날짜 — 처음 나타난 때 · 몰린 때가 보인다
 *   ② 사분면: 가로 = 상상 수(얼마나 자주) · 세로 = Thunder 평균(얼마나 원하나) · 원 = Dreamer 수
 *   ③ 기술 표: 신호 · 비중 증감 · Thunder 평균 · Dreamer · 처음 등장 · 흐름선 · 함께 나온 욕망 (정렬 · CSV)
 *   그래프마다 [설정 ▾]: 기간 · 개수 · 신호 종류 (2026-11-13)
 */
export function TechTab({ period }: { period: PeriodKey }) {
  const { data, error } = useAnalytics<AnTech>("tech", period);
  if (!data) return <Loading error={error} />;
  const techs = data.techs;
  const signalCount = techs.reduce<Record<string, number>>((m, t) => ({ ...m, [t.signal]: (m[t.signal] ?? 0) + 1 }), {});

  return (
    <div className={styles.grid}>
      <p className={`${styles.lead} ${styles.wide}`}>
        이 기간 기술 태그 <b>{techs.length}</b>종 (상상 {data.total_posts}개) ·{" "}
        {(Object.keys(SIGNAL) as TechSignal["signal"][]).map((s, i) => (
          <span key={s}>
            {i ? " · " : ""}
            {SIGNAL[s].label} <b>{signalCount[s] ?? 0}</b>
          </span>
        ))}
      </p>

      <TechHeat page={period} />
      <TechQuadrant page={period} />
      <TechTable page={period} />
    </div>
  );
}

function TechHeat({ page }: { page: PeriodKey }) {
  const st = useSettings({ period: "page" as PanelPeriod, count: 20, order: "count" as "count" | "recent" });
  const { data, loading } = useAnalytics<AnTech>("tech", periodOf(page, st.v.period));
  if (!data) return null;
  const p = data.period;
  const ordered = st.v.order === "count" ? data.techs : [...data.techs].sort((a, b) => b.first_seen.localeCompare(a.first_seen) || b.count - a.count);
  const heat = ordered.slice(0, st.v.count);
  const evDays = new Set(data.events.map((e) => e.date));
  return (
    <Panel
      wide
      loading={loading}
      changed={st.changed}
      onReset={st.reset}
      settings={
        <>
          <PeriodSetting page={page} value={st.v.period} onChange={(v) => st.set("period", v)} />
          <CountSetting label="기술 수" options={[10, 20, 30, 40]} recommend={20} value={st.v.count} onChange={(v) => st.set("count", v)} why="한 화면에 다 보기 어려워요" />
          <ChoiceSetting
            label="고르는 기준"
            options={[
              { key: "count", label: "상상 많은 순" },
              { key: "recent", label: "최근 등장 순" },
            ]}
            value={st.v.order}
            onChange={(v) => st.set("order", v)}
          />
        </>
      }
      title="기술 흐름 히트맵"
      hint={`${st.v.order === "count" ? "상상이 많은" : "최근에 처음 나온"} 기술 ${heat.length}개가 ${p.unit === "week" ? "주" : "날"}마다 몇 번 상상됐는지예요. 진할수록 많아요. 새 기술이 처음 나타난 때와 몰린 때를 찾아보세요. 보라 밑줄 날짜 = 질문 시작.`}
      csv={() => downloadCsv(`기술_흐름_${p.start}.csv`, [["기술", ...p.buckets], ...heat.map((t) => [t.label, ...t.series])])}
    >
      {heat.length === 0 ? (
        <p className={styles.empty}>이 기간에 기술 태그가 없어요.</p>
      ) : (
        <Heatmap
          rows={heat.map((t) => `#${t.label}`)}
          cols={p.buckets}
          values={heat.map((t) => t.series)}
          showNumbers={p.buckets.length <= 31}
          cell={24}
          rowWidth={130}
          maxHeight={480}
          autoLabels
          colLabel={(c) => <span className={evDays.has(c) ? styles.evDay : undefined}>{shortDay(c)}</span>}
          tip={(r, c) => (
            <>
              <b>#{heat[r].label}</b>
              <TipRow label={p.unit === "week" ? `${shortDay(p.buckets[c])} 주` : shortDay(p.buckets[c])} value={`상상 ${heat[r].series[c]}개`} />
            </>
          )}
        />
      )}
    </Panel>
  );
}

function TechQuadrant({ page }: { page: PeriodKey }) {
  const st = useSettings({ period: "page" as PanelPeriod, kinds: SIGNALS, count: 40, labels: 10 });
  const { data, loading } = useAnalytics<AnTech>("tech", periodOf(page, st.v.period));
  if (!data) return null;
  const pts = data.techs.filter((t) => st.v.kinds.includes(t.signal)).slice(0, st.v.count);
  return (
    <Panel
      wide
      loading={loading}
      changed={st.changed}
      onReset={st.reset}
      settings={
        <>
          <PeriodSetting page={page} value={st.v.period} onChange={(v) => st.set("period", v)} />
          <PickSetting label="신호 종류" options={SIGNALS.map((k) => ({ key: k, label: SIGNAL[k].label }))} value={st.v.kinds} onChange={(v) => st.set("kinds", v)} />
          <CountSetting label="점 수" options={[20, 40, 60]} recommend={40} value={st.v.count} onChange={(v) => st.set("count", v)} why="점이 겹쳐 읽기 어려워요" />
          <CountSetting label="이름 표시" options={[5, 10, 15, 20]} recommend={10} value={st.v.labels} onChange={(v) => st.set("labels", v)} />
        </>
      }
      title="상상 빈도 × 욕망 강도"
      hint="가로 = 그 기술이 붙은 상상 수, 세로 = 그 상상들이 받은 Thunder 평균(얼마나 원하나), 원 크기 = 상상한 Dreamer 수. 점선은 가운데 값(중앙값)이에요. 네 칸 이름은 읽는 방법일 뿐이고, 해석은 운영자가 해요."
    >
      {pts.length === 0 ? (
        <p className={styles.empty}>이 기간에 기술 태그가 없어요.</p>
      ) : (
        <Scatter
          height={pts.length > 40 ? 440 : 360}
          labelTop={st.v.labels}
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
  const st = useSettings({ period: "page" as PanelPeriod, kinds: SIGNALS, count: 40 });
  const { data, loading } = useAnalytics<AnTech>("tech", periodOf(page, st.v.period));
  const [sort, setSort] = useState<Sort>({ key: "count", order: "desc" });
  if (!data) return null;
  const p = data.period;
  const val = (t: TechSignal) => (sort.key === "growth" ? (t.growth ?? -Infinity) : sort.key === "first_seen" ? Date.parse(t.first_seen) : (t[sort.key as keyof TechSignal] as number));
  const rows = data.techs
    .filter((t) => st.v.kinds.includes(t.signal))
    .sort((a, b) => (sort.order === "asc" ? val(a) - val(b) : val(b) - val(a)))
    .slice(0, st.v.count);
  return (
    <Panel
      wide
      loading={loading}
      changed={st.changed}
      onReset={st.reset}
      settings={
        <>
          <PeriodSetting page={page} value={st.v.period} onChange={(v) => st.set("period", v)} />
          <PickSetting label="신호 종류" options={SIGNALS.map((k) => ({ key: k, label: SIGNAL[k].label }))} value={st.v.kinds} onChange={(v) => st.set("kinds", v)} />
          <CountSetting label="줄 수" options={[20, 40, 60]} recommend={40} value={st.v.count} onChange={(v) => st.set("count", v)} why="표가 길어져요" />
        </>
      }
      title="기술 목록"
      hint="칸 이름 옆 아이콘으로 정렬해요. Dreamer 수가 상상 수보다 훨씬 적으면 한두 사람이 반복해서 쓴 기술일 수 있어요."
      csv={() =>
        downloadCsv(`기술_목록_${p.start}.csv`, [
          ["기술", "신호", "상상 수", "이전 기간", "비중 증감", "Thunder 합", "Thunder 평균", "Dreamer", "처음 등장", "주 분야", "함께 나온 욕망"],
          ...rows.map((t) => [t.label, SIGNAL[t.signal].label, t.count, t.prev, pct(t.growth), t.thunders, t.thunder_avg, t.authors, t.first_seen, DOMAIN_NAME[t.domain], t.desires.join(" | ")]),
        ])
      }
    >
      <ScrollBox min={1030}>
        <table className={`${adminStyles.table} ${styles.dataTable}`}>
          <colgroup>
            <col style={{ width: 180 }} />
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
                  <span className={styles.domainDot} style={{ background: DOMAIN_COLORS[t.domain] }} title={DOMAIN_NAME[t.domain]} /> #{t.label}
                </td>
                <td>
                  <SignalBadge signal={t.signal} />
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
