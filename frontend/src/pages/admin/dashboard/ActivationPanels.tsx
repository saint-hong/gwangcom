import { Check, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Bars } from "../../../components/charts/basic";
import { fmt, shortDay } from "../../../components/charts/core";
import adminStyles from "../Admin.module.css";
import type { ActivationStepKey, AnActivation, PeriodKey } from "../../../types/api";
import styles from "./Dashboard.module.css";
import { SortHeader, type Sort, type SortOption } from "../SortHeader";
import { KpiTile, Loading, downloadCsv, Panel, useAnalytics, ScrollBox } from "./parts";
import { ChoiceSetting, CountSetting, PeriodSetting, PickSetting, periodOf, useSettings, type PanelPeriod } from "./settings";

/** 인원이 이보다 적으면 비율이 우연일 수 있어 흐리게 보인다 */
const FEW = 5;

const STATUS = {
  active: { label: "활동 중", cls: styles.stActive },
  idle: { label: "멈춤", cls: styles.stIdle },
  not_started: { label: "시작 전", cls: styles.stWaiting },
} as const;
type Status = keyof typeof STATUS;

const DOTS: { key: ActivationStepKey; label: string }[] = [
  { key: "returned", label: "다시 들어옴" },
  { key: "reacted", label: "반응" },
  { key: "posted", label: "첫 상상" },
  { key: "got_thunder", label: "Thunder 받음" },
  { key: "kept", label: "계속 활동" },
];

const rate = (k: number, n: number) => (n ? k / n : 0);
const pctText = (r: number) => `${fmt(r * 100)}%`;

/**
 * 신규 Dreamer 활성화 — 처음 가입한 Dreamer 가 어디서 멈추고, 첫 주에 무엇을 경험한 사람이 오래 남나
 *   핵심 숫자 · ① 첫 7일 단계표 · ② 첫주 활동 Yes vs No (계속 활동 비교) · ③ 신규 Dreamer 활동 현황 (지금 손을 내밀 사람)
 *   숫자만 보여 주고 해석은 운영자가 한다 (원칙 4)
 */
export function ActivationPanels({ period }: { period: PeriodKey }) {
  const { data, error } = useAnalytics<AnActivation>("activation", period);
  if (!data) {
    return (
      <div className={styles.wide}>
        <Loading error={error} />
      </div>
    );
  }
  const step = (k: ActivationStepKey) => data.steps.find((s) => s.key === k)!;
  const posted = step("posted");
  const kept = step("kept");
  const keepRange = `${data.keep_from}~${data.keep_to}일째`;
  return (
    <>
      <p className={`${styles.lead} ${styles.wide} ${styles.section}`}>
        <b>신규 Dreamer 활성화</b> — 설정한 기간 내에 가입한 Dreamer의 처음 7일 동안의 활동 분석 (신규 Dreamer 의 활동을 활성화하기 위한 방안에 사용)
      </p>
      <div className={`${styles.kpis} ${styles.wide}`}>
        <KpiTile label="새로 가입한 Dreamer" value={data.new_users} unit="명" series={data.joined_series} color="var(--viz-1)" />
        <KpiTile label={`첫 ${data.window_days}일 안에 상상을 쓴 비율`} value={rate(posted.users, posted.base)} format={pctText} note={`${posted.users} / ${posted.base}명`} />
        <KpiTile
          label={`계속 활동 (${keepRange})`}
          value={rate(kept.users, kept.base)}
          format={(n) => (kept.base ? pctText(n) : "—")}
          note={kept.base ? `${kept.users} / ${kept.base}명` : `가입 후 ${data.keep_from}일이 지나야 판정해요`}
        />
        <KpiTile
          label="가입 → 첫 상상 (중앙값)"
          value={data.first_post_hours_median ?? 0}
          format={(n) => (data.first_post_hours_median === null ? "—" : n < 24 ? fmt(n, 1) : fmt(n / 24, 1))}
          unit={data.first_post_hours_median === null ? "" : data.first_post_hours_median < 24 ? "시간" : "일"}
        />
      </div>

      <StepsPanel page={period} />
      <ComparePanel page={period} />
      <UsersPanel page={period} />
    </>
  );
}

/** 첫 7일 단계 (2026-11-16: 6개 → 13개. 기본으로 모두 보이고 설정에서 고른다) */
const STEP_OPTS: { key: ActivationStepKey; label: string }[] = [
  { key: "joined", label: "가입" },
  { key: "first_day", label: "가입한 날 활동" },
  { key: "returned", label: "다시 들어옴" },
  { key: "reacted", label: "반응" },
  { key: "commented", label: "댓글" },
  { key: "followed", label: "팔로우" },
  { key: "posted", label: "첫 상상" },
  { key: "answered", label: "질문 답" },
  { key: "posted_multi", label: "상상 2개 이상" },
  { key: "shook", label: "Shake it" },
  { key: "got_thunder", label: "Thunder 받음" },
  { key: "active_3days", label: "3일 이상 활동" },
  { key: "kept", label: "계속 활동" },
];

function StepsPanel({ page }: { page: PeriodKey }) {
  const st = useSettings({ period: "page" as PanelPeriod, steps: STEP_OPTS.map((o) => o.key) });
  const { data, loading } = useAnalytics<AnActivation>("activation", periodOf(page, st.v.period));
  if (!data) return null;
  const p = data.period;
  return (
    <Panel
      wide
      loading={loading}
      changed={st.changed}
      onReset={st.reset}
      settings={
        <>
          <PeriodSetting page={page} value={st.v.period} onChange={(v) => st.set("period", v)} />
          <PickSetting label="단계" options={STEP_OPTS} value={st.v.steps} onChange={(v) => st.set("steps", v)} />
        </>
      }
      title={`① 첫 ${data.window_days}일 단계표`}
      hint="가입한 Dreamer들의 처음 7일간 활동 범위 그래프 (활동량이 낮은 범위를 집중적으로 케어 해야함, 계속 활동은 가입 후 8일 지난 사람을 대상으로 함)"
      csv={() =>
        downloadCsv(`신규_단계표_${p.start}.csv`, [
          ["단계", "해 본 사람", "대상", "비율(%)"],
          ...data.steps.map((s) => [s.label, s.users, s.base, s.base ? +(rate(s.users, s.base) * 100).toFixed(1) : ""]),
        ])
      }
    >
      {data.new_users === 0 ? (
        <p className={styles.empty}>이 기간에 가입한 Dreamer 가 없어요.</p>
      ) : (
        <Bars
          labelWidth={180}
          max={100}
          format={(n) => `${fmt(n)}%`}
          items={data.steps
            .filter((s) => st.v.steps.includes(s.key))
            .map((s) => ({
              key: s.key,
              label: s.label,
              value: s.base ? rate(s.users, s.base) * 100 : 0,
              color: s.key === "kept" ? "var(--viz-3)" : "var(--viz-1)",
              note: s.base ? `${s.users} / ${s.base}명` : "판정 전",
            }))}
        />
      )}
      {data.visits_since ? <p className={styles.panelHint}>접속 기록은 {shortDay(data.visits_since)}부터 쌓여요. 그 전에는 글 · 반응 같은 활동으로만 "다시 들어옴"을 세요.</p> : null}
    </Panel>
  );
}

function ComparePanel({ page }: { page: PeriodKey }) {
  const st = useSettings({ period: "page" as PanelPeriod, items: [] as string[] });
  const { data, loading } = useAnalytics<AnActivation>("activation", periodOf(page, st.v.period));
  if (!data) return null;
  const p = data.period;
  return (
    <Panel
      wide
      loading={loading}
      changed={st.changed}
      onReset={st.reset}
      settings={
        <>
          <PeriodSetting page={page} value={st.v.period} onChange={(v) => st.set("period", v)} />
          <PickSetting
            label="첫 주 활동"
            options={data.compare.map((c) => ({ key: c.key, label: c.label.replace(/^첫 주에 /, "").replace(/ \(.*\)$/, "") }))}
            value={st.v.items.length ? st.v.items : data.compare.map((c) => c.key)}
            onChange={(v) => st.set("items", v)}
          />
        </>
      }
      title="② 첫주 활동 Yes vs No"
      hint="가입 후 첫주에 한 활동을 한 경우와 하지 않은 경우를 비교하는 테이블 (차이 : 8~28일째에 경험한 수치와 비교)"
      csv={() =>
        downloadCsv(`첫주_경험_비교_${p.start}.csv`, [
          ["첫 주 활동", "한 사람", "한 사람 중 계속 활동", "안 한 사람", "안 한 사람 중 계속 활동"],
          ...data.compare.map((c) => [c.label, c.yes_n, c.yes_kept, c.no_n, c.no_kept]),
        ])
      }
    >
      {data.eligible === 0 ? (
        <p className={styles.empty}>가입 후 {data.keep_from}일이 지난 Dreamer 가 아직 없어서 비교할 수 없어요.</p>
      ) : (
        <ScrollBox min={640}>
          <table className={`${adminStyles.table} ${styles.dataTable}`}>
            <colgroup>
              <col />
              <col style={{ width: "24%" }} />
              <col style={{ width: "24%" }} />
              <col style={{ width: 100 }} />
            </colgroup>
            <thead>
              <tr>
                <th>첫 주 활동</th>
                <th>Yes</th>
                <th>No</th>
                <th>차이</th>
              </tr>
            </thead>
            <tbody>
              {data.compare
                .filter((c) => !st.v.items.length || st.v.items.includes(c.key))
                .map((c) => {
                  const y = rate(c.yes_kept, c.yes_n);
                  const n = rate(c.no_kept, c.no_n);
                  const diff = c.yes_n && c.no_n ? Math.round((y - n) * 100) : null;
                  return (
                    <tr key={c.key}>
                      <td className={`${styles.left} ${styles.wrap}`}>{c.label}</td>
                      <RateCell label={c.yes_label} kept={c.yes_kept} n={c.yes_n} />
                      <RateCell label={c.no_label} kept={c.no_kept} n={c.no_n} />
                      <td className={styles.num}>
                        {diff === null ? (
                          <span className={styles.muted}>—</span>
                        ) : (
                          <span className={diff > 0 ? styles.up : diff < 0 ? styles.down : styles.muted}>{diff > 0 ? `▲ ${diff}` : diff < 0 ? `▼ ${-diff}` : "0"}%p</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </ScrollBox>
      )}
    </Panel>
  );
}

type User = AnActivation["users"][number];
const STATUS_ORDER: Record<Status, number> = { not_started: 0, idle: 1, active: 2 };
const many = (key: string): SortOption[] => [
  { key, order: "desc", label: "많은 순" },
  { key, order: "asc", label: "적은 순" },
];
/** 신규 Dreamer 활동 현황 머리글 정렬 (2026-11-16). 기본 = 가입 최신 순 */
const USER_SORTS: Record<string, SortOption[]> = {
  joined: [
    { key: "joined", order: "desc", label: "최신 순" },
    { key: "joined", order: "asc", label: "오래된 순" },
  ],
  posts: many("posts"),
  reactions: many("reactions"),
  thunders_got: many("thunders_got"),
  returned: [
    { key: "returned", order: "desc", label: "들어온 사람 먼저 (✓)" },
    { key: "returned", order: "asc", label: "안 들어온 사람 먼저 (✕)" },
  ],
  last_active: [
    { key: "last_active", order: "desc", label: "최근 순" },
    { key: "last_active", order: "asc", label: "오래된 순" },
  ],
  status: [
    { key: "status", order: "desc", label: "활동 중 → 시작 전" },
    { key: "status", order: "asc", label: "시작 전 → 활동 중" },
  ],
};

function UsersPanel({ page }: { page: PeriodKey }) {
  const st = useSettings({ period: "page" as PanelPeriod, count: 50, status: "all" as Status | "all" });
  const { data, loading } = useAnalytics<AnActivation>("activation", periodOf(page, st.v.period));
  const filter = st.v.status;
  const [sort, setSort] = useState<Sort>({ key: "joined", order: "desc" });
  if (!data) return null;
  const p = data.period;
  const counts = { all: data.users.length, active: 0, idle: 0, not_started: 0 } as Record<Status | "all", number>;
  data.users.forEach((u) => (counts[u.status] += 1));
  // 최근 가입한 N명을 먼저 고르고(설정 "가입자"), 그 안에서 머리글 정렬로 순서만 바꾼다 (2026-11-16)
  const recent = (filter === "all" ? data.users : data.users.filter((u) => u.status === filter)).slice(0, st.v.count);
  const val = (u: User): number | string => {
    switch (sort.key) {
      case "posts":
        return u.posts;
      case "reactions":
        return u.reactions;
      case "thunders_got":
        return u.thunders_got;
      case "returned":
        return u.steps.returned ? 1 : 0;
      case "last_active":
        return u.last_active_at ?? ""; // 활동 없음 = 가장 오래됨
      case "status":
        return STATUS_ORDER[u.status];
      default:
        return u.joined_at;
    }
  };
  const users = [...recent].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    const diff = x === y ? 0 : x < y ? -1 : 1;
    return (sort.order === "asc" ? diff : -diff) || b.joined_at.localeCompare(a.joined_at);
  });
  return (
    <Panel
      wide
      loading={loading}
      changed={st.changed}
      onReset={st.reset}
      settings={
        <>
          <PeriodSetting page={page} value={st.v.period} onChange={(v) => st.set("period", v)} />
          <CountSetting label="가입자" options={[20, 50, 100]} recommend={50} value={st.v.count} onChange={(v) => st.set("count", v)} unit="명" why="표가 길어져요" />
          {/* 상태 (2026-11-16: 표 오른쪽 위 버튼 줄 → 설정으로 옮김) */}
          <ChoiceSetting
            label="상태"
            options={(["active", "idle", "not_started", "all"] as const).map((k) => ({ key: k, label: `${k === "all" ? "전체" : STATUS[k].label} ${counts[k]}` }))}
            value={st.v.status}
            onChange={(v) => st.set("status", v)}
          />
        </>
      }
      title="③ 신규 Dreamer 활동 현황"
      hint="최근 가입한 순서로 Dreamer의 첫주 활동 현황 테이블 (상태는 7일 이후 활동 여부)"
      csv={() =>
        downloadCsv(`신규_Dreamer_${p.start}.csv`, [
          ["id", "닉네임", "가입", ...DOTS.map((d) => d.label), "상상", "남긴 반응", "받은 Thunder", "마지막 활동", "상태"],
          ...data.users.map((u) => [
            u.id,
            u.nickname,
            u.joined_at.slice(0, 10),
            ...DOTS.map((d) => (u.steps[d.key] === undefined ? "" : u.steps[d.key] ? "Y" : "N")),
            u.posts,
            u.reactions,
            u.thunders_got,
            u.last_active_at?.slice(0, 10) ?? "",
            STATUS[u.status].label,
          ]),
        ])
      }
    >
      {users.length === 0 ? (
        <p className={styles.empty}>해당하는 Dreamer 가 없어요.</p>
      ) : (
        <ScrollBox min={820}>
          <table className={`${adminStyles.table} ${styles.dataTable}`}>
            <colgroup>
              <col />
              <col style={{ width: 80 }} />
              <col style={{ width: 70 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 96 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 80 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Dreamer</th>
                <th>
                  <SortHeader label="가입" options={USER_SORTS.joined} value={sort} onChange={setSort} />
                </th>
                <th>
                  <SortHeader label="상상" options={USER_SORTS.posts} value={sort} onChange={setSort} />
                </th>
                <th>
                  <SortHeader label="남긴 반응" options={USER_SORTS.reactions} value={sort} onChange={setSort} />
                </th>
                <th>
                  <SortHeader label="받은 Thunder" options={USER_SORTS.thunders_got} value={sort} onChange={setSort} />
                </th>
                <th title={`가입한 다음 날부터 ${data.window_days}일 안에 다시 들어왔나`}>
                  <SortHeader label="다시 들어옴" options={USER_SORTS.returned} value={sort} onChange={setSort} />
                </th>
                <th>
                  <SortHeader label="마지막 활동" options={USER_SORTS.last_active} value={sort} onChange={setSort} />
                </th>
                <th>
                  <SortHeader label="상태" options={USER_SORTS.status} value={sort} onChange={setSort} alignRight />
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const back = u.steps.returned;
                const state = back === undefined ? "판정 전" : back ? "함" : "안 함";
                return (
                  <tr key={u.id}>
                    <td className={styles.left}>
                      <Link to={`/admin/users/${u.id}`} className={styles.link}>
                        {u.nickname}
                      </Link>
                    </td>
                    <td className={styles.muted}>{shortDay(u.joined_at.slice(0, 10))}</td>
                    <td className={styles.num}>{u.posts}</td>
                    <td className={styles.num}>{u.reactions}</td>
                    <td className={styles.num}>{u.thunders_got}</td>
                    <td title={`다시 들어옴: ${state}`} aria-label={`다시 들어옴: ${state}`}>
                      {back === undefined ? <span className={styles.stepWait}>-</span> : back ? <Check className={styles.stepYes} aria-hidden="true" /> : <X className={styles.stepNo} aria-hidden="true" />}
                    </td>
                    <td className={styles.muted}>{u.last_active_at === null ? "—" : u.idle_days === 0 ? "오늘" : `${u.idle_days}일 전`}</td>
                    <td>
                      <span className={`${styles.sig} ${STATUS[u.status].cls}`}>{STATUS[u.status].label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollBox>
      )}
    </Panel>
  );
}

function RateCell({ label, kept, n }: { label: string; kept: number; n: number }) {
  const r = rate(kept, n);
  return (
    <td className={n < FEW ? styles.few : undefined} title={`${label}: ${kept} / ${n}명`}>
      <span className={styles.rateCell}>
        <span className={styles.rateHead}>
          <span className={styles.muted}>
            {label} {n}명
          </span>
          <b className={styles.num}>{n ? pctText(r) : "—"}</b>
        </span>
        <span className={styles.meter}>
          <span style={{ width: `${r * 100}%`, background: "var(--viz-3)" }} />
        </span>
      </span>
    </td>
  );
}
