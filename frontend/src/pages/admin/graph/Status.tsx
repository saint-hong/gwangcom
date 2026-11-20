import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../../../api/client";
import type { GraphStatus } from "../../../types/api";
import { shortDate } from "../adminFormat";
import styles from "./Graph.module.css";

/** 그래프 상태 (탭 줄 [그래프 재생성] · 각 그래프 설명 아래 상태 줄이 함께 씀) */
export function useGraphStatus() {
  const [st, setSt] = useState<GraphStatus | null>(null);
  const load = useCallback(() => api<GraphStatus>("/api/admin/graph/status").then(setSt, () => setSt(null)), []);
  useEffect(() => void load(), [load]);
  return { st, setSt };
}

export const GraphStatusContext = createContext<GraphStatus | null>(null);

/**
 * 상태 한 줄 — 각 그래프 설명 문구 아래 (2026-11-20 사용자: 탭 아래 줄에서 옮김, 마지막 재생성은 맨 뒤)
 *   점 · 선 · 비슷한 상상 계산 · 욕망 태그 임베딩 · 마지막 재생성
 *   설명(<p>) 안에 들어가므로 span 으로만 만든다
 */
export function StatusNote() {
  const st = useContext(GraphStatusContext);
  if (!st) return <span className={styles.statusNote}>그래프 상태를 불러오는 중…</span>;
  if (!st.enabled) return <span className={`${styles.statusNote} ${styles.bad}`}>그래프 DB 를 꺼 두었어요 (GRAPH_ENABLED=false)</span>;
  if (!st.connected) return <span className={`${styles.statusNote} ${styles.bad}`}>그래프 DB(Memgraph)에 연결할 수 없어요 — docker compose up -d memgraph</span>;
  return (
    <span className={styles.statusNote}>
      <span>
        점 {st.nodes?.toLocaleString()} · 선 {st.edges?.toLocaleString()}
      </span>
      <span title="서로 다른 Dreamer 의 비슷한 상상을 AI 가 고른 상상 수 (similar-all) — 압력장 재료">
        비슷한 상상 계산 {st.similar_rerank} / {st.similar_target}
      </span>
      <span title="욕망 태그 이름 임베딩 (CLI embed-tags) — 뜻이 가까운 욕망끼리 묶는 재료">
        욕망 태그 임베딩 {st.tag_embedded} / {st.desire_tags}
      </span>
      <span>{st.last_build ? `마지막 재생성 ${shortDate(st.last_build.at)}` : "아직 재생성하지 않았어요"}</span>
    </span>
  );
}
