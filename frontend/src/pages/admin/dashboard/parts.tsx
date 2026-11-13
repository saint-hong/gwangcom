import { ChevronDown, ChevronUp, Download } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { api, ApiError, getToken } from "../../../api/client";
import { Delta, Sparkline } from "../../../components/charts/basic";
import { fmt } from "../../../components/charts/core";
import type { PeriodKey, TechSignal } from "../../../types/api";
import styles from "./Dashboard.module.css";

/** 분야 slug → 화면 이름 (고정 8개) */
export const DOMAIN_NAME: Record<string, string> = {
  ai: "AI",
  semiconductor: "Semiconductor",
  space: "Space",
  mobility: "Mobility",
  bio: "Bio",
  energy: "Energy",
  mobile: "Mobile",
  life: "Life",
};

/**
 * 통계 불러오기 — 탭과 그래프마다 부른다 (그래프 설정에서 기간을 따로 고를 수 있어서).
 *   같은 (주소, 기간)은 1분 동안 한 번만 불러와 함께 쓴다. 기간을 바꾸는 동안에는 앞 데이터를 그대로 보여 준다(loading=true).
 */
type Entry = { at: number; promise: Promise<unknown>; data?: unknown };
const cache = new Map<string, Entry>();
const TTL = 60_000;

function load(key: string): Entry {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit;
  const entry: Entry = { at: Date.now(), promise: api<unknown>(`/api/admin/analytics/${key}`) };
  entry.promise.then(
    (d) => (entry.data = d),
    () => cache.delete(key),
  );
  cache.set(key, entry);
  return entry;
}

export function useAnalytics<T>(path: string, period: PeriodKey) {
  const key = `${path}?period=${period}`;
  const fresh = () => {
    const hit = cache.get(key);
    return hit?.data !== undefined && Date.now() - hit.at < TTL ? (hit.data as T) : null;
  };
  const [state, setState] = useState<{ key: string; data: T | null; error: string | null }>(() => ({ key, data: fresh(), error: null }));
  useEffect(() => {
    let alive = true;
    const e = load(key);
    if (e.data !== undefined) setState({ key, data: e.data as T, error: null });
    else
      e.promise.then(
        (d) => alive && setState({ key, data: d as T, error: null }),
        (err) => alive && setState((s) => ({ ...s, key, error: err instanceof ApiError ? err.message : "통계를 불러오지 못했어요." })),
      );
    return () => {
      alive = false;
    };
  }, [key]);
  return { data: state.data, error: state.error, loading: state.key !== key };
}

export function Loading({ error }: { error: string | null }) {
  return <p className={styles.status}>{error ?? "통계를 계산하는 중…"}</p>;
}

/**
 * 패널 = 대시보드의 한 칸: 제목 · 한 줄 설명(어떻게 읽는지) · 오른쪽 [CSV] · 본문 · 오른쪽 아래 [설정 ▾]
 *   wide: 두 칸 폭을 다 쓴다
 *   settings: 이 그래프의 재료를 고르는 칸 ([설정 ▾]을 누르면 아래로 펼쳐짐). changed 면 버튼에 점, [기본값으로] 보임
 *   loading: 설정을 바꿔 다시 불러오는 동안 본문을 흐리게
 */
export function Panel({
  title,
  hint,
  csv,
  wide,
  children,
  aside,
  settings,
  changed,
  onReset,
  loading,
}: {
  title: string;
  hint?: ReactNode;
  csv?: () => void;
  wide?: boolean;
  children: ReactNode;
  aside?: ReactNode;
  settings?: ReactNode;
  changed?: boolean;
  onReset?: () => void;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <section className={wide ? `${styles.panel} ${styles.wide}` : styles.panel}>
      <header className={styles.panelHead}>
        <div>
          <h3 className={styles.panelTitle}>{title}</h3>
          {hint ? <p className={styles.panelHint}>{hint}</p> : null}
        </div>
        <div className={styles.panelActions}>
          {aside}
          {csv ? (
            <button type="button" className={styles.csvBtn} onClick={csv} title="이 표를 CSV 로 내려받기">
              <Download aria-hidden="true" />
              CSV
            </button>
          ) : null}
        </div>
      </header>
      <div className={loading ? styles.panelBodyLoading : styles.panelBody} aria-busy={loading || undefined}>
        {children}
      </div>
      {settings ? (
        <>
          <div className={styles.panelFoot}>
            <button type="button" className={styles.setBtn} aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
              {changed ? <span className={styles.setDot} aria-label="바꾼 설정 있음" /> : null}
              설정 {open ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
            </button>
          </div>
          {open ? (
            <div id={id} className={styles.settings}>
              {settings}
              {changed && onReset ? (
                <div className={styles.setActions}>
                  <button type="button" className={styles.csvBtn} onClick={onReset}>
                    기본값으로
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

/**
 * 표 스크롤 칸 (2026-11-13) — 표가 칸보다 넓으면 좌우, 길면(최대 높이) 상하로 스크롤. 칸 이름 줄은 위에 붙어 있음.
 *   min: 표가 이보다 좁아지지 않게 (칸이 찌그러져 글자가 잘리지 않게)
 */
export function ScrollBox({ min, maxHeight = 560, children }: { min: number; maxHeight?: number; children: ReactNode }) {
  return (
    <div className={styles.scrollBox} style={{ ["--table-min" as string]: `${min}px`, maxHeight }} tabIndex={0} role="region" aria-label="스크롤할 수 있는 표">
      {children}
    </div>
  );
}

export function KpiTile({
  label,
  value,
  prev,
  series,
  unit = "",
  color = "var(--viz-1)",
  format = (n: number) => fmt(n),
  note,
}: {
  label: string;
  value: number;
  prev?: number | null;
  series?: number[];
  unit?: string;
  color?: string;
  format?: (n: number) => string;
  note?: ReactNode;
}) {
  return (
    <div className={styles.kpi}>
      <span className={styles.kpiLabel}>{label}</span>
      <span className={styles.kpiValue}>
        {format(value)}
        {unit ? <small>{unit}</small> : null}
      </span>
      <span className={styles.kpiFoot}>
        {prev !== undefined ? <Delta cur={value} prev={prev} /> : null}
        {prev !== undefined && prev !== null ? <span className={styles.kpiPrev}>이전 {format(prev)}</span> : null}
        {note ? <span className={styles.kpiPrev}>{note}</span> : null}
      </span>
      {series && series.length > 1 ? (
        <span className={styles.kpiSpark}>
          <Sparkline values={series} color={color} width={84} height={26} />
        </span>
      ) : null}
    </div>
  );
}

export const SIGNAL: Record<TechSignal["signal"], { label: string; cls: string; hint: string }> = {
  new: { label: "새로 등장", cls: "sigNew", hint: "이번 기간에 처음 나온 기술" },
  rising: { label: "떠오름", cls: "sigRising", hint: "전체 상상 중 비중이 이전 기간의 1.5배 이상 (3개 이상)" },
  steady: { label: "꾸준함", cls: "sigSteady", hint: "이전 기간과 비슷" },
  cooling: { label: "식는 중", cls: "sigCooling", hint: "전체 상상 중 비중이 이전 기간의 2/3 미만" },
};

export function SignalBadge({ signal }: { signal: TechSignal["signal"] }) {
  const s = SIGNAL[signal];
  return (
    <span className={`${styles.sig} ${styles[s.cls]}`} title={s.hint}>
      {s.label}
    </span>
  );
}

export const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v > 0 ? "+" : ""}${fmt(v * 100)}%`);

/** 표 → CSV 내려받기 (엑셀 한글용 BOM) */
export function downloadCsv(name: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob(["﻿" + rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  saveBlob(blob, name);
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 서버 원자료 CSV (기간 안 대중 상상 전부: 분야 · 기술 · 욕망 · 반응) — 로그인 토큰이 필요해 fetch 로 받는다 */
export async function downloadRaw(period: PeriodKey): Promise<void> {
  const token = getToken();
  const res = await fetch(`/api/admin/analytics/export.csv?period=${period}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error("내보내기에 실패했어요.");
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "imagine.csv";
  saveBlob(await res.blob(), name);
}
