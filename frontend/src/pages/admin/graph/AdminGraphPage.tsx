import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../../api/client";
import { SelectMenu } from "../../../components/common/SelectMenu";
import { useToast } from "../../../components/feedback/Toast";
import { Button } from "../../../design-system";
import type { GraphStatus, PeriodKey } from "../../../types/api";
import adminStyles from "../Admin.module.css";
import { shortDate } from "../adminFormat";
import { DOMAIN_NAME } from "../dashboard/parts";
import { PeriodPicker, isPeriodKey } from "../dashboard/settings";
import { BundlesView } from "./BundlesView";
import { ExploreView, type Seed } from "./ExploreView";
import styles from "./Graph.module.css";

const VIEWS = [
  { value: "groups", label: "경향 다발" },
  { value: "explore", label: "파고들기" },
] as const;
type View = (typeof VIEWS)[number]["value"];

const DOMAINS = [{ value: "", label: "모든 분야" }, ...Object.entries(DOMAIN_NAME).map(([value, label]) => ({ value, label }))];

export type GraphQuery = { period: PeriodKey; domain: string; blend: boolean };

export function queryString(q: GraphQuery): string {
  const p = new URLSearchParams({ period: q.period });
  if (q.domain) p.set("domain", q.domain);
  if (q.blend) p.set("blend", "true");
  return p.toString();
}

/**
 * A7 상상 네트워크 탐색기 (Sprint 7-B, 2026-11-19 사용자 결정) — 사람들의 상상에서 비슷한 경향을 찾는다
 *   대시보드는 AI 태그를 세어 전체 경향을 보고, 탐색기는 내용이 비슷한 상상끼리 묶어 실제 상상 · Dreamer 로 따라 들어간다
 *   [경향 다발 | 파고들기]  [📅 기간] [분야 ▾] [Shake it 혼합 글 포함]   …… 그래프 상태 · [그래프 다시 만들기]
 *   보기 · 기간 · 분야 · 시작점은 주소(?view= &period= &domain= &blend= &node=)에 남는다 (대시보드에서 바로 들어올 수 있게)
 */
export function AdminGraphPage() {
  const [params, setParams] = useSearchParams();
  const view: View = params.get("view") === "explore" || params.get("node") ? "explore" : "groups";
  const raw = params.get("period");
  const query: GraphQuery = {
    period: isPeriodKey(raw) ? raw : "all",
    domain: params.get("domain") ?? "",
    blend: params.get("blend") === "true",
  };
  const [seed, setSeed] = useState<Seed | null>(() => {
    const node = params.get("node");
    return node ? { kind: "node", id: node } : null;
  });
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };
  // [그래프 다시 만들기] 뒤에는 보고 있던 보기를 저절로 다시 불러온다 (2026-11-19 사용자: 눌러도 화면이 그대로)
  const [version, setVersion] = useState(0);
  const open = (s: Seed) => {
    setSeed(s);
    set({ view: "explore", node: s.kind === "node" ? s.id : null });
  };

  return (
    <div className={styles.page}>
      <div className={adminStyles.toolbar}>
        <div className={adminStyles.seg} role="group" aria-label="탐색기 보기">
          {VIEWS.map((v) => (
            <button key={v.value} type="button" aria-pressed={view === v.value} onClick={() => set({ view: v.value, node: null })}>
              {v.label}
            </button>
          ))}
        </div>
        <div className={styles.filters}>
          <PeriodPicker value={query.period} onChange={(v) => set({ period: v })} floating />
          <SelectMenu value={query.domain} options={DOMAINS} onChange={(v) => set({ domain: v })} label="분야" />
          <label className={styles.check}>
            <input type="checkbox" checked={query.blend} onChange={(e) => set({ blend: e.target.checked ? "true" : null })} />
            Shake it 혼합 글 포함
          </label>
        </div>
      </div>
      <StatusBar onRebuilt={() => setVersion((v) => v + 1)} />
      {view === "groups" ? (
        <BundlesView key={version} query={query} onOpen={open} />
      ) : (
        <ExploreView key={version} query={query} seed={seed} onSeed={open} />
      )}
    </div>
  );
}

/** 그래프 상태 한 줄 — Memgraph 연결 · 점 / 선 수 · 마지막 반영 · 비슷한 상상 계산 현황 + [그래프 다시 만들기] */
function StatusBar({ onRebuilt }: { onRebuilt: () => void }) {
  const toast = useToast();
  const [st, setSt] = useState<GraphStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<GraphStatus>("/api/admin/graph/status").then(setSt, () => setSt(null)), []);
  useEffect(() => void load(), [load]);

  const rebuild = async () => {
    setBusy(true);
    try {
      const next = await api<GraphStatus>("/api/admin/graph/rebuild", { method: "POST" });
      setSt(next);
      onRebuilt();
      toast.show(`그래프를 다시 만들었어요 (점 ${next.nodes?.toLocaleString()} · 선 ${next.edges?.toLocaleString()}).`);
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "그래프를 만들지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  if (!st) return <div className={styles.status}>그래프 상태를 불러오는 중…</div>;
  return (
    <div className={styles.status}>
      {!st.enabled ? (
        <span className={styles.bad}>그래프 DB 를 꺼 두었어요 (GRAPH_ENABLED=false)</span>
      ) : !st.connected ? (
        <span className={styles.bad}>그래프 DB(Memgraph)에 연결할 수 없어요 — docker compose up -d memgraph</span>
      ) : (
        <span>
          점 {st.nodes?.toLocaleString()} · 선 {st.edges?.toLocaleString()}
          {st.last_build ? ` · 마지막 반영 ${shortDate(st.last_build.at)}` : " · 아직 만들지 않았어요"}
        </span>
      )}
      <span title="서로 다른 Dreamer 의 비슷한 상상을 AI 가 고른 상상 수 (similar-all)">
        비슷한 상상 계산 {st.similar_rerank} / {st.similar_target}
        {st.similar_vector ? ` (AI 없이 벡터 순서만 ${st.similar_vector})` : ""}
      </span>
      <Button size="sm" variant="outline" disabled={busy || !st.enabled} onClick={() => void rebuild()}>
        <RefreshCw className={adminStyles.btnIcon} aria-hidden="true" />
        {busy ? "만드는 중…" : "그래프 다시 만들기"}
      </Button>
    </div>
  );
}
