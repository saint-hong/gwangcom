import { Sparkles } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Histogram, PunchCard } from "../../../components/charts/basic";
import { fmt } from "../../../components/charts/core";
import { TimeChart } from "../../../components/charts/TimeChart";
import adminStyles from "../Admin.module.css";
import type { AiSummary, AnEngagement, PeriodKey } from "../../../types/api";
import styles from "./Dashboard.module.css";
import { ActivationPanels } from "./ActivationPanels";
import { DOMAIN_NAME, KpiTile, Loading, Panel, downloadCsv, useAnalytics, ScrollBox } from "./parts";
import { ChoiceSetting, CountSetting, PeriodSetting, periodOf, usePeriodPanel, useSettings, type PanelPeriod } from "./settings";
import { SortHeader, type Sort, type SortOption } from "../SortHeader";

type TopKey = "total" | "thunders" | "waves" | "bookmarks" | "quotes";
/** 반응 순위 칸 — 머리글에서 많은 순으로 정렬 (2026-11-16: 위 기준 버튼 → 머리글 정렬, 다른 탭과 같은 방식).
 *  순위 표라 많은 순만 둔다. 서버가 기준마다 상위 30개를 모아 보낸다 */
const TOP_COLS: { key: TopKey; label: string }[] = [
  { key: "thunders", label: "Thunder" },
  { key: "waves", label: "Wave" },
  { key: "bookmarks", label: "북마크" },
  { key: "quotes", label: "인용" },
  { key: "total", label: "합계" },
];
const topSort = (key: TopKey, label: string): SortOption[] => [{ key, order: "desc", label: `${label} 많은 순` }];
const isTopKey = (k: string): k is TopKey => TOP_COLS.some((c) => c.key === k);
/** 분야 · 욕망 · 작성자 · 게시일 정렬 (2026-11-16) — 반응 순위로 고른 상상들의 순서만 바꾼다 (# = 반응 순위 그대로) */
const TOP_TEXT_SORTS: Record<"domain" | "desire" | "author" | "created_at", SortOption[]> = {
  domain: [
    { key: "domain", order: "asc", label: "A → Z 순" },
    { key: "domain", order: "desc", label: "Z → A 순" },
  ],
  desire: [
    { key: "desire", order: "asc", label: "가나다 순" },
    { key: "desire", order: "desc", label: "가나다 역순" },
  ],
  author: [
    { key: "author", order: "asc", label: "가나다 순" },
    { key: "author", order: "desc", label: "가나다 역순" },
  ],
  created_at: [
    { key: "created_at", order: "desc", label: "최신 순" },
    { key: "created_at", order: "asc", label: "오래된 순" },
  ],
};

type PromptRow = AnEngagement["prompts"][number];
/** 질문별 반응 정렬 (2026-11-16). 기본 = 시작일 최신 순 */
const PROMPT_SORTS: Record<string, SortOption[]> = {
  starts_at: [
    { key: "starts_at", order: "desc", label: "최신 순" },
    { key: "starts_at", order: "asc", label: "오래된 순" },
  ],
  answers: [
    { key: "answers", order: "desc", label: "많은 순" },
    { key: "answers", order: "asc", label: "적은 순" },
  ],
  answerers: [
    { key: "answerers", order: "desc", label: "많은 순" },
    { key: "answerers", order: "asc", label: "적은 순" },
  ],
  thunder_avg: [
    { key: "thunder_avg", order: "desc", label: "Thunder 평균 높은 순" },
    { key: "thunder_avg", order: "asc", label: "Thunder 평균 낮은 순" },
  ],
};

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
      <PromptVsFreePanel page={period} />
      <ActivityPanel page={period} />
      <ActivationPanels period={period} />
    </div>
  );
}

function TopPanel({ page }: { page: PeriodKey }) {
  const st = useSettings({ period: "page" as PanelPeriod, count: 10 });
  const { data, loading } = useAnalytics<AnEngagement>("engagement", periodOf(page, st.v.period));
  const [sort, setSortRaw] = useState<Sort>({ key: "total", order: "desc" });
  const [by, setBy] = useState<TopKey>("total"); // 어떤 반응으로 순위를 매겨 N개를 고를지
  const setSort = (v: Sort) => {
    setSortRaw(v);
    if (isTopKey(v.key)) setBy(v.key);
  };
  const ai = useAnalytics<AiSummary>("engagement/summary", periodOf(page, st.v.period));
  if (!data) return null;
  const p = data.period;
  const ranked = [...data.top].sort((a, b) => b[by] - a[by] || b.total - a.total || b.id - a.id).slice(0, st.v.count);
  const rank = new Map(ranked.map((t, i) => [t.id, i + 1]));
  type Top = (typeof ranked)[number];
  const text = (t: Top): string =>
    sort.key === "domain" ? DOMAIN_NAME[t.domain] : sort.key === "desire" ? (t.desires[0] ?? "") : sort.key === "author" ? t.author : t.created_at;
  const top = isTopKey(sort.key)
    ? ranked
    : [...ranked].sort((a, b) => {
        const x = text(a);
        const y = text(b);
        if (!x || !y) return x === y ? 0 : x ? -1 : 1; // 욕망 없는 상상은 맨 뒤
        const diff = x.localeCompare(y, "ko");
        return (sort.order === "asc" ? diff : -diff) || rank.get(a.id)! - rank.get(b.id)!;
      });
  return (
    <Panel
      wide
      loading={loading}
      title="Thunder 분포 · 반응 순위"
      csv={() =>
        downloadCsv(`반응_순위_${p.start}.csv`, [
          ["id", "제목", "분야", "욕망", "작성자", "게시일", "Thunder", "Wave", "북마크", "인용", "합계", "질문 답"],
          ...top.map((t) => [t.id, t.title, DOMAIN_NAME[t.domain], t.desires.join(" | "), t.author, t.created_at, t.thunders, t.waves, t.bookmarks, t.quotes, t.total, t.prompt ? "Y" : ""]),
        ])
      }
      changed={st.changed}
      onReset={st.reset}
      settings={
        <>
          <PeriodSetting page={page} value={st.v.period} onChange={(v) => st.set("period", v)} />
          <CountSetting label="개수" options={[10, 20, 30]} recommend={20} value={st.v.count} onChange={(v) => st.set("count", v)} why="표가 길어져요" note="* 반응 순위 테이블의 상상 개수" />
        </>
      }
    >
      {/* AI 분석 (2026-11-16): 반응이 어떤 상상에 쏠렸는지 설명만. 판단은 운영자가 한다 (사용자 상세와 같은 모양) */}
      <div className={`${adminStyles.aiBox} ${styles.aiBoxDash}`} aria-live="polite">
        <div className={adminStyles.aiHead}>
          <Sparkles aria-hidden="true" />
          <span>AI가 분석했어요.</span>
        </div>
        <p className={`${adminStyles.aiText} ${ai.data?.summary ? "" : adminStyles.aiMuted}`}>
          {ai.error ? "지금은 AI 분석을 불러오지 못했어요." : !ai.data || ai.loading ? "반응을 살펴보는 중…" : (ai.data.summary ?? ai.data.error)}
        </p>
      </div>

      <h4 className={styles.subTitle}>Thunder 분포</h4>
      <p className={styles.subHint}>설정한 기간에 올라온 상상이 지금까지 받은 Thunder 수별 상상 수 그래프 (몇몇 상상에 몰리는지, 고르게 퍼지는지를 보여 줌)</p>
      <Histogram
        items={data.histogram}
        normal={data.histogram_normal}
        color="var(--viz-hist-bar)"
        xTitle="받은 Thunder 수"
        yTitle="상상 수"
        itemLabel={(l) => `Thunder ${l}개 받은 상상`}
      />
      <p className={styles.histStats}>
        평균 {fmt(data.thunder_mean, 1)} · 중앙값 {fmt(data.thunder_median, 1)} · 표준편차 {fmt(data.thunder_sd, 1)}
      </p>

      <h4 className={`${styles.subTitle} ${styles.subTitleGap}`}>반응 순위</h4>
      <p className={styles.subHint}>설정한 기간에 반응을 많이 받은 상상 순위 테이블 (설정한 기간보다 과거에 작성 된 상상도 순위에 포함될 수 있음)</p>
      {top.length === 0 ? (
        <p className={styles.empty}>이 기간에 반응이 없어요.</p>
      ) : (
        <ScrollBox min={1120}>
          <table className={`${adminStyles.table} ${styles.dataTable}`}>
            <colgroup>
              <col style={{ width: 36 }} />
              <col />
              <col style={{ width: 100 }} />
              <col style={{ width: 160 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 86 }} />
              <col style={{ width: 76 }} />
              <col style={{ width: 76 }} />
              <col style={{ width: 70 }} />
              <col style={{ width: 70 }} />
            </colgroup>
            <thead>
              <tr>
                <th>#</th>
                <th>상상</th>
                <th>
                  <SortHeader label="분야" options={TOP_TEXT_SORTS.domain} value={sort} onChange={setSort} />
                </th>
                <th>
                  <SortHeader label="욕망" options={TOP_TEXT_SORTS.desire} value={sort} onChange={setSort} />
                </th>
                <th>
                  <SortHeader label="작성자" options={TOP_TEXT_SORTS.author} value={sort} onChange={setSort} />
                </th>
                <th>
                  <SortHeader label="게시일" options={TOP_TEXT_SORTS.created_at} value={sort} onChange={setSort} />
                </th>
                {TOP_COLS.map((c) => (
                  <th key={c.key} className={by === c.key ? styles.thOn : undefined}>
                    <SortHeader label={c.label} options={topSort(c.key, c.label)} value={sort} onChange={setSort} alignRight={c.key === "total"} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {top.map((t) => (
                <tr key={t.id}>
                  <td className={styles.muted}>{rank.get(t.id)}</td>
                  <td className={styles.left}>
                    <Link to={`/i/${t.id}`} className={styles.link}>
                      {t.title}
                    </Link>
                    {t.prompt ? <span className={styles.promptTag}>질문 답</span> : null}
                  </td>
                  <td>{DOMAIN_NAME[t.domain]}</td>
                  <td className={`${styles.left} ${styles.muted}`} title={t.desires.join(" · ")}>
                    {t.desires.join(" · ") || "—"}
                  </td>
                  <td className={styles.muted}>{t.author}</td>
                  <td className={styles.muted}>{t.created_at}</td>
                  {TOP_COLS.map((c) => (
                    <td key={c.key} className={`${styles.num} ${by === c.key ? styles.tdOn : ""}`}>
                      {t[c.key]}
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

function PromptVsFreePanel({ page }: { page: PeriodKey }) {
  const st = useSettings({ period: "page" as PanelPeriod, shape: "bar" as "bar" | "line" });
  const { data, loading } = useAnalytics<AnEngagement>("engagement", periodOf(page, st.v.period));
  if (!data) return null;
  const p = data.period;
  const answered = data.prompt_series.reduce((s, v) => s + v, 0);
  const free = data.free_series.reduce((s, v) => s + v, 0);
  return (
    <Panel
      wide
      loading={loading}
      title="질문에 답한 상상 · 질문별 반응"
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
      <h4 className={styles.subTitle}>질문에 답한 상상 vs 자유 상상</h4>
      <p className={styles.subHint}>설정한 기간 내 질문에 대한 상상과 자유 상상을 비교하는 그래프</p>
      <div className={styles.kpis2}>
        <KpiTile label="질문에 답한 상상" value={answered} color="var(--viz-7)" note={answered + free ? `원본 상상 중 ${fmt((answered / (answered + free)) * 100)}%` : undefined} />
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

      <h4 className={`${styles.subTitle} ${styles.subTitleGap}`}>질문별 반응</h4>
      <p className={styles.subHint}>설정한 기간 내 질문에 답한 상상에 대한 반응 테이블 (자유 상상의 Thunder 평균값과 비교)</p>
      <PromptsTable data={data} />
    </Panel>
  );
}

/** 질문별 반응 표 — 위 "질문에 답한 상상 vs 자유 상상"과 한 상자 (2026-11-16) */
function PromptsTable({ data }: { data: AnEngagement }) {
  const [sort, setSort] = useState<Sort>({ key: "starts_at", order: "desc" });
  const val = (q: PromptRow) => (sort.key === "starts_at" ? q.starts_at : q[sort.key as "answers" | "answerers" | "thunder_avg"]);
  const prompts = [...data.prompts].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    const diff = x === y ? 0 : sort.order === "asc" ? (x < y ? -1 : 1) : x > y ? -1 : 1;
    return diff || b.starts_at.localeCompare(a.starts_at);
  });
  return data.prompts.length === 0 ? (
    <p className={styles.empty}>이 기간에 진행한 질문이 없어요.</p>
  ) : (
    <ScrollBox min={780}>
      <table className={`${adminStyles.table} ${styles.dataTable}`}>
        <colgroup>
          <col />
          <col style={{ width: 150 }} />
          <col style={{ width: 100 }} />
          <col style={{ width: 100 }} />
          <col style={{ width: 190 }} />
        </colgroup>
        <thead>
          <tr>
            <th>질문</th>
            <th>
              <SortHeader label="기간" options={PROMPT_SORTS.starts_at} value={sort} onChange={setSort} />
            </th>
            <th>
              <SortHeader label="답한 상상" options={PROMPT_SORTS.answers} value={sort} onChange={setSort} />
            </th>
            <th>
              <SortHeader label="답한 사람" options={PROMPT_SORTS.answerers} value={sort} onChange={setSort} />
            </th>
            <th>
              <SortHeader label={`Thunder 평균 (자유 ${fmt(data.free_thunder_avg, 1)})`} options={PROMPT_SORTS.thunder_avg} value={sort} onChange={setSort} alignRight />
            </th>
          </tr>
        </thead>
        <tbody>
          {prompts.map((q) => (
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
  );
}

/**
 * Dreamer 활동량 (2026-11-16 사용자 요청으로 한 상자) — 위: 활동한 Dreamer 흐름, 아래: 언제 상상하나 · 언제 반응하나 (나란히)
 *   설정(기간)은 하나로 세 그래프에 함께 적용. 요일 × 시간은 한국 시간 기준
 */
function ActivityPanel({ page }: { page: PeriodKey }) {
  const { data, panel } = usePeriodPanel<AnEngagement>("engagement", page);
  if (!data) return null;
  const p = data.period;
  return (
    <Panel {...panel} wide title="Dreamer 활동량">
      <h4 className={styles.subTitle}>활동한 Dreamer</h4>
      <p className={styles.subHint}>설정한 기간 내에 Dreamer가 글을 쓰고, 반응한 수를 나타내는 그래프</p>
      <TimeChart
        buckets={p.buckets}
        unit={p.unit}
        height={180}
        events={data.events.map((e) => ({ date: e.date, label: e.label }))}
        series={[{ key: "active", label: "활동한 Dreamer", color: "var(--viz-3)", values: data.active_users }]}
        format={(n) => fmt(n)}
      />

      <div className={`${styles.subPair} ${styles.subTitleGap}`}>
        <div>
          <h4 className={styles.subTitle}>언제 상상하나 — 글</h4>
          <p className={styles.subHint}>요일과 시간에 따른 상상 + 댓글의 활동량 그래프 (원이 클 수록 상상 + 댓글수가 많음)</p>
          <PunchCard values={data.punch_posts} color="var(--viz-1)" label="글" />
        </div>
        <div>
          <h4 className={styles.subTitle}>언제 반응하나 — Thunder · Wave · 북마크</h4>
          <p className={styles.subHint}>요일과 시간에 따른 반응(Thunder, Wave, 북마크)의 활동량 그래프</p>
          <PunchCard values={data.punch_reactions} color="var(--color-chart-thunder)" label="반응" />
        </div>
      </div>
    </Panel>
  );
}
