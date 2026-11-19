import { ChevronDown, ChevronUp } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../../api/client";
import { Bars, Sparkline } from "../../../components/charts/basic";
import { TipRow, fmt, shortDay } from "../../../components/charts/core";
import { Scatter } from "../../../components/charts/relations";
import { TimeChart } from "../../../components/charts/TimeChart";
import type { Bundle, GraphBundles } from "../../../types/api";
import adminStyles from "../Admin.module.css";
import dash from "../dashboard/Dashboard.module.css";
import { DOMAIN_NAME, Panel, SIGNAL, SIGNAL_COLOR, SignalBadge, downloadCsv, pct } from "../dashboard/parts";
import { SortHeader, type Sort, type SortOption } from "../SortHeader";
import { queryString, type GraphQuery } from "./AdminGraphPage";
import type { Seed } from "./ExploreView";
import styles from "./Graph.module.css";

const SORTS: Record<string, SortOption[]> = {
  size: [
    { key: "size", order: "desc", label: "상상 많은 순" },
    { key: "size", order: "asc", label: "상상 적은 순" },
  ],
  dreamers: [
    { key: "dreamers", order: "desc", label: "Dreamer 많은 순" },
    { key: "dreamers", order: "asc", label: "Dreamer 적은 순" },
  ],
  first: [
    { key: "first", order: "desc", label: "최근에 처음 나온 순" },
    { key: "first", order: "asc", label: "오래전에 처음 나온 순" },
  ],
  trend: [
    { key: "trend", order: "desc", label: "최근으로 쏠린 순" },
    { key: "trend", order: "asc", label: "예전으로 쏠린 순" },
  ],
};

const day = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}.${d.getDate()}`;
};

/**
 * 경향 다발 (2026-11-19 사용자 결정) — 묶음 하나를 "특징 한 줄짜리 다발"로 보고 모든 다발을 한 화면에서 비교한다
 *   ① 경향 지도: 대시보드 "상상 빈도 × 욕망 강도"와 같은 사분면 — 가로 = 같은 상상을 한 Dreamer 수, 세로 = 최근 쏠림, 원 = 상상 수, 색 = 신호
 *   ② 다발 표: 줄 하나 = 다발 하나 (이름 = 핵심 주제 × 핵심 욕망, 계산) · 상상 · Dreamer · 처음 · 흐름 · 신호 · 대표 상상, 머리글 정렬
 *      줄을 누르면 아래로 펼침: 구성(주제 · 욕망 · 분야 막대) · 칸별 흐름 · 대표 상상 3개 · AI 연결 이유 · 상상 전부
 *   이름 · 신호 · 대표 상상은 모두 계산 규칙이다. 뜻을 읽고 판단하는 것은 운영자 (원칙 4)
 */
export function BundlesView({ query, onOpen }: { query: GraphQuery; onOpen: (s: Seed) => void }) {
  const [data, setData] = useState<GraphBundles | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>({ key: "dreamers", order: "desc" });
  const [open, setOpen] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLTableRowElement>());
  const qs = queryString(query);

  useEffect(() => {
    let alive = true;
    setError(null);
    setOpen(null);
    api<GraphBundles>(`/api/admin/graph/bundles?${qs}`).then(
      (d) => alive && setData(d),
      (e) => alive && setError(e instanceof ApiError ? e.message : "다발을 불러오지 못했어요."),
    );
    return () => {
      alive = false;
    };
  }, [qs]);

  if (error) return <p className={adminStyles.status}>{error}</p>;
  if (!data) return <p className={adminStyles.status}>불러오는 중…</p>;
  if (data.bundles.length === 0) {
    return (
      <div className={styles.empty}>
        <b>{data.linked === 0 ? "비슷한 상상 연결이 없어서 다발을 만들 수 없어요." : "서로 다른 Dreamer 가 비슷하게 상상한 다발이 이 조건에는 없어요."}</b>
        <p>
          {data.linked === 0
            ? "다발은 AI 가 고른 비슷한 상상(similar-all) 결과로 만들어요. 위 상태 줄의 \"비슷한 상상 계산\" 수가 늘어난 뒤 [그래프 다시 만들기]를 눌러 주세요."
            : "기간이나 분야를 넓혀 보세요."}
        </p>
      </div>
    );
  }

  const val = (b: Bundle) => (sort.key === "size" ? b.size : sort.key === "first" ? new Date(b.first_at).getTime() : sort.key === "trend" ? b.trend : b.dreamers);
  const sorted = [...data.bundles].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    const diff = x === y ? 0 : sort.order === "asc" ? (x < y ? -1 : 1) : x > y ? -1 : 1;
    return diff || b.dreamers - a.dreamers || b.size - a.size;
  });
  const pick = (key: string) => {
    setOpen(key);
    requestAnimationFrame(() => rows.current.get(key)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  return (
    <div className={dash.grid}>
      <Panel
        wide
        title="경향 지도"
        hint="서로 다른 Dreamer 가 비슷하게 상상한 다발을 한눈에 (가로 : 같은 상상을 한 Dreamer 수, 세로 : 기간 뒤 절반으로 쏠린 정도 — 0.5 = 그대로 · 1 = 최근에만, 원의 크기 : 상상 수, 색 : 신호, 점선 : 중앙값). 원을 누르면 아래 표에서 그 다발이 펼쳐져요."
      >
        <Scatter
          height={440}
          labelTop={10}
          xLabel="같은 상상을 한 Dreamer 수"
          yLabel="최근 쏠림"
          quadrants={["소수 · 최근에 늘어남", "많은 사람 · 최근에 늘어남", "소수 · 예전에 많았음", "많은 사람 · 예전에 많았음"]}
          onPick={pick}
          points={data.bundles.map((b) => ({
            id: b.key,
            label: b.name,
            x: b.dreamers,
            y: b.trend,
            r: 4 + Math.sqrt(b.size) * 2.2,
            color: SIGNAL_COLOR[b.signal],
            tip: (
              <>
                <b>{b.name}</b>
                <TipRow label="상상" value={`${b.size}개`} />
                <TipRow label="Dreamer" value={`${b.dreamers}명`} />
                <TipRow label="신호" value={SIGNAL[b.signal].label} />
                <TipRow label="앞 → 뒤 절반" value={`${b.earlier} → ${b.recent}개`} />
                <TipRow label="대표 상상" value={b.members[0]?.title ?? ""} />
              </>
            ),
          }))}
        />
        <ul className={styles.signalLegend} aria-label="신호 색">
          {(["new", "rising", "steady", "cooling"] as const).map((s) => (
            <li key={s} title={SIGNAL[s].hint}>
              <i style={{ background: SIGNAL_COLOR[s] }} aria-hidden="true" />
              {SIGNAL[s].label}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        wide
        title="다발 표"
        hint="줄 하나가 다발 하나예요. 이름은 다발 안에서 가장 많이 붙은 주제 × 욕망이고, 대표 상상은 다발 안에서 가장 많이 이어진 상상이에요. 줄을 누르면 구성 · 흐름 · 상상이 펼쳐져요."
        csv={() =>
          downloadCsv("경향_다발.csv", [
            ["다발", "상상", "Dreamer", "처음", "마지막", "앞 절반", "뒤 절반", "비중 증감", "신호", "주제", "욕망", "대표 상상"],
            ...sorted.map((b) => [
              b.name,
              b.size,
              b.dreamers,
              b.first_at.slice(0, 10),
              b.last_at.slice(0, 10),
              b.earlier,
              b.recent,
              b.share_growth === null ? "" : fmt(b.share_growth * 100, 1),
              SIGNAL[b.signal].label,
              b.techs.map((t) => `#${t.label}(${t.count})`).join(" "),
              b.desires.map((d) => `${d.label}(${d.count})`).join(" "),
              b.members[0]?.title ?? "",
            ]),
          ])
        }
      >
        <div className={styles.tableScroll}>
          <table className={`${adminStyles.table} ${dash.dataTable} ${styles.bundleTable}`}>
            <colgroup>
              <col style={{ width: 300 }} />
              <col style={{ width: 76 }} />
              <col style={{ width: 92 }} />
              <col style={{ width: 92 }} />
              <col style={{ width: 112 }} />
              <col style={{ width: 92 }} />
              <col />
              <col style={{ width: 36 }} />
            </colgroup>
            <thead>
              <tr>
                <th>다발</th>
                <th>
                  <SortHeader label="상상" options={SORTS.size} value={sort} onChange={setSort} />
                </th>
                <th>
                  <SortHeader label="Dreamer" options={SORTS.dreamers} value={sort} onChange={setSort} />
                </th>
                <th>
                  <SortHeader label="처음" options={SORTS.first} value={sort} onChange={setSort} />
                </th>
                <th>흐름</th>
                <th>
                  <SortHeader label="신호" options={SORTS.trend} value={sort} onChange={setSort} />
                </th>
                <th>대표 상상</th>
                <th aria-label="펼치기" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((b) => {
                const isOpen = open === b.key;
                return (
                  <Fragment key={b.key}>
                    <tr
                      ref={(el) => {
                        if (el) rows.current.set(b.key, el);
                      }}
                      className={isOpen ? styles.rowOpen : styles.row}
                      onClick={() => setOpen(isOpen ? null : b.key)}
                    >
                      <td className={dash.left} title={b.name}>
                        <b className={styles.bundleName}>{b.name}</b>
                      </td>
                      <td className={dash.num}>{b.size}</td>
                      <td className={dash.num}>{b.dreamers}</td>
                      <td className={dash.num}>{day(b.first_at)}</td>
                      <td>
                        <Sparkline values={b.series} color={SIGNAL_COLOR[b.signal]} width={96} height={24} />
                      </td>
                      <td>
                        <SignalBadge signal={b.signal} colored />
                      </td>
                      <td className={`${dash.left} ${dash.muted}`} title={b.members[0]?.title}>
                        {b.members[0]?.title}
                      </td>
                      <td>{isOpen ? <ChevronUp aria-hidden="true" className={styles.chev} /> : <ChevronDown aria-hidden="true" className={styles.chev} />}</td>
                    </tr>
                    {isOpen ? (
                      <tr className={styles.detailRow}>
                        <td colSpan={8}>
                          <BundleDetail b={b} buckets={data.buckets} unit={data.unit} onOpen={onOpen} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

/** 다발 펼침: 구성 · 흐름 · 대표 상상 · AI 연결 이유 · 상상 전부 */
function BundleDetail({ b, buckets, unit, onOpen }: { b: Bundle; buckets: string[]; unit: "day" | "week"; onOpen: (s: Seed) => void }) {
  const [all, setAll] = useState(false);
  const reps = b.members.slice(0, 3);
  return (
    <div className={styles.detail}>
      <div className={styles.detailFacts}>
        <span>
          상상 <b>{b.size}</b>개 · Dreamer <b>{b.dreamers}</b>명 · {day(b.first_at)} ~ {day(b.last_at)}
        </span>
        <span>
          기간 앞 절반 {b.earlier}개 → 뒤 절반 {b.recent}개{b.share_growth !== null ? ` (비중 ${pct(b.share_growth)})` : " (최근에 처음 나옴)"}
        </span>
      </div>

      <div className={styles.detailGrid}>
        <section>
          <h4 className={styles.detailTitle}>주제</h4>
          <Bars
            labelWidth={130}
            color="var(--viz-tech)"
            max={b.size}
            items={b.techs.map((t) => ({ key: t.name, label: `#${t.label}`, value: t.count }))}
          />
          <p className={styles.detailNote}>막대 = 다발 안 상상 중 그 주제가 붙은 수. 주제를 누르면 파고들기로 이어져요.</p>
          <div className={styles.tagRow}>
            {b.techs.map((t) => (
              <button key={t.name} type="button" className={styles.techPill} onClick={() => onOpen({ kind: "node", id: `t:tech:${t.name}` })}>
                #{t.label}
              </button>
            ))}
          </div>
        </section>
        <section>
          <h4 className={styles.detailTitle}>욕망</h4>
          <Bars labelWidth={130} color="var(--viz-desire)" max={b.size} items={b.desires.map((d) => ({ key: d.name, label: d.label, value: d.count }))} />
          <h4 className={styles.detailTitle}>분야</h4>
          <Bars labelWidth={130} color="var(--viz-1)" max={b.size} items={b.domains.map((d) => ({ key: d.name, label: DOMAIN_NAME[d.name] ?? d.name, value: d.count }))} />
        </section>
        <section>
          <h4 className={styles.detailTitle}>{unit === "week" ? "주별" : "날짜별"} 흐름</h4>
          <TimeChart
            height={150}
            legend={false}
            buckets={buckets}
            unit={unit}
            series={[{ key: "n", label: "상상", color: SIGNAL_COLOR[b.signal], values: b.series }]}
          />
        </section>
      </div>

      <section>
        <h4 className={styles.detailTitle}>대표 상상</h4>
        <ol className={styles.reps}>
          {reps.map((m) => (
            <li key={m.id}>
              <Link to={`/i/${m.id}`} className={styles.repTitle}>
                {m.title}
              </Link>
              {m.excerpt && m.excerpt !== m.title ? <p className={styles.repText}>{m.excerpt}</p> : null}
              <span className={styles.memberMeta}>
                {m.author} · {m.domain ? DOMAIN_NAME[m.domain] ?? m.domain : ""} · {shortDay(m.created_at.slice(0, 10))} · Thunder {m.thunders}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {b.reasons.length ? (
        <ul className={styles.reasons} aria-label="AI 가 붙인 연결 이유">
          {b.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : null}

      {b.members.length > 3 ? (
        <section>
          <button type="button" className={styles.more} onClick={() => setAll((v) => !v)}>
            {all ? "상상 접기" : `이 다발의 상상 ${b.members.length}개 모두 보기`}
          </button>
          {all ? (
            <ol className={styles.members}>
              {b.members.map((m) => (
                <li key={m.id}>
                  <Link to={`/i/${m.id}`} className={styles.memberTitle}>
                    {m.title}
                  </Link>
                  <span className={styles.memberMeta}>
                    {m.author} · {m.domain ? DOMAIN_NAME[m.domain] ?? m.domain : ""} · {day(m.created_at)}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
