import { ChevronDown, ChevronUp, Eye, NotebookPen, Sparkles } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { PageHeader } from "../../components/layout/PageHeader";
import { NoteActions } from "../../components/note/NoteActions";
import { NoteBody, noteToc } from "../../components/note/NoteBody";
import { NoteToc } from "../../components/note/NoteToc";
import { Avatar } from "../../design-system";
import { useAuth } from "../../hooks/useAuth";
import { setNoteToc } from "../../hooks/useNoteToc";
import type { Note, NoteList } from "../../types/api";
import { longDate } from "./noteFormat";
import styles from "./Notes.module.css";

/**
 * Observe Note 상세 (/notes/:id, S10 — Sprint 6-E, 2026-11-17 X · h사 긴 글 검토 뒤 사용자 결정)
 *   머리는 X 처럼 단순하게: 작성자 줄(사진 · 이름 · 날짜) → 대표 이미지 → 제목 → 한 줄 요약 → 반응 줄(Thunder · Wave · 조회수 …… 북마크 · 공유)
 *   → AI 요약(운영자가 확정한 것, 접기) → 본문 → 출처(있을 때만) → 다른 Observe Note
 *   목차는 오른쪽 패널 맨 위 (오른쪽 패널이 없는 좁은 화면은 본문 위). 분야 알약은 넣지 않는다 (노트는 분야를 넘는 흐름을 다룸)
 */
export function NotePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [note, setNote] = useState<Note | null>(null);
  const [others, setOthers] = useState<NoteList["items"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(true);

  useEffect(() => {
    setNote(null);
    setError(null);
    api<Note>(`/api/notes/${id}`).then(setNote, (e) => setError(e instanceof ApiError ? e.message : "Observe Note 를 불러오지 못했어요."));
    api<NoteList>("/api/notes").then((l) => setOthers(l.items.filter((n) => String(n.id) !== id).slice(0, 3)), () => setOthers([]));
  }, [id, user?.id]);

  const toc = note ? noteToc(note.body_md) : [];
  const tocKey = toc.map((t) => t.id).join("|");
  useEffect(() => {
    setNoteToc(toc);
    return () => setNoteToc([]);
    // 목차 내용이 바뀔 때만 다시 넣는다 (tocKey)
  }, [tocKey]);

  const summary = note?.summary?.split("\n").filter(Boolean) ?? [];
  const sources = note?.sources?.split("\n").filter(Boolean) ?? [];
  return (
    <div>
      <PageHeader
        title="Observe Note"
        right={
          user?.role === "admin" && note ? (
            <Link to={`/admin/notes/${note.id}`} className={styles.editLink}>
              고치기
            </Link>
          ) : undefined
        }
      />
      {error ? (
        <p className={styles.status}>{error}</p>
      ) : !note ? (
        <p className={styles.status}>불러오는 중…</p>
      ) : (
        <article className={styles.article}>
          {note.status === "draft" ? <p className={styles.draftBanner}>임시 저장 — 아직 공개되지 않았어요 (운영자에게만 보여요)</p> : null}

          <div className={styles.byline}>
            {note.author ? <Avatar name={note.author.nickname} src={note.author.avatar_url} size={40} /> : null}
            <div>
              <strong>{note.author?.nickname ?? "운영자"}</strong>
              <span>
                {note.number ? `Observe Note #${note.number} · ` : ""}
                {note.published_at ? longDate(note.published_at) : "발행 전"}
                {note.edited ? ` · 수정됨` : ""}
              </span>
            </div>
          </div>

          {note.cover_url ? <img className={styles.cover} src={note.cover_url} alt="" /> : null}

          <h1 className={styles.title}>{note.title}</h1>
          {note.lead ? <p className={styles.lead}>{note.lead}</p> : null}

          <div className={styles.actionBar}>
            <NoteActions
              note={note}
              extra={
                <span className={styles.views} title="조회수" aria-label={`조회수 ${note.view_count}`}>
                  <Eye aria-hidden="true" /> {note.view_count.toLocaleString()}
                </span>
              }
            />
          </div>

          {summary.length ? (
            <section className={styles.summary} aria-label="AI 요약">
              <button type="button" className={styles.summaryHead} aria-expanded={summaryOpen} onClick={() => setSummaryOpen((o) => !o)}>
                <Sparkles aria-hidden="true" />
                <span>AI 요약</span>
                {summaryOpen ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
              </button>
              {summaryOpen ? (
                <ul>
                  {summary.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}

          {/* 좁은 화면(오른쪽 패널 없음)에서만 보이는 목차 */}
          {toc.length >= 2 ? (
            <div className={styles.inlineToc}>
              <NoteToc items={toc} />
            </div>
          ) : null}

          <div className={styles.bodyWrap}>
            <NoteBody md={note.body_md} />
          </div>

          {sources.length ? (
            <section className={styles.sources}>
              <h2>출처</h2>
              <ol>
                {sources.map((s, i) => (
                  <li key={i}>
                    <Linkified text={s} />
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {others.length ? (
            <section className={styles.others}>
              <h2>다른 Observe Note</h2>
              {others.map((n) => (
                <Link key={n.id} to={`/notes/${n.id}`} className={styles.otherCard}>
                  {n.cover_url ? <img src={n.cover_url} alt="" /> : <span className={styles.otherIcon}><NotebookPen aria-hidden="true" /></span>}
                  <span className={styles.otherText}>
                    <strong>{n.title}</strong>
                    {n.lead ? <span>{n.lead}</span> : null}
                    <small>{n.published_at ? longDate(n.published_at) : ""}</small>
                  </span>
                </Link>
              ))}
              <Link to="/notes" className={styles.allLink}>
                Observe Note 모두 보기
              </Link>
            </section>
          ) : null}
        </article>
      )}
    </div>
  );
}

/** 출처 줄의 주소(http…)를 링크로 */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer noopener">
            {p}
          </a>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}
