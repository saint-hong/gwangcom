import { useState } from "react";
import { Link } from "react-router-dom";
import { Bars } from "../../../components/charts/basic";
import { fmt, shortDay } from "../../../components/charts/core";
import adminStyles from "../Admin.module.css";
import type { ActivationStepKey, AnActivation, PeriodKey } from "../../../types/api";
import styles from "./Dashboard.module.css";
import { KpiTile, Loading, downloadCsv, Panel, useAnalytics, ScrollBox } from "./parts";
import { CountSetting, PeriodSetting, PickSetting, periodOf, useSettings, type PanelPeriod } from "./settings";

/** 인원이 이보다 적으면 비율이 우연일 수 있어 흐리게 보인다 */
const FEW = 5;

const STATUS = {
  active: { label: "활동 중", cls: styles.sigNew },
  idle: { label: "멈춤", cls: styles.sigCooling },
  not_started: { label: "시작 전", cls: styles.sigSteady },
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
 *   핵심 숫자 · ① 첫 7일 단계표 · ② 첫 주 경험별 계속 활동 비교 · ③ 신규 Dreamer 목록 (지금 손을 내밀 사람)
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
        <b>신규 Dreamer 활성화</b> — 이 기간에 가입한 Dreamer 가 첫 {data.window_days}일 동안 어디까지 해 보고, 첫 주에 무엇을 경험한 사람이 계속 남는지 봐요. 숫자만 보여 주고, 무엇을 할지는 운영자가
        정해요.
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

const STEP_OPTS: { key: ActivationStepKey; label: string }[] = [
  { key: "joined", label: "가입" },
  { key: "returned", label: "다시 들어옴" },
  { key: "reacted", label: "반응" },
  { key: "posted", label: "첫 상상" },
  { key: "got_thunder", label: "Thunder 받음" },
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
      hint={`가입한 사람 중 첫 ${data.window_days}일 안에 각 단계를 해 본 비율이에요. 크게 줄어드는 단계가 손볼 곳이에요. 계속 활동은 가입 후 ${data.keep_from}일이 지난 사람만 세요.`}
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
  const keepRange = `${data.keep_from}~${data.keep_to}일째`;
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
            label="첫 주 경험"
            options={data.compare.map((c) => ({ key: c.key, label: c.label.replace(/^첫 주에 /, "").replace(/ \(.*\)$/, "") }))}
            value={st.v.items.length ? st.v.items : data.compare.map((c) => c.key)}
            onChange={(v) => st.set("items", v)}
          />
        </>
      }
      title="② 첫 주 경험별 계속 활동"
      hint={`첫 주에 그 일을 한 사람과 안 한 사람 중 ${keepRange}에도 활동한 비율을 비교해요. 인원이 ${FEW}명보다 적은 칸은 흐리게 보여요(우연일 수 있음).`}
      csv={() =>
        downloadCsv(`첫주_경험_비교_${p.start}.csv`, [
          ["첫 주 경험", "한 사람", "한 사람 중 계속 활동", "안 한 사람", "안 한 사람 중 계속 활동"],
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
                <th>첫 주 경험</th>
                <th>했다</th>
                <th>안 했다</th>
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

function UsersPanel({ page }: { page: PeriodKey }) {
  const st = useSettings({ period: "page" as PanelPeriod, count: 50 });
  const { data, loading } = useAnalytics<AnActivation>("activation", periodOf(page, st.v.period));
  const [filter, setFilter] = useState<Status | "all">("all");
  if (!data) return null;
  const p = data.period;
  const counts = { all: data.users.length, active: 0, idle: 0, not_started: 0 } as Record<Status | "all", number>;
  data.users.forEach((u) => (counts[u.status] += 1));
  const users = filter === "all" ? data.users : data.users.filter((u) => u.status === filter);
  return (
    <Panel
      wide
      loading={loading}
      changed={st.changed}
      onReset={st.reset}
      settings={
        <>
          <PeriodSetting page={page} value={st.v.period} onChange={(v) => st.set("period", v)} />
          <CountSetting label="줄 수" options={[20, 50, 100]} recommend={50} value={st.v.count} onChange={(v) => st.set("count", v)} unit="명" why="표가 길어져요" />
        </>
      }
      title="③ 신규 Dreamer"
      hint={`최근 가입한 순서로 ${st.v.count}명까지 보여요. 동그라미는 첫 ${data.window_days}일 단계(다시 들어옴 · 반응 · 첫 상상 · Thunder 받음 · 계속 활동)이고, 채워진 것이 해 본 단계예요. 7일 넘게 활동이 없으면 멈춤이에요. 이름을 누르면 사용자 상세로 가요.`}
      aside={
        <div className={adminStyles.seg} role="group" aria-label="상태 고르기">
          {(["all", "idle", "not_started", "active"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {k === "all" ? "전체" : STATUS[k].label} {counts[k]}
            </button>
          ))}
        </div>
      }
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
              <col style={{ width: 130 }} />
              <col style={{ width: 70 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 80 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Dreamer</th>
                <th>가입</th>
                <th>첫 {data.window_days}일 단계</th>
                <th>상상</th>
                <th>남긴 반응</th>
                <th>받은 Thunder</th>
                <th>마지막 활동</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {users.slice(0, st.v.count).map((u) => (
                <tr key={u.id}>
                  <td className={styles.left}>
                    <Link to={`/admin/users/${u.id}`} className={styles.link}>
                      {u.nickname}
                    </Link>
                  </td>
                  <td className={styles.muted}>{shortDay(u.joined_at.slice(0, 10))}</td>
                  <td>
                    <span className={styles.stepDots}>
                      {DOTS.map((d) => {
                        const v = u.steps[d.key];
                        const state = v === undefined ? "판정 전" : v ? "함" : "안 함";
                        return <span key={d.key} className={v === undefined ? styles.dotWait : v ? styles.dotOn : styles.dotOff} title={`${d.label}: ${state}`} aria-label={`${d.label}: ${state}`} />;
                      })}
                    </span>
                  </td>
                  <td className={styles.num}>{u.posts}</td>
                  <td className={styles.num}>{u.reactions}</td>
                  <td className={styles.num}>{u.thunders_got}</td>
                  <td className={styles.muted}>{u.last_active_at === null ? "—" : u.idle_days === 0 ? "오늘" : `${u.idle_days}일 전`}</td>
                  <td>
                    <span className={`${styles.sig} ${STATUS[u.status].cls}`}>{STATUS[u.status].label}</span>
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
