import clsx from "clsx";
import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../../design-system";
import { dateLabel } from "../../lib/actions";
import type { Imagination } from "../../types/api";
import { ActionBar } from "../actions/ActionBar";
import { ItemMenu } from "../card/ItemMenu";
import styles from "./Comments.module.css";

type Props = {
  comment: Imagination;
  /** 상상 작성자 — 같은 사람이면 "작성자" 표시 */
  rootAuthorId: number;
  /** 아래에 답글이 이어지면 아바타 밑으로 세로선 (X 구조) */
  threaded?: boolean;
  highlighted?: boolean;
  onReply: () => void;
  onDeleted: (id: number) => void;
};

/**
 * 댓글 한 줄 (X 구조): 아바타 | 닉네임 · (작성자) · 시간 …… ⋯
 *                         | 글 (길면 "더 보기")
 *                         | 게시글과 같은 액션 바 (v10 반영목록 3-3)
 */
export function CommentItem({ comment, rootAuthorId, threaded, highlighted, onReply, onDeleted }: Props) {
  const { author } = comment;
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const body = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const el = body.current;
    if (el && !expanded) setClamped(el.scrollHeight > el.clientHeight + 1);
  }, [comment.body, expanded]);

  return (
    <article id={`c${comment.id}`} className={clsx(styles.item, highlighted && styles.highlight)}>
      <div className={styles.rail}>
        <Link to={`/@${author.nickname}`} aria-label={`${author.nickname} 프로필`}>
          <Avatar name={author.nickname} src={author.avatar_url} size={40} />
        </Link>
        {threaded ? <span className={styles.threadLine} aria-hidden="true" /> : null}
      </div>
      <div className={styles.main}>
        <header className={styles.head}>
          <div className={styles.meta}>
            <Link to={`/@${author.nickname}`} className={styles.name}>
              {author.nickname}
            </Link>
            {author.id === rootAuthorId ? <span className={styles.writer}>작성자</span> : null}
            <time className={styles.date} dateTime={comment.created_at}>
              · {dateLabel(comment.created_at)}
            </time>
          </div>
          <ItemMenu item={comment} onDeleted={onDeleted} className={styles.more} />
        </header>
        <p ref={body} className={clsx(styles.body, !expanded && styles.clamp)}>
          {comment.body}
        </p>
        {clamped && !expanded ? (
          <button type="button" className={styles.moreText} onClick={() => setExpanded(true)}>
            더 보기
          </button>
        ) : null}
        <ActionBar item={comment} onComment={onReply} />
      </div>
    </article>
  );
}
