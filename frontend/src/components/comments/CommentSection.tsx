import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { api, ApiError } from "../../api/client";
import { useAuth } from "../../hooks/useAuth";
import type { CommentThread, Imagination, Page } from "../../types/api";
import styles from "./Comments.module.css";
import { CommentComposer, type ComposerHandle } from "./CommentComposer";
import { CommentItem } from "./CommentItem";

type Props = {
  root: Imagination;
  /** 댓글 수가 바뀌면 (+1 / -1) 상세의 액션 바 숫자를 맞춘다 */
  onCountChange: (delta: number) => void;
  /** #c123 으로 들어오면 그 댓글로 스크롤 */
  focusId: number | null;
};

export type CommentSectionHandle = { focusComposer: () => void };

/**
 * 상세 화면 아래 댓글 영역 (X 구조, v10 반영목록 3장)
 *   입력창 → 댓글 목록(최신순만, 무한 스크롤). 답글은 세로선으로 이어서 오래된 순. 답글은 1단계까지.
 *   답글이 남은 삭제된 댓글은 "삭제된 댓글이에요" 자리를 남긴다.
 */
export const CommentSection = forwardRef<CommentSectionHandle, Props>(function CommentSection(
  { root, onCountChange, focusId },
  ref,
) {
  const { user } = useAuth();
  const [threads, setThreads] = useState<CommentThread[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<{ threadId: number; target: Imagination } | null>(null);
  const composer = useRef<ComposerHandle>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);

  useImperativeHandle(ref, () => ({ focusComposer: () => composer.current?.focus() }));

  const load = useCallback(
    async (from: string | null, reset: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const q = from ? `?cursor=${encodeURIComponent(from)}` : "";
        const page = await api<Page<CommentThread>>(`/api/imaginations/${root.id}/comments${q}`);
        setThreads((prev) => (reset ? page.items : [...prev, ...page.items]));
        setCursor(page.next_cursor);
        setDone(page.next_cursor === null);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "댓글을 불러오지 못했어요.");
      } finally {
        setLoading(false);
      }
    },
    [root.id],
  );

  // 로그인 상태가 바뀌면 actions · my 가 달라지므로 다시 불러온다
  useEffect(() => {
    scrolled.current = false;
    void load(null, true);
  }, [load, user?.id]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || done) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loading && !error && cursor) void load(cursor, false);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, done, loading, error, load]);

  // #c123 으로 들어왔으면 그 댓글로 한 번 스크롤
  useEffect(() => {
    if (!focusId || scrolled.current || threads.length === 0) return;
    const el = document.getElementById(`c${focusId}`);
    if (el) {
      scrolled.current = true;
      el.scrollIntoView({ block: "center" });
    }
  }, [focusId, threads]);

  const addTop = (created: Imagination) => {
    setThreads((prev) => [{ id: created.id, comment: created, replies: [] }, ...prev]);
    onCountChange(1);
  };

  const addReply = (threadId: number, created: Imagination) => {
    setThreads((prev) =>
      prev.map((t) =>
        t.id === threadId
          ? {
              ...t,
              replies: [...t.replies, created],
              comment: t.comment
                ? { ...t.comment, counts: { ...t.comment.counts, comments: t.comment.counts.comments + 1 } }
                : null,
            }
          : t,
      ),
    );
    setReplyingTo(null);
    onCountChange(1);
  };

  const removeTop = (threadId: number) => {
    setThreads((prev) =>
      prev.flatMap((t) => (t.id !== threadId ? [t] : t.replies.length ? [{ ...t, comment: null }] : [])),
    );
    onCountChange(-1);
  };

  const removeReply = (threadId: number, id: number) => {
    setThreads((prev) =>
      prev.flatMap((t) => {
        if (t.id !== threadId) return [t];
        const replies = t.replies.filter((r) => r.id !== id);
        if (!t.comment && replies.length === 0) return []; // 자리만 남은 댓글은 답글이 없어지면 사라진다
        const comment = t.comment
          ? { ...t.comment, counts: { ...t.comment.counts, comments: Math.max(0, t.comment.counts.comments - 1) } }
          : null;
        return [{ ...t, comment, replies }];
      }),
    );
    onCountChange(-1);
  };

  return (
    <section id="comments" className={styles.section} aria-label="댓글">
      <CommentComposer ref={composer} targetId={root.id} onPosted={addTop} />

      {threads.map((t) => (
        <div key={t.id} className={styles.thread}>
          {t.comment ? (
            <CommentItem
              comment={t.comment}
              rootAuthorId={root.author.id}
              threaded={t.replies.length > 0 || replyingTo?.threadId === t.id}
              highlighted={focusId === t.id}
              onReply={() => setReplyingTo({ threadId: t.id, target: t.comment as Imagination })}
              onDeleted={() => removeTop(t.id)}
            />
          ) : (
            <div className={styles.gone}>
              <span className={styles.goneText}>삭제된 댓글이에요.</span>
              <span className={styles.threadLineGone} aria-hidden="true" />
            </div>
          )}
          {t.replies.map((r, i) => (
            <CommentItem
              key={r.id}
              comment={r}
              rootAuthorId={root.author.id}
              threaded={i < t.replies.length - 1 || replyingTo?.threadId === t.id}
              highlighted={focusId === r.id}
              onReply={() => setReplyingTo({ threadId: t.id, target: r })}
              onDeleted={(id) => removeReply(t.id, id)}
            />
          ))}
          {replyingTo?.threadId === t.id ? (
            <CommentComposer
              key={replyingTo.target.id}
              targetId={replyingTo.target.id}
              replyTo={replyingTo.target.author.nickname}
              startOpen
              onPosted={(created) => addReply(t.id, created)}
              onCancel={() => setReplyingTo(null)}
            />
          ) : null}
        </div>
      ))}

      {loading ? <p className={styles.status}>불러오는 중…</p> : null}
      {error ? (
        <p className={styles.status}>
          {error}{" "}
          <button type="button" className={styles.retry} onClick={() => void load(cursor, threads.length === 0)}>
            다시 시도
          </button>
        </p>
      ) : null}
      {!loading && !error && threads.length === 0 ? (
        <p className={styles.empty}>아직 댓글이 없어요. 첫 댓글을 남겨 보세요.</p>
      ) : null}
      <div ref={sentinel} />
    </section>
  );
});
