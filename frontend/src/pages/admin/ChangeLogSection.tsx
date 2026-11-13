import { RotateCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../../api/client";
import { Pagination } from "../../components/common/Pagination";
import type { ChangeLogs, PolicyKey } from "../../types/api";
import styles from "./Admin.module.css";
import { LogTable } from "./AdminPolicyPage";

/**
 * 변경 기록 영역 (A5 사용자 상세 · A6 기본 정책 공통, 2026-11-13 사용자 요청)
 *   제목 줄 오른쪽 [↻ 새로고침] · 표 · 페이지 번호 (게시물 탭과 같은 20 · 50 · 100개씩)
 *   기록은 지우지 않는다 — 누가 · 언제 · 무엇을 바꿨는지가 운영 근거라서 (전체 삭제 버튼 없음)
 *   reloadKey: 위에서 값을 바꾸면 바뀌어 첫 페이지를 다시 불러온다
 */
export function ChangeLogSection({
  userId,
  specOf,
  reloadKey,
}: {
  userId?: number;
  specOf: (key: string) => PolicyKey | undefined;
  reloadKey?: unknown;
}) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [data, setData] = useState<ChangeLogs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => setPage(1), [reloadKey, size]);

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), size: String(size), ...(userId ? { user_id: String(userId) } : {}) });
    setLoading(true);
    setError(null);
    api<ChangeLogs>(`/api/admin/policy/logs?${params}`)
      .then(setData, (e) => setError(e instanceof ApiError ? e.message : "기록을 불러오지 못했어요."))
      .finally(() => setLoading(false));
  }, [page, size, userId]);
  // reloadKey 가 바뀌어도 다시 부른다 (page 가 이미 1 이면 위 setPage 만으로는 부르지 않으므로)
  useEffect(load, [load, reloadKey]);

  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{userId ? "변경 기록" : "최근 변경 기록"}</h2>
        <button type="button" className={styles.refreshBtn} onClick={load} disabled={loading} aria-label="변경 기록 새로고침" title="새로고침">
          <RotateCw aria-hidden="true" className={loading ? styles.spinning : undefined} />
        </button>
      </div>
      {error ? (
        <p className={styles.sectionHint}>{error}</p>
      ) : !data ? (
        <p className={styles.sectionHint}>불러오는 중…</p>
      ) : data.total === 0 ? (
        <p className={styles.sectionHint}>아직 바꾼 기록이 없어요.</p>
      ) : (
        <>
          <LogTable logs={data.items} specOf={specOf} />
          <Pagination page={data.page} total={data.total} size={data.size} onPage={setPage} onSize={setSize} />
        </>
      )}
    </section>
  );
}
