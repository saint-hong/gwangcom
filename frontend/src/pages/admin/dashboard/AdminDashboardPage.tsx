import { Download } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useToast } from "../../../components/feedback/Toast";
import { Button } from "../../../design-system";
import type { PeriodKey } from "../../../types/api";
import adminStyles from "../Admin.module.css";
import { CrossTab } from "./CrossTab";
import styles from "./Dashboard.module.css";
import { EngagementTab } from "./EngagementTab";
import { OverviewTab } from "./OverviewTab";
import { downloadRaw } from "./parts";
import { AiTab, ShakeTab } from "./ShakeAiTabs";
import { TechTab } from "./TechTab";

const TABS = [
  { value: "overview", label: "개요" },
  { value: "tech", label: "기술 흐름" },
  { value: "cross", label: "교차 분석" },
  { value: "engagement", label: "반응 · 질문 · 활동" },
  { value: "shake", label: "Shake it" },
  { value: "ai", label: "AI 사용량" },
] as const;
type TabKey = (typeof TABS)[number]["value"];

const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: "7d", label: "7일" },
  { value: "30d", label: "30일" },
  { value: "90d", label: "90일" },
  { value: "all", label: "전체" },
];

/**
 * A1 분석 대시보드 (Sprint 6-D, 2026-11-13) — 상상 · 욕망 · 기술이 만나는 지점에서 기술 변화의 신호를 찾는다
 *   [개요 · 기술 흐름 · 교차 분석 · 반응 · 질문 · 활동 · Shake it · AI 사용량]   [7일 · 30일 · 90일 · 전체]  [원자료 CSV]
 *   탭 · 기간은 주소(?tab= &period=)에 남아 같은 화면을 다시 열 수 있다
 *   신호는 모두 계산 규칙으로 정하고, 해석과 판단은 운영자가 한다 (원칙 4)
 */
export function AdminDashboardPage() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const tab = (TABS.find((t) => t.value === params.get("tab"))?.value ?? "overview") as TabKey;
  const period = (PERIODS.find((p) => p.value === params.get("period"))?.value ?? "30d") as PeriodKey;
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    next.set(k, v);
    setParams(next, { replace: true });
  };

  return (
    <div className={styles.page}>
      <div className={adminStyles.toolbar}>
        <div className={adminStyles.seg} role="group" aria-label="대시보드 보기">
          {TABS.map((t) => (
            <button key={t.value} type="button" aria-pressed={tab === t.value} onClick={() => set("tab", t.value)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className={styles.toolbarRight}>
          <div className={adminStyles.seg} role="group" aria-label="기간">
            {PERIODS.map((p) => (
              <button key={p.value} type="button" aria-pressed={period === p.value} onClick={() => set("period", p.value)}>
                {p.label}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            title="이 기간 대중 상상 원자료 (분야 · 기술 · 욕망 · 반응 수)"
            onClick={async () => {
              setBusy(true);
              try {
                await downloadRaw(period);
              } catch {
                toast.show("내보내기에 실패했어요.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Download className={adminStyles.btnIcon} aria-hidden="true" />
            원자료 CSV
          </Button>
        </div>
      </div>
      {tab === "overview" ? <OverviewTab period={period} onTab={(t) => set("tab", t)} /> : null}
      {tab === "tech" ? <TechTab period={period} /> : null}
      {tab === "cross" ? <CrossTab period={period} /> : null}
      {tab === "engagement" ? <EngagementTab period={period} /> : null}
      {tab === "shake" ? <ShakeTab period={period} /> : null}
      {tab === "ai" ? <AiTab period={period} /> : null}
    </div>
  );
}
