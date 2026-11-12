import clsx from "clsx";
import { Network } from "lucide-react";
import { Link } from "react-router-dom";
import { Avatar } from "../../design-system";
import { dateLabel, itemPath } from "../../lib/actions";
import type { Imagination } from "../../types/api";
import { ActionBar } from "../actions/ActionBar";
import { ShakeIcon } from "../actions/ShakeIcon";
import { WaveIcon } from "../actions/WaveIcon";
import styles from "./ImaginationCard.module.css";
import { ItemMenu } from "./ItemMenu";
import { QuoteEmbed } from "./QuoteEmbed";
import { SourceChips } from "./SourceChips";

/**
 * 피드 카드 — 하이젠버그 카드 구성 (기획안 v9 F3)
 *   아바타 | 닉네임 · (운영자) · 날짜                                ⋯   (분야 뱃지는 ⋯ > 뱃지 보기)
 *          | 제목 (제목이 없으면 본문 첫 줄)
 *          | 요약 2줄
 *          | 대표 이미지 (16:9)
 *          | (인용 글) 원본 카드
 *          | 액션 바
 * 팔로잉 탭 · 프로필 Wave 탭에서는 맨 위에 "≈ ○○님이 Wave함" 한 줄 (X 의 재게시 줄).
 * 인용 글·댓글은 제목 대신 본문을 그대로 보여 준다 (X 방식). 댓글 카드는 서재 북마크 탭에서 쓴다.
 * 혼합 글: 재료 줄 [Shake it 배지 · 상대 글 · 내 글 (넘치면 …) …… 계보] — 항상 한 줄 (2026-11-12 사용자 지정: 배지를 "재료" 자리로). fresh = 방금 섞어 올린 글 강조 (F8)
 */
export function ImaginationCard({
  data,
  onDeleted,
  fresh = false,
}: {
  data: Imagination;
  onDeleted?: (id: number) => void;
  fresh?: boolean;
}) {
  const { author } = data;
  const summary = data.title ? data.body : data.body.split("\n").slice(1).join(" ").trim() || data.body;
  const plain = data.kind === "quote" || data.kind === "comment"; // 제목 없이 글만
  const href = itemPath(data);
  return (
    <article className={clsx(styles.card, fresh && styles.fresh)}>
      {data.waved_by ? (
        <Link to={`/@${data.waved_by.nickname}`} className={styles.waveLine}>
          <WaveIcon aria-hidden="true" className={styles.waveLineIcon} />
          {data.waved_by.nickname}님이 Wave함
        </Link>
      ) : null}
      <Link to={`/@${author.nickname}`} aria-label={`${author.nickname} 프로필`}>
        <Avatar name={author.nickname} src={author.avatar_url} size={40} />
      </Link>
      <div className={styles.body}>
        <header className={styles.head}>
          <div className={styles.meta}>
            <Link to={`/@${author.nickname}`} className={styles.name}>
              {author.nickname}
            </Link>
            {author.is_operator ? <span className={styles.operator}>운영자</span> : null}
            <time className={styles.date} dateTime={data.created_at}>
              · {dateLabel(data.created_at)}
            </time>
          </div>
          <ItemMenu item={data} onDeleted={onDeleted} className={styles.moreBtn} />
        </header>

        {data.kind === "comment" && data.reply_to ? (
          <p className={styles.replyTo}>{data.reply_to.nickname}님에게 보내는 댓글</p>
        ) : null}

        {plain ? (
          <Link to={href} className={styles.link}>
            <p className={styles.text}>{data.body}</p>
          </Link>
        ) : (
          <Link to={href} className={styles.link}>
            <h2 className={styles.title}>{data.display_title}</h2>
            {summary && summary !== data.display_title ? <p className={styles.summary}>{summary}</p> : null}
          </Link>
        )}

        {data.quoted ? <QuoteEmbed quoted={data.quoted} /> : null}

        {data.image_url ? (
          <Link to={href} className={styles.image} tabIndex={-1} aria-hidden="true">
            <img src={data.image_url} alt="" loading="lazy" />
          </Link>
        ) : null}

        {data.kind === "blend" ? (
          <div className={styles.sources} aria-label="Shake it 재료 상상">
            <span className={styles.shakeBadge}>
              <ShakeIcon className={styles.shakeBadgeIcon} aria-hidden="true" />
              Shake it
            </span>
            <SourceChips sources={data.sources ?? []} />
            <Link to={`/i/${data.id}/lineage`} className={styles.lineage} aria-label="계보 보기">
              <Network aria-hidden="true" strokeWidth={1.8} />
            </Link>
          </div>
        ) : null}

        <ActionBar item={data} />
      </div>
    </article>
  );
}
