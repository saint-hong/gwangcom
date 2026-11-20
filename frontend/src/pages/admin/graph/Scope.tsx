import { useState } from "react";
import type { PeriodKey } from "../../../types/api";
import { DOMAIN_NAME } from "../dashboard/parts";
import { ChoiceSetting, PeriodSetting, periodOf, type PanelPeriod } from "../dashboard/settings";
import type { GraphQuery } from "./explorer";

/** 그래프마다 고르는 범위 (2026-11-20 사용자: 분야 · 혼합 글을 탭 줄에서 각 그래프 [설정]으로, 기간도 설정에) */
export type Scope = { period: PanelPeriod; domain: string; blend: boolean };
const DEFAULT: Scope = { period: "page", domain: "", blend: false };

/** 위 기간 버튼(page)을 따르다가, 설정에서 기간을 고르면 그 그래프만 바꾼다 (대시보드 그래프 설정과 같은 방식) */
export function useScope(page: PeriodKey) {
  const [scope, setScope] = useState<Scope>(DEFAULT);
  const query: GraphQuery = { period: periodOf(page, scope.period), domain: scope.domain, blend: scope.blend };
  return {
    scope,
    setScope,
    query,
    changed: scope.period !== "page" || scope.domain !== "" || scope.blend,
    reset: () => setScope(DEFAULT),
  };
}

const DOMAINS = [{ key: "", label: "모든 분야" }, ...Object.entries(DOMAIN_NAME).map(([key, label]) => ({ key, label }))];

/** 설정 칸 맨 위 — 기간 · 분야 · Shake it 혼합 글 (계보 보기는 혼합 글이 주인공이라 blend 칸 없음) */
export function ScopeSettings({ s, page, blend = true }: { s: ReturnType<typeof useScope>; page: PeriodKey; blend?: boolean }) {
  const { scope, setScope } = s;
  return (
    <>
      <PeriodSetting page={page} value={scope.period} onChange={(v) => setScope({ ...scope, period: v })} />
      <ChoiceSetting label="분야" options={DOMAINS} value={scope.domain} onChange={(v) => setScope({ ...scope, domain: v })} />
      {blend ? (
        <ChoiceSetting
          label="Shake it 글"
          options={[
            { key: 0, label: "빼기 (기본)" },
            { key: 1, label: "넣기" },
          ]}
          value={scope.blend ? 1 : 0}
          onChange={(v) => setScope({ ...scope, blend: v === 1 })}
        />
      ) : null}
    </>
  );
}
