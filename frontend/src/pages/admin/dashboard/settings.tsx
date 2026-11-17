import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PeriodKey } from "../../../types/api";
import styles from "./Dashboard.module.css";
import { useAnalytics } from "./parts";

/**
 * 그래프 설정 (2026-11-13) — 각 패널 오른쪽 아래 [설정 ▾]를 펼치면 그 그래프의 재료를 고른다.
 *   지금은 기본 재료만: 기간 · 보여 줄 개수 · 보여 줄 항목(계열 · 종류). 고도화는 추후.
 *   너무 많이 고르면 그림이 커지고 읽기 어려워지므로, 권장 수를 넘으면 경고를 보여 준다 (최대값은 고를 수 있는 선택지로 막음).
 */

/** "page" = 화면 맨 위 기간을 따름. 그 밖은 빠른 선택 키(7d …) 또는 직접 고른 범위 "YYYY-MM-DD~YYYY-MM-DD" */
export type PanelPeriod = "page" | PeriodKey;

/** 빠른 선택 (2026-11-17 사용자 요청) — 1개월 = 30일, 3개월 = 90일, 6개월 = 180일 */
const QUICK: { key: PeriodKey; label: string; days?: number }[] = [
  { key: "7d", label: "7일", days: 7 },
  { key: "10d", label: "10일", days: 10 },
  { key: "20d", label: "20일", days: 20 },
  { key: "30d", label: "1개월", days: 30 },
  { key: "90d", label: "3개월", days: 90 },
  { key: "180d", label: "6개월", days: 180 },
  { key: "all", label: "전체" },
];
const RANGE_RE = /^(\d{4}-\d{2}-\d{2})~(\d{4}-\d{2}-\d{2})$/;

/** 오늘 (한국 날짜, YYYY-MM-DD) */
const kstToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;

/** 기간 키 → [시작, 끝] (전체는 null) */
function periodRange(key: PeriodKey): [string, string] | null {
  const m = RANGE_RE.exec(key);
  if (m) return [m[1], m[2]];
  const q = QUICK.find((o) => o.key === key);
  if (!q?.days) return null;
  const today = kstToday();
  return [addDays(today, -(q.days - 1)), today];
}

/** 기간 키 → 화면 글자 ("1개월" · "2026-10-01 ~ 10-31") */
export function periodLabel(key: PeriodKey): string {
  const q = QUICK.find((o) => o.key === key);
  if (q) return q.label;
  const r = periodRange(key);
  if (!r) return key;
  const [a, b] = r;
  return `${a} ~ ${a.slice(0, 4) === b.slice(0, 4) ? b.slice(5) : b}`;
}

/** 설정 상태 — 기본값과 다르면 changed, reset 은 기본값으로 */
export function useSettings<T extends Record<string, unknown>>(defaults: T) {
  const [v, setV] = useState<T>(defaults);
  const set = <K extends keyof T>(k: K, value: T[K]) => setV((s) => ({ ...s, [k]: value }));
  const changed = (Object.keys(defaults) as (keyof T)[]).some((k) => JSON.stringify(v[k]) !== JSON.stringify(defaults[k]));
  return { v, set, changed, reset: () => setV(defaults) };
}

export const periodOf = (page: PeriodKey, p: PanelPeriod): PeriodKey => (p === "page" ? page : p);

/** 기간만 고르는 패널: 데이터 + Panel 에 넘길 설정 묶음 ({...panel}) */
export function usePeriodPanel<T>(path: string, page: PeriodKey) {
  const st = useSettings({ period: "page" as PanelPeriod });
  const res = useAnalytics<T>(path, periodOf(page, st.v.period));
  return {
    data: res.data,
    panel: {
      loading: res.loading,
      changed: st.changed,
      onReset: st.reset,
      settings: <PeriodSetting page={page} value={st.v.period} onChange={(v) => st.set("period", v)} />,
    },
  };
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.setRow}>
      <span className={styles.setLabel}>{label}</span>
      <div className={styles.setControl}>{children}</div>
    </div>
  );
}

function Warn({ children }: { children: ReactNode }) {
  return (
    <p className={styles.setWarn} role="status">
      <AlertTriangle aria-hidden="true" />
      {children}
    </p>
  );
}

/** 기간 키가 맞는 형식인지 (주소 ?period= 검사용) */
export const isPeriodKey = (v: string | null): v is PeriodKey => !!v && (QUICK.some((o) => o.key === v) || RANGE_RE.test(v));

/**
 * 기간 고르기 (2026-11-17 사용자 요청: 버튼 줄 → 달력 버튼) — [📅 1개월 · 10-19 ~ 11-17]
 *   펼치면 위: 빠른 선택 [(화면 기간) · 7일 · 10일 · 20일 · 1개월 · 3개월 · 6개월 · 전체] (누르면 바로 적용)
 *          아래: 달력에서 시작일 → 종료일을 누르고 [적용]. 오늘 뒤 날짜는 고를 수 없다
 *   page 를 주면 맨 앞에 "화면 기간 따름"(값 "page") 선택지. floating = 화면 맨 위처럼 버튼 아래로 떠서 펼침
 */
export function PeriodPicker<V extends string>({ value, onChange, page, floating }: { value: V; onChange: (v: V) => void; page?: PeriodKey; floating?: boolean }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const key = value === "page" && page ? page : value;
  const range = periodRange(key);
  const name = value === "page" && page ? `화면 기간 (${periodLabel(page)})` : periodLabel(value);
  const sub = range && !RANGE_RE.test(key) ? `${range[0].slice(5)} ~ ${range[1].slice(5)}` : null;
  const pick = (v: string) => {
    onChange(v as V);
    setOpen(false);
  };
  // 떠 있는 상자: 바깥을 누르거나 Esc 면 닫기
  useEffect(() => {
    if (!open || !floating) return;
    const down = (e: MouseEvent) => wrap.current && !wrap.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", esc);
    };
  }, [open, floating]);
  return (
    <div ref={wrap} className={floating ? styles.calWrap : styles.calInline}>
      <button type="button" className={styles.calBtn} aria-expanded={open} aria-label={`기간: ${name}`} onClick={() => setOpen((o) => !o)}>
        <CalendarDays aria-hidden="true" />
        <b>{name}</b>
        {sub ? <span>{sub}</span> : null}
      </button>
      {open ? (
        <div className={floating ? `${styles.calBox} ${styles.calFloat}` : styles.calBox}>
          <div className={styles.opts} role="group" aria-label="빠른 선택">
            {page ? (
              <button type="button" aria-pressed={value === "page"} onClick={() => pick("page")}>
                화면 기간 ({periodLabel(page)})
              </button>
            ) : null}
            {QUICK.map((o) => (
              <button key={o.key} type="button" aria-pressed={value === o.key} onClick={() => pick(o.key)}>
                {o.label}
              </button>
            ))}
          </div>
          <RangeCalendar initial={range} onApply={(a, b) => pick(`${a}~${b}`)} />
        </div>
      ) : null}
    </div>
  );
}

/** 그래프 설정의 기간 칸 */
export function PeriodSetting({ value, onChange, page }: { value: PanelPeriod; onChange: (v: PanelPeriod) => void; page: PeriodKey }) {
  return (
    <Row label="기간">
      <PeriodPicker value={value} onChange={onChange} page={page} />
    </Row>
  );
}

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

/** 한 달 달력에서 시작일 → 종료일 고르기 */
function RangeCalendar({ initial, onApply }: { initial: [string, string] | null; onApply: (start: string, end: string) => void }) {
  const today = kstToday();
  const [start, setStart] = useState<string | null>(initial?.[0] ?? null);
  const [end, setEnd] = useState<string | null>(initial?.[1] ?? null);
  const [month, setMonth] = useState((initial?.[1] ?? today).slice(0, 7)); // YYYY-MM
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(first).fill(null), ...Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  const move = (n: number) => setMonth(new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7));
  const click = (d: string) => {
    if (!start || end) {
      setStart(d);
      setEnd(null);
    } else if (d < start) {
      setStart(d);
    } else {
      setEnd(d);
    }
  };
  const last = end ?? start;
  return (
    <div className={styles.cal}>
      <div className={styles.calHead}>
        <button type="button" onClick={() => move(-1)} aria-label="이전 달">
          <ChevronLeft aria-hidden="true" />
        </button>
        <b>
          {y}년 {m}월
        </b>
        <button type="button" onClick={() => move(1)} disabled={month >= today.slice(0, 7)} aria-label="다음 달">
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
      <div className={styles.calGrid} role="grid" aria-label={`${y}년 ${m}월`}>
        {WEEK.map((w) => (
          <span key={w} className={styles.calWeek}>
            {w}
          </span>
        ))}
        {cells.map((d, i) =>
          d ? (
            <button
              key={d}
              type="button"
              disabled={d > today}
              aria-pressed={d === start || d === end}
              aria-label={d}
              className={`${styles.calDay} ${start && last && d > start && d < last ? styles.calIn : ""} ${d === today ? styles.calToday : ""}`}
              onClick={() => click(d)}
            >
              {Number(d.slice(8))}
            </button>
          ) : (
            <span key={`e${i}`} />
          ),
        )}
      </div>
      <div className={styles.calFoot}>
        <span>{start ? `${start} ~ ${end ?? "종료일 고르기"}${end ? ` (${daysBetween(start, end)}일)` : ""}` : "시작일을 고르세요"}</span>
        <button type="button" className={styles.calApply} disabled={!start} onClick={() => start && onApply(start, end ?? start)}>
          적용
        </button>
      </div>
    </div>
  );
}

/** 하나 고르기 (모양 · 정렬 기준 등) */
export function ChoiceSetting<K extends string | number>({ label, options, value, onChange }: { label: string; options: { key: K; label: string }[]; value: K; onChange: (v: K) => void }) {
  return (
    <Row label={label}>
      <div className={styles.opts} role="group" aria-label={label}>
        {options.map((o) => (
          <button key={String(o.key)} type="button" aria-pressed={value === o.key} onClick={() => onChange(o.key)}>
            {o.label}
          </button>
        ))}
      </div>
    </Row>
  );
}

/** 보여 줄 개수 — 권장(recommend)을 넘으면 경고 */
export function CountSetting({
  label,
  value,
  options,
  recommend,
  onChange,
  unit = "개",
  why = "이름이 겹치거나 읽기 어려울 수 있어요",
  note,
}: {
  label: string;
  value: number;
  options: number[];
  recommend: number;
  onChange: (v: number) => void;
  unit?: string;
  why?: string;
  /** 버튼 아래 안내 (한 상자에 그래프가 여럿일 때 어느 쪽 개수인지 등, 2026-11-16) */
  note?: string;
}) {
  return (
    <Row label={label}>
      <div className={styles.opts} role="group" aria-label={label}>
        {options.map((n) => (
          <button key={n} type="button" aria-pressed={value === n} onClick={() => onChange(n)}>
            {n}
            {unit}
          </button>
        ))}
      </div>
      {note ? <p className={styles.setNote}>{note}</p> : null}
      {value > recommend ? (
        <Warn>
          {recommend}
          {unit}보다 많으면 그래프가 커지고 {why}.
        </Warn>
      ) : null}
    </Row>
  );
}

/** 여러 개 고르기 (분야 · 계열 · 신호 종류 등) — 하나 이상은 남긴다, 권장을 넘으면 경고 */
export function PickSetting<K extends string>({
  label,
  options,
  value,
  onChange,
  recommend,
}: {
  label: string;
  options: { key: K; label: string; color?: string }[];
  value: K[];
  onChange: (v: K[]) => void;
  recommend?: number;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const toggle = (k: K) => {
    if (value.includes(k)) {
      if (value.length === 1) {
        setMsg("하나 이상은 골라야 해요.");
        return;
      }
      onChange(value.filter((x) => x !== k));
    } else onChange(options.map((o) => o.key).filter((x) => x === k || value.includes(x)));
    setMsg(null);
  };
  const all = value.length === options.length;
  return (
    <Row label={label}>
      <div className={styles.picks} role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.key} type="button" className={styles.pick} aria-pressed={value.includes(o.key)} onClick={() => toggle(o.key)}>
            {o.color ? <span className={styles.pickDot} style={{ background: o.color }} /> : null}
            {o.label}
          </button>
        ))}
        <button type="button" className={styles.csvBtn} onClick={() => (onChange(options.map((o) => o.key)), setMsg(null))} disabled={all}>
          모두
        </button>
      </div>
      {msg ? <Warn>{msg}</Warn> : null}
      {recommend && value.length > recommend ? <Warn>{recommend}개보다 많으면 색이 비슷해 구분하기 어려울 수 있어요.</Warn> : null}
    </Row>
  );
}
