import { AlertTriangle } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { PeriodKey } from "../../../types/api";
import styles from "./Dashboard.module.css";
import { useAnalytics } from "./parts";

/**
 * 그래프 설정 (2026-11-13) — 각 패널 오른쪽 아래 [설정 ▾]를 펼치면 그 그래프의 재료를 고른다.
 *   지금은 기본 재료만: 기간 · 보여 줄 개수 · 보여 줄 항목(계열 · 종류). 고도화는 추후.
 *   너무 많이 고르면 그림이 커지고 읽기 어려워지므로, 권장 수를 넘으면 경고를 보여 준다 (최대값은 고를 수 있는 선택지로 막음).
 */

/** "page" = 화면 맨 위 기간을 따름 */
export type PanelPeriod = "page" | PeriodKey;

const PERIOD_LABEL: Record<PeriodKey, string> = { "7d": "7일", "30d": "30일", "90d": "90일", all: "전체" };

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

function Row({ label, children }: { label: string; children: ReactNode }) {
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

/** 기간: [화면 기간(30일)] [7일] [30일] [90일] [전체] */
export function PeriodSetting({ value, onChange, page }: { value: PanelPeriod; onChange: (v: PanelPeriod) => void; page: PeriodKey }) {
  const opts: { v: PanelPeriod; label: string }[] = [
    { v: "page", label: `화면 기간 (${PERIOD_LABEL[page]})` },
    ...(Object.keys(PERIOD_LABEL) as PeriodKey[]).map((k) => ({ v: k, label: PERIOD_LABEL[k] })),
  ];
  return (
    <Row label="기간">
      <div className={styles.opts} role="group" aria-label="기간">
        {opts.map((o) => (
          <button key={o.v} type="button" aria-pressed={value === o.v} onClick={() => onChange(o.v)}>
            {o.label}
          </button>
        ))}
      </div>
    </Row>
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
}: {
  label: string;
  value: number;
  options: number[];
  recommend: number;
  onChange: (v: number) => void;
  unit?: string;
  why?: string;
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
