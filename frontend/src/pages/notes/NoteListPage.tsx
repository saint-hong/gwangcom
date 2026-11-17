import { NotebookPen } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../design-system";
import type { NoteList } from "../../types/api";
import { longDate } from "./noteFormat";
import styles from "./Notes.module.css";

/**
 * Observe Note 목록 (/notes, S10 — Sprint 6-E) — 발행한 노트, 최신 발행 순
 *   카드 = Observe Note #N · 제목 · 한 줄 요약 · 발행일 (· 수정됨). 누르면 /notes/:id
 */
export function NoteListPage() {
  const [items, setItems] = useState<NoteList["items"]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (after: string | null) => {
    setBusy(true);
    try {
      const res = await api<NoteList>(`/api/notes${after ? `?cursor=${encodeURIComponent(after)}` : ""}`);
      setItems((prev) => (after ? [...prev, ...res.items] : res.items));
      setCursor(res.next_cursor);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Observe Note 를 불러오지 못했어요.");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void load(null);
  }, []);

  return (
    <div>
      <PageHeader title="Observe Note" sub="상상과 욕망에 숨은 흐름을 읽은 운영자의 노트" />
      {error ? (
        <p className={styles.status}>{error}</p>
      ) : !loaded ? (
        <p className={styles.status}>불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className={styles.status}>아직 발행한 Observe Note 가 없어요.</p>
      ) : (
        <>
          {items.map((n) => (
            <Link key={n.id} to={`/notes/${n.id}`} className={styles.card}>
              <div className={styles.cardRow}>
                <div className={styles.cardText}>
                  <span className={styles.eyebrow}>
                    <NotebookPen aria-hidden="true" />
                    Observe Note #{n.number}
                  </span>
                  <strong className={styles.cardTitle}>{n.title}</strong>
                  {n.lead ? <p className={styles.cardLead}>{n.lead}</p> : null}
                  <span className={styles.meta}>
                    {n.published_at ? longDate(n.published_at) : ""}
                    {n.edited ? ` · 수정됨` : ""} · 조회 {n.view_count.toLocaleString()}
                  </span>
                </div>
                {n.cover_url ? <img className={styles.thumb} src={n.cover_url} alt="" /> : null}
              </div>
            </Link>
          ))}
          {cursor ? (
            <div className={styles.more}>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void load(cursor)}>
                더 보기
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
