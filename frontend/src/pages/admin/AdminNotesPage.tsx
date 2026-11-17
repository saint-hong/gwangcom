import clsx from "clsx";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { Pagination } from "../../components/common/Pagination";
import { ButtonLink } from "../../design-system";
import type { AdminNotes } from "../../types/api";
import styles from "./Admin.module.css";
import { shortDate } from "./adminFormat";

/**
 * A2 Observe Note 관리 (/admin/notes, Sprint 6-E) — 운영자가 쓴 노트 전체(임시 저장 포함), 최근에 고친 순
 *   번호 · 제목(누르면 고치기) · 상태(임시 저장 · 발행) · 발행일 · 마지막 수정 · [보기]
 *   [새 노트] → /admin/notes/new
 */
export function AdminNotesPage() {
  const [data, setData] = useState<AdminNotes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);

  useEffect(() => {
    api<AdminNotes>(`/api/admin/notes?page=${page}&size=${size}`).then(setData, (e) => setError(e instanceof ApiError ? e.message : "목록을 불러오지 못했어요."));
  }, [page, size]);

  return (
    <div>
      <div className={styles.toolbar}>
        <span className={styles.muted}>운영자가 직접 쓰는 인사이트 글이에요. 발행하면 누구나 /notes 에서 읽을 수 있어요.</span>
        <ButtonLink to="/admin/notes/new" size="sm" className={styles.toolbarEnd}>
          <Plus aria-hidden="true" className={styles.btnIcon} /> 새 노트
        </ButtonLink>
      </div>
      {error ? (
        <p className={styles.status}>{error}</p>
      ) : !data ? (
        <p className={styles.status}>불러오는 중…</p>
      ) : data.items.length === 0 ? (
        <p className={styles.status}>아직 쓴 Observe Note 가 없어요. [새 노트]로 시작해 보세요.</p>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={clsx(styles.table, styles.centerAll)}>
              <colgroup>
                <col style={{ width: 72 }} />
                <col />
                <col style={{ width: 96 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 72 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>번호</th>
                  <th>제목</th>
                  <th>상태</th>
                  <th>발행일</th>
                  <th>마지막 수정</th>
                  <th>보기</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((n) => (
                  <tr key={n.id} className={clsx(n.status === "draft" && styles.rowHidden)}>
                    <td className={styles.muted}>{n.number ? `#${n.number}` : "—"}</td>
                    <td className={styles.content} style={{ textAlign: "left" }}>
                      <Link to={`/admin/notes/${n.id}`} className={styles.contentTitle} title={n.title}>
                        {n.title}
                      </Link>
                    </td>
                    <td>
                      <span className={clsx(styles.promptState, n.status === "published" && styles.ps_open)}>{n.status === "published" ? "발행" : "임시 저장"}</span>
                    </td>
                    <td className={styles.muted}>{n.published_at ? shortDate(n.published_at) : "—"}</td>
                    <td className={styles.muted}>{shortDate(n.updated_at)}</td>
                    <td>
                      <Link to={`/notes/${n.id}`} className={styles.textLink}>
                        보기
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={data.page}
            total={data.total}
            size={data.size}
            onPage={(n) => {
              setPage(n);
              window.scrollTo({ top: 0 });
            }}
            onSize={(s) => {
              setSize(s);
              setPage(1);
            }}
          />
        </>
      )}
    </div>
  );
}
