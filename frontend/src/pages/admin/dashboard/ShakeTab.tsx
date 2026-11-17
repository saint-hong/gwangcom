import { useState } from "react";
import { Link } from "react-router-dom";
import { Bars, Columns } from "../../../components/charts/basic";
import { fmt } from "../../../components/charts/core";
import { TimeChart } from "../../../components/charts/TimeChart";
import adminStyles from "../Admin.module.css";
import type { AnShake, PeriodKey } from "../../../types/api";
import styles from "./Dashboard.module.css";
import { DOMAIN_NAME, KpiTile, Loading, Panel, downloadCsv, useAnalytics, ScrollBox } from "./parts";
import { CountSetting, PeriodSetting, periodOf, usePeriodPanel, useSettings, type PanelPeriod } from "./settings";
import { SortHeader, type Sort, type SortOption } from "../SortHeader";

type Material = AnShake["materials"][number];
/** 재료 상상 표 정렬 (2026-11-17) — "재료로 쓰임" 많은 순으로 N개를 고른 뒤, 다른 칸은 그 안에서 순서만 바꾼다 (# = 쓰임 순위 그대로) */
const MATERIAL_SORTS: Record<"domain" | "author" | "created_at" | "uses" | "thunders", SortOption[]> = {
  domain: [
    { key: "domain", order: "asc", label: "A → Z 순" },
    { key: "domain", order: "desc", label: "Z → A 순" },
  ],
  author: [
    { key: "author", order: "asc", label: "가나다 순" },
    { key: "author", order: "desc", label: "가나다 역순" },
  ],
  created_at: [
    { key: "created_at", order: "desc", label: "최신 순" },
    { key: "created_at", order: "asc", label: "오래된 순" },
  ],
  uses: [{ key: "uses", order: "desc", label: "많이 쓰인 순" }],
  thunders: [
    { key: "thunders", order: "desc", label: "많은 순" },
    { key: "thunders", order: "asc", label: "적은 순" },
  ],
};

/**
 * Shake it — 놀이 영역 (대중 상상 지표와 따로, 원칙 3)
 *   핵심 숫자(혼합 글 · 삭제율 · Thunder 평균 · 조합 시너지 = 재료와의 Thunder 차이 평균 — 2026-11-17 고르는 시간 카드 뺌)
 *   ① 혼합 흐름 · 시도 결과 (흐름 / 시도 상태 · 계보 깊이 나란히)  ② 많이 섞인 분야 쌍  ③ 재료로 많이 쓰인 상상 (표)
 *   2026-11-17 상자 묶음 (다른 탭과 같은 기준: 그래프 → 표 · 머리글 정렬).
 *   분야 쌍과 재료는 다른 개념이라 상자 · 설정(기간 · 개수)을 따로 둔다 (사용자 결정)
 */
export function ShakeTab({ period }: { period: PeriodKey }) {
  const { data, error } = useAnalytics<AnShake>("shake", period);
  if (!data) return <Loading error={error} />;
  const all = data.blends + data.deleted;
  return (
    <div className={styles.grid}>
      <p className={`${styles.lead} ${styles.wide}`}>
        설정한 기간 내에 Shake it 기능으로 생성 된 혼합글에 대한 지표 (혼합글 Thunder 평균값은 설정 기간내 생성 된 혼합글 대상, 조합 시너지는 설정 기간 내 생성 된 혼합글과 해당 재료의 첫 7일간의 Thunder 를 비교함)
      </p>
      <div className={`${styles.kpis} ${styles.wide}`}>
        <KpiTile label="혼합 글" value={data.blends} series={data.series} color="var(--viz-7)" />
        <KpiTile label="지운 혼합 글" value={data.deleted} note={all ? `삭제율 ${fmt((data.deleted / all) * 100)}%` : undefined} />
        <KpiTile label="혼합 글 Thunder 평균" value={data.blend_thunder_avg} format={(n) => fmt(n, 2)} />
        {/* 조합 시너지 (2026-11-17): 혼합 글마다 자기 재료와 게시 후 같은 기간(최대 7일) Thunder 차이 → 평균 */}
        <KpiTile
          label="조합 시너지"
          value={data.synergy_diff ?? 0}
          format={(n) => (data.synergy_diff === null ? "—" : `${n > 0 ? "+" : ""}${fmt(n, 1)}`)}
          unit={data.synergy_diff === null ? "" : "Thunder"}
          note={data.synergy_n ? `혼합 글 ${data.synergy_n}개 중 ${data.synergy_beat}개가 재료보다 많이 받음` : undefined}
          title="혼합 글마다 자기 재료(평균)보다 Thunder 를 몇 개 더 받았는지의 평균. 둘 다 게시 후 같은 기간(최대 7일) 동안 받은 수로 비교해요."
        />
      </div>
      <FlowPanel page={period} />
      <PairsPanel page={period} />
      <MaterialsPanel page={period} />
    </div>
  );
}

/** ① 혼합 흐름 · 시도 결과 — 설정(기간)은 하나로 세 그래프에 함께 적용 */
function FlowPanel({ page }: { page: PeriodKey }) {
  const { data, panel } = usePeriodPanel<AnShake>("shake", page);
  if (!data) return null;
  const p = data.period;
  return (
    <Panel {...panel} wide title="① 혼합 흐름 · 시도 결과">
      <h4 className={styles.subTitle}>혼합 흐름</h4>
      <p className={styles.subHint}>설정한 기간 내에 날마다(긴 기간은 주마다) 올라온 혼합 글 수 그래프</p>
      <TimeChart buckets={p.buckets} unit={p.unit} mode="bar" height={170} series={[{ key: "b", label: "혼합 글", color: "var(--viz-7)", values: data.series }]} />

      <div className={`${styles.subPair} ${styles.subTitleGap}`}>
        <div>
          <h4 className={styles.subTitle}>시도 상태</h4>
          <p className={styles.subHint}>설정한 기간 내에 Shake it 을 누른 뒤의 결과 (게시 · 실패 · 진행 중 등)</p>
          <Bars labelWidth={120} color="var(--viz-7)" items={Object.entries(data.attempts).map(([k, n]) => ({ key: k, label: ATTEMPT[k] ?? k, value: n }))} />
        </div>
        <div>
          <h4 className={styles.subTitle}>계보 깊이</h4>
          <p className={styles.subHint}>설정한 기간 내 혼합 글을 다시 섞은 단계 수 (1단계 = 원본 두 개를 섞음)</p>
          <Columns items={data.depths.map(([d, n]) => [`${d}단계`, n])} color="var(--viz-7)" height={140} />
        </div>
      </div>
    </Panel>
  );
}

/** ② 많이 섞인 분야 쌍 — 설정(기간 · 개수)은 재료 표와 따로 */
function PairsPanel({ page }: { page: PeriodKey }) {
  const st = useSettings({ period: "page" as PanelPeriod, count: 10 });
  const { data, loading } = useAnalytics<AnShake>("shake", periodOf(page, st.v.period));
  if (!data) return null;
  const p = data.period;
  const pairs = data.domain_pairs.slice(0, st.v.count);
  return (
    <Panel
      wide
      loading={loading}
      title="② 많이 섞인 분야 쌍"
      hint="설정한 기간 내 혼합 글의 두 재료 상상의 분야 조합 그래프"
      changed={st.changed}
      onReset={st.reset}
      csv={() => downloadCsv(`분야쌍_${p.start}.csv`, [["분야 1", "분야 2", "혼합 수"], ...pairs])}
      settings={
        <>
          <PeriodSetting page={page} value={st.v.period} onChange={(v) => st.set("period", v)} />
          <CountSetting label="개수" options={[5, 10, 20]} recommend={10} value={st.v.count} onChange={(v) => st.set("count", v)} why="목록이 길어져요" note="* 분야 쌍 그래프의 막대 개수" />
        </>
      }
    >
      {pairs.length === 0 ? (
        <p className={styles.empty}>아직 없어요.</p>
      ) : (
        <Bars labelWidth={200} color="var(--viz-7)" items={pairs.map(([a, b, n]) => ({ key: `${a}|${b}`, label: `${a} + ${b}`, value: n }))} />
      )}
    </Panel>
  );
}

/** ③ 재료로 많이 쓰인 상상 (표) — 설정(기간 · 개수)은 분야 쌍과 따로 */
function MaterialsPanel({ page }: { page: PeriodKey }) {
  const st = useSettings({ period: "page" as PanelPeriod, count: 10 });
  const { data, loading } = useAnalytics<AnShake>("shake", periodOf(page, st.v.period));
  const [sort, setSort] = useState<Sort>({ key: "uses", order: "desc" });
  if (!data) return null;
  const p = data.period;
  const ranked = data.materials.slice(0, st.v.count); // 서버가 쓰임 많은 순으로 보냄
  const rank = new Map(ranked.map((m, i) => [m.id, i + 1]));
  const text = (m: Material): string => (sort.key === "domain" ? DOMAIN_NAME[m.domain] : sort.key === "author" ? m.author : m.created_at);
  const rows =
    sort.key === "uses"
      ? ranked
      : [...ranked].sort((a, b) => {
          const diff = sort.key === "thunders" ? a.thunders - b.thunders : text(a).localeCompare(text(b), "ko");
          return (sort.order === "asc" ? diff : -diff) || rank.get(a.id)! - rank.get(b.id)!;
        });
  return (
    <Panel
      wide
      loading={loading}
      title="③ 재료로 많이 쓰인 상상"
      hint="설정한 기간 내 다른 Dreamer가 섞고 싶어 한 상상 테이블 (Thunder 는 그 상상이 지금까지 받은 수)"
      changed={st.changed}
      onReset={st.reset}
      csv={() =>
        downloadCsv(`Shake_재료_${p.start}.csv`, [
          ["id", "상상", "분야", "작성자", "게시일", "재료로 쓰임", "Thunder"],
          ...rows.map((m) => [m.id, m.title, DOMAIN_NAME[m.domain], m.author, m.created_at, m.uses, m.thunders]),
        ])
      }
      settings={
        <>
          <PeriodSetting page={page} value={st.v.period} onChange={(v) => st.set("period", v)} />
          <CountSetting label="개수" options={[5, 10, 20]} recommend={10} value={st.v.count} onChange={(v) => st.set("count", v)} why="표가 길어져요" note="* 재료 상상 테이블의 상상 개수" />
        </>
      }
    >
      {rows.length === 0 ? (
        <p className={styles.empty}>아직 없어요.</p>
      ) : (
        <ScrollBox min={820}>
          <table className={`${adminStyles.table} ${styles.dataTable}`}>
            <colgroup>
              <col style={{ width: 36 }} />
              <col />
              <col style={{ width: 100 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 86 }} />
            </colgroup>
            <thead>
              <tr>
                <th>#</th>
                <th>상상</th>
                <th>
                  <SortHeader label="분야" options={MATERIAL_SORTS.domain} value={sort} onChange={setSort} />
                </th>
                <th>
                  <SortHeader label="작성자" options={MATERIAL_SORTS.author} value={sort} onChange={setSort} />
                </th>
                <th>
                  <SortHeader label="게시일" options={MATERIAL_SORTS.created_at} value={sort} onChange={setSort} />
                </th>
                <th className={styles.thOn}>
                  <SortHeader label="재료로 쓰임" options={MATERIAL_SORTS.uses} value={sort} onChange={setSort} />
                </th>
                <th>
                  <SortHeader label="Thunder" options={MATERIAL_SORTS.thunders} value={sort} onChange={setSort} alignRight />
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td className={styles.muted}>{rank.get(m.id)}</td>
                  <td className={styles.left}>
                    <Link to={`/i/${m.id}`} className={styles.link}>
                      {m.title}
                    </Link>
                  </td>
                  <td>{DOMAIN_NAME[m.domain]}</td>
                  <td className={styles.muted}>{m.author}</td>
                  <td className={styles.muted}>{m.created_at}</td>
                  <td className={`${styles.num} ${styles.tdOn}`}>{m.uses}</td>
                  <td className={styles.num}>{m.thunders}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollBox>
      )}
    </Panel>
  );
}

const ATTEMPT: Record<string, string> = { published: "게시됨", failed: "실패", processing: "진행 중", limited: "한도 초과", refused: "거절됨" };
