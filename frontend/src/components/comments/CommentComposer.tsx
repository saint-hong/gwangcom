import clsx from "clsx";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { api, ApiError } from "../../api/client";
import { Avatar, Button } from "../../design-system";
import { useAuth } from "../../hooks/useAuth";
import type { Imagination } from "../../types/api";
import styles from "./Comments.module.css";

const MAX = 300; // 기본 댓글 한도 (F20). 최종 검사는 서버가 한다.

type Props = {
  /** 댓글을 달 글 (상상이면 댓글, 댓글이면 답글) */
  targetId: number;
  /** 답글이면 "○○님에게 보내는 답글" */
  replyTo?: string;
  /** 처음부터 펼쳐 둘지 (답글 입력창) */
  startOpen?: boolean;
  onPosted: (created: Imagination) => void;
  onCancel?: () => void;
};

export type ComposerHandle = { focus: () => void };

/**
 * 댓글 입력창 (X 구조, v10 반영목록 3-4) — 평소에는 한 줄로 접혀 있다가 누르면 펼쳐져 [취소][댓글].
 * 글자만 쓴다(이미지·이모지 도구 없음). 로그인 전이면 로그인 모달.
 */
export const CommentComposer = forwardRef<ComposerHandle, Props>(function CommentComposer(
  { targetId, replyTo, startOpen = false, onPosted, onCancel },
  ref,
) {
  const { user, openAuth } = useAuth();
  const [open, setOpen] = useState(startOpen);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const expand = () => {
    if (!user) {
      openAuth("login");
      return false;
    }
    setOpen(true);
    return true;
  };

  useImperativeHandle(ref, () => ({
    focus: () => {
      if (expand()) requestAnimationFrame(() => input.current?.focus());
    },
  }));

  const cancel = () => {
    setText("");
    setError(null);
    setOpen(false);
    onCancel?.();
  };

  const submit = async () => {
    setSending(true);
    setError(null);
    try {
      const created = await api<Imagination>(`/api/imaginations/${targetId}/comments`, { json: { body: text } });
      setText("");
      setOpen(startOpen);
      onPosted(created);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) openAuth("login");
      setError(e instanceof ApiError ? e.message : "올리지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSending(false);
    }
  };

  const over = text.length > MAX;
  const label = replyTo ? "답글" : "댓글";
  return (
    <div className={clsx(styles.composer, replyTo && styles.replyComposer)}>
      {open && replyTo ? <p className={styles.replyHint}>{replyTo}님에게 보내는 답글</p> : null}
      <div className={styles.composerRow}>
        <Avatar name={user?.nickname ?? "?"} src={user?.avatar_url ?? null} size={replyTo ? 32 : 40} />
        <textarea
          ref={input}
          className={clsx(styles.composerInput, open && styles.composerOpen)}
          value={text}
          rows={open ? 3 : 1}
          placeholder={replyTo ? "답글을 남겨 보세요" : "이 상상에 대한 생각을 남겨 주세요"}
          aria-label={`${label} 쓰기`}
          onFocus={() => {
            if (!expand()) input.current?.blur();
          }}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {open ? (
        <div className={styles.composerFoot}>
          <span className={over ? styles.over : styles.counter}>
            {text.length} / {MAX}
          </span>
          <Button variant="outline" size="sm" onClick={cancel}>
            취소
          </Button>
          <Button size="sm" onClick={() => void submit()} disabled={sending || over || !text.trim()}>
            {label}
          </Button>
        </div>
      ) : null}
    </div>
  );
});
