import { useState } from "react";
import { Link } from "react-router-dom";
import { Columns, PunchCard } from "../../../components/charts/basic";
import { DOMAIN_COLORS, fmt } from "../../../components/charts/core";
import { TimeChart } from "../../../components/charts/TimeChart";
import adminStyles from "../Admin.module.css";
import type { AnEngagement, AnTopPost, PeriodKey } from "../../../types/api";
import styles from "./Dashboard.module.css";
import { ActivationPanels } from "./ActivationPanels";
import { DOMAIN_NAME, KpiTile, Loading, Panel, downloadCsv, useAnalytics, ScrollBox } from "./parts";
import { ChoiceSetting, CountSetting, PeriodSetting, periodOf, usePeriodPanel, useSettings, type PanelPeriod } from "./settings";

const TOP_SORT: { key: keyof AnTopPost; label: string }[] = [
  { key: "total", label: "반응 합계" },
  { key: "thunders", label: "Thunder" },
  { key: "waves", label: "Wave" },
  { key: "bookmarks", label: "북마크" },
  { key: "quotes", label: "인용" },
];

/**
 * 반응 · 질문 · 활동 — 무엇이 공감을 얻었고, 질문이 상상을 이끌었고, 사람들은 언제 상상하나
 *   ① 반응 순위 상상 (이 기간에 받은 반응, 기준 고르기)  ② Thunder 분포
 *   ③ 질문에 답한 상상 vs 자유 상상 (쌓은 막대 + 질문별 표)  ④ 요일 × 시간 (글 · 반응) · 활동한 Dreamer 흐름
 *   ⑤ 신규 Dreamer 활성화 (ActivationPanels — 따로 부름)
 *   그래프마다 [설정 ▾]: 기간 (+ 순위 개수 · 막대 모양) (2026-11-13)
 */
export function EngagementTab({ period }: { period: PeriodKey }) {
  const { data, error } = useAnalytics<AnEngagement>("engagement", period);
  if (!data) return <Loading error={error} />;
  return (
    <div className={styles.grid}>
      <TopPanel page={period} />
      <HistogramPanel page={period} />
      <PromptVsFreePanel page={period} />
      <PromptsPanel page={period} />
      <PunchPanel page={period} kind="posts" />
      <PunchPanel page={period} kind="reactions" />
      <ActivePanel page={period} />
      <ActivationPanels period={period} />
    </div>
  );
}

function TopPanel({ page }: { page: PeriodKey }) {
  const st = useSettings({ period: "page" as PanelPeriod, count: 10 });
  const { data, loading } = useAnalytics<AnEngagement>("engagement", periodOf(page, st.v.period));
  const [by, setBy] = useState<keyof AnTopPost>("total");
  if (!data) return null;
  const p = data.period;
  const top = [...data.top].sort((a, b) => (b[by] as number) - (a[by] as number)).slice(0, st.v.count);
  return (
    <Panel
      wide
      loading={loading}
      title="반응 순위 상상"
      hint="이 기간에 받은 반응 기준이에요 (예전 글이 이번에 다시 주목받은 것도 보여요). 제목을 누르면 상상 상세로 가요."
      aside={
        <div className={adminStyles.seg} role="group" aria-label="순위 기준">
          {TOP_SORT.map((s) => (
            <button key={s.key} type="button" aria-pressed={by === s.key} onClick={() => setBy(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
      }
      csv={() =>
        downloadCsv(`반응_순위_${p.start}.csv`, [
          ["id", "제목", "작성자", "분야", "작성일", "Thunder", "Wave", "북마크", "인용", "합계", "질문 답"],
          ...top.map((t) => [t.id, t.title, t.author, DOMAIN_NAME[t.domain], t.created_at, t.thunders, t.waves, t.bookmarks, t.quotes, t.total, t.prompt ? "Y" : ""]),
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
      {top.length === 0 ? (
        <p className={styles.empty}>이 기간에 반응이 없어요.</p>
      ) : (
        <ScrollBox min={780}>
          <table className={`${adminStyles.table} ${styles.dataTable}`}>
            <colgroup>
              <col style={{ width: 36 }} />
              <col />
              <col style={{ width: 110 }} />
              <col style={{ width: 70 }} />
              <col style={{ width: 70 }} />
              <col style={{ width: 70 }} />
              <col style={{ width: 70 }} />
              <col style={{ width: 70 }} />
            </colgroup>
            <thead>
              <tr>
                <th>#</th>
                <th>상상</th>
                <th>작성자</th>
                {TOP_SORT.map((s) => (
                  <th key={s.key} className={by === s.key ? styles.thOn : undefined}>
                    {s.key === "total" ? "합계" : s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {top.map((t, i) => (
                <tr key={t.id}>
                  <td className={styles.muted}>{i + 1}</td>
                  <td className={styles.left}>
                    <span className={styles.domainDot} style={{ background: DOMAIN_COLORS[t.domain] }} title={DOMAIN_NAME[t.domain]} />{" "}
                    <Link to={`/i/${t.id}`} className={styles.link}>
                      {t.title}
                    </Link>
                    {t.prompt ? <span className={styles.promptTag}>질문 답</span> : null}
                  </td>
                  <td className={styles.muted}>{t.author}</td>
                  {TOP_SORT.map((s) => (
                    <td key={s.key} className={`${styles.num} ${by === s.key ? styles.tdOn : ""}`}>
                      {t[s.key] as number}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollBox>
      )}
    </Panel>
  );
}

function HistogramPanel({ page }: { page: PeriodKey }) {
  const { data, panel } = usePeriodPanel<AnEngagement>("engagement", page);
  if (!data) return null;
  return (
    <Panel {...panel} title="Thunder 분포" hint="이 기간에 올라온 상상이 받은 Thunder 수. 소수의 상상에 몰리는지, 고르게 퍼지는지 봐요.">
      <Columns items={data.histogram} color="var(--color-chart-thunder)" unit="개" />
    </Panel>
  );
}

function PromptVsFreePanel({ page }: { page: PeriodKey }) {
  const st = useSettings({ period: "page" as PanelPeriod, shape: "bar" as "bar" | "line" });
  const { data, loading } = useAnalytics<AnEngagement>("engagement", periodOf(page, st.v.period));
  if (!data) return null;
  const p = data.period;
  const answered = data.prompt_series.reduce((s, v) => s + v, 0);
  const free = data.free_series.reduce((s, v) => s + v, 0);
  return (
    <Panel
      loading={loading}
      title="질문에 답한 상상 vs 자유 상상"
      hint="이번 주 질문이 상상을 얼마나 이끌어 내는지 봐요. 원본 상상만 세요."
      changed={st.changed}
      onReset={st.reset}
      settings={
        <>
          <PeriodSetting page={page} value={st.v.period} onChange={(v) => st.set("period", v)} />
          <ChoiceSetting
            label="모양"
            options={[
              { key: "bar", label: "쌓은 막대" },
              { key: "line", label: "선" },
            ]}
            value={st.v.shape}
            onChange={(v) => st.set("shape", v)}
          />
        </>
      }
    >
      <div className={styles.kpis2}>
        <KpiTile label="질문에 답한 상상" value={answered} color="var(--viz-7)" note={answered + free ? `${fmt((answered / (answered + free)) * 100)}%` : undefined} />
        <KpiTile label="자유 상상" value={free} note={`Thunder 평균 ${fmt(data.free_thunder_avg, 1)}`} />
      </div>
      <TimeChart
        buckets={p.buckets}
        unit={p.unit}
        mode={st.v.shape}
        height={180}
        events={data.events.map((e) => ({ date: e.date, label: e.label }))}
        series={[
          { key: "free", label: "자유 상상", color: "var(--viz-1)", values: data.free_series },
          { key: "prompt", label: "질문에 답한 상상", color: "var(--viz-2)", values: data.prompt_series },
        ]}
      />
    </Panel>
  );
}

function PromptsPanel({ page }: { page: PeriodKey }) {
  const { data, panel } = usePeriodPanel<AnEngagement>("engagement", page);
  if (!data) return null;
  return (
    <Panel {...panel} wide title="질문별 반응" hint="질문에 답한 상상이 받은 Thunder 평균을 자유 상상 평균과 비교해요. 사람들이 공감하는 질문을 찾는 단서예요.">
      {data.prompts.length === 0 ? (
        <p className={styles.empty}>이 기간에 진행한 질문이 없어요.</p>
      ) : (
        <ScrollBox min={720}>
          <table className={`${adminStyles.table} ${styles.dataTable}`}>
            <colgroup>
              <col />
              <col style={{ width: 150 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 160 }} />
            </colgroup>
            <thead>
              <tr>
                <th>질문</th>
                <th>기간</th>
                <th>답한 상상</th>
                <th>답한 사람</th>
                <th>Thunder 평균 (자유 {fmt(data.free_thunder_avg, 1)})</th>
              </tr>
            </thead>
            <tbody>
              {data.prompts.map((q) => (
                <tr key={q.id}>
                  <td className={styles.left}>
                    <Link to={`/prompts/${q.id}`} className={styles.link}>
                      {q.title}
                    </Link>
                  </td>
                  <td className={styles.muted}>
                    {q.starts_at.slice(5)} ~ {q.ends_at ? q.ends_at.slice(5) : "끝 없음"}
                  </td>
                  <td className={styles.num}>{q.answers}</td>
                  <td className={styles.num}>{q.answerers}명</td>
                  <td className={styles.num}>
                    {q.answers ? fmt(q.thunder_avg, 1) : "—"}
                    {q.answers ? <span className={q.thunder_avg >= data.free_thunder_avg ? styles.up : styles.down}> {q.thunder_avg >= data.free_thunder_avg ? "▲" : "▼"}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollBox>
      )}
    </Panel>
  );
}

function PunchPanel({ page, kind }: { page: PeriodKey; kind: "posts" | "reactions" }) {
  const { data, panel } = usePeriodPanel<AnEngagement>("engagement", page);
  if (!data) return null;
  return kind === "posts" ? (
    <Panel {...panel} title="언제 상상하나 — 글" hint="요일 × 시간(한국 시간)별 글(상상 · 댓글) 수. 원이 클수록 많아요.">
      <PunchCard values={data.punch_posts} color="var(--viz-1)" label="글" />
    </Panel>
  ) : (
    <Panel {...panel} title="언제 반응하나 — Thunder · Wave · 북마크" hint="요일 × 시간별 반응 수. 글 쓰는 시간과 반응하는 시간이 다를 수 있어요.">
      <PunchCard values={data.punch_reactions} color="var(--color-chart-thunder)" label="반응" />
    </Panel>
  );
}

function ActivePanel({ page }: { page: PeriodKey }) {
  const { data, panel } = usePeriodPanel<AnEngagement>("engagement", page);
  if (!data) return null;
  const p = data.period;
  return (
    <Panel {...panel} wide title="활동한 Dreamer" hint="날마다(긴 기간은 주마다) 글을 쓰거나 반응한 Dreamer 수예요.">
      <TimeChart
        buckets={p.buckets}
        unit={p.unit}
        height={180}
        events={data.events.map((e) => ({ date: e.date, label: e.label }))}
        series={[{ key: "active", label: "활동한 Dreamer", color: "var(--viz-3)", values: data.active_users }]}
        format={(n) => fmt(n)}
      />
    </Panel>
  );
}
