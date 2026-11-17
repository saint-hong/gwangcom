import { NotebookPen } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import type { Author, NoteCard } from "../../types/api";
import { WaveIcon } from "../actions/WaveIcon";
import { NoteActions } from "./NoteActions";
import styles from "./NoteFeedCard.module.css";

/**
 * 홈 피드 사이에 끼우는 Observe Note 카드 (2026-11-17 사용자 요청 — 추천 · 최신 탭 11 · 21 · 31 … 번째)
 *   [📓 Observe Note #N · 날짜] → 제목 → 한 줄 요약 → 대표 이미지 → 반응 줄. 누르면 /notes/:id
 *   팔로잉 탭에서는 맨 위에 "≈ ○○님이 Wave함" (상상 카드와 같음), 여기서 Wave 하면 그 사람을 확산 경로(via)로 남긴다
 */
export function NoteFeedCard({ note, wavedBy }: { note: NoteCard; wavedBy?: Author | null }) {
  const navigate = useNavigate();
  const open = () => navigate(`/notes/${note.id}`);
  const date = note.published_at ? new Date(note.published_at) : null;
  return (
    <article
      className={styles.card}
      role="link"
      tabIndex={0}
      aria-label={`Observe Note: ${note.title}`}
      onClick={open}
      onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && open()}
    >
      {wavedBy ? (
        <Link to={`/@${wavedBy.nickname}`} className={styles.waveLine} onClick={(e) => e.stopPropagation()}>
          <WaveIcon aria-hidden="true" />
          {wavedBy.nickname}님이 Wave함
        </Link>
      ) : null}
      <div className={styles.badge}>
        <NotebookPen aria-hidden="true" />
        <span>Observe Note{note.number ? ` #${note.number}` : ""}</span>
        {date ? <span className={styles.date}>· {date.getMonth() + 1}월 {date.getDate()}일</span> : null}
      </div>
      <strong className={styles.title}>{note.title}</strong>
      {note.lead ? <p className={styles.lead}>{note.lead}</p> : null}
      {note.cover_url ? <img className={styles.cover} src={note.cover_url} alt="" loading="lazy" /> : null}
      <NoteActions note={note} viaUserId={wavedBy?.id} />
    </article>
  );
}
