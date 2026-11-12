import { Link } from "react-router-dom";
import { Avatar } from "../../design-system";
import { dateLabel } from "../../lib/actions";
import type { Quoted } from "../../types/api";
import styles from "./QuoteEmbed.module.css";

/** 인용 글 아래에 붙는 원본 카드 (X 방식, 기획안 v9 F3 · F6). 원본이 삭제되면 "삭제된 상상이에요". */
export function QuoteEmbed({ quoted, preview = false }: { quoted: Quoted; preview?: boolean }) {
  if (quoted.deleted || !quoted.author) {
    return <div className={`${styles.embed} ${styles.gone}`}>삭제된 상상이에요.</div>;
  }
  const isComment = quoted.kind === "comment";
  // 인용하기 창(preview): 누를 수 없는 카드 + 이미지를 아래에 크게 (X 인용하기 창)
  if (preview) {
    return (
      <div className={`${styles.embed} ${styles.preview}`}>
        <div className={styles.head}>
          <Avatar name={quoted.author.nickname} src={quoted.author.avatar_url} size={20} />
          <span className={styles.name}>{quoted.author.nickname}</span>
          {quoted.created_at ? <span className={styles.date}>· {dateLabel(quoted.created_at)}</span> : null}
        </div>
        {!isComment && quoted.display_title ? <p className={styles.title}>{quoted.display_title}</p> : null}
        <p className={styles.body}>{quoted.body}</p>
        {quoted.image_url ? <img className={styles.wide} src={quoted.image_url} alt="" /> : null}
      </div>
    );
  }
  return (
    <Link to={`/i/${quoted.id}`} className={styles.embed}>
      <div className={styles.head}>
        <Avatar name={quoted.author.nickname} src={quoted.author.avatar_url} size={20} />
        <span className={styles.name}>{quoted.author.nickname}</span>
        {quoted.created_at ? <span className={styles.date}>· {dateLabel(quoted.created_at)}</span> : null}
      </div>
      <div className={styles.content}>
        <div className={styles.text}>
          {!isComment && quoted.display_title ? <p className={styles.title}>{quoted.display_title}</p> : null}
          <p className={styles.body}>{quoted.body}</p>
        </div>
        {quoted.image_url ? <img className={styles.thumb} src={quoted.image_url} alt="" loading="lazy" /> : null}
      </div>
    </Link>
  );
}
