import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { ActionBar } from "../../components/actions/ActionBar";
import { ItemMenu } from "../../components/card/ItemMenu";
import { PageHeader } from "../../components/layout/PageHeader";
import { Avatar } from "../../design-system";
import { useAuth } from "../../hooks/useAuth";
import { dateLabel, itemPath } from "../../lib/actions";
import type { Imagination, Page } from "../../types/api";
import styles from "./TrendingPage.module.css";

/**
 * S7 인기 상상 (하이젠버그 인기 글 구조, 기획안 v9 F12)
 *   오른쪽 컬럼 없이 넓게. 최근 7일 원본·인용을 점수(Thunder + Wave×2 + 인용×3 + 댓글) 순으로 1~20위.
 *   줄: 순위 | 아바타 · 닉네임 · 시간 …… ⋯ / 제목 · 요약 2줄 | 썸네일 / 액션 바 (다른 화면과 같은 버튼 · 순서 · 간격)
 * 인기 상상은 보여 주기만 하는 곳이 아니라 사람들 욕망의 방향을 알려 주는 풍향계 — 바로 반응할 수 있어야 한다.
 * 점수 계산식은 추후 고도화 (v10 반영목록 10장).
 */
export function TrendingPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Imagination[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user === undefined) return;
    api<Page<Imagination>>("/api/trending").then(
      (p) => setItems(p.items),
      (e) => setError(e instanceof ApiError ? e.message : "불러오지 못했어요."),
    );
  }, [user]);

  return (
    <div>
      <PageHeader title="인기 상상" sub="최근 7일, Dreamer 들의 마음이 모인 상상" />
      {error ? <p className={styles.status}>{error}</p> : null}
      {!items && !error ? <p className={styles.status}>불러오는 중…</p> : null}
      {items && items.length === 0 ? (
        <p className={styles.status}>최근 7일 동안 올라온 상상이 없어요. 첫 상상을 올려 보세요.</p>
      ) : null}
      <ol className={styles.list}>
        {items?.map((item, i) => (
          <TrendingRow
            key={item.id}
            rank={i + 1}
            item={item}
            onDeleted={(id) => setItems((prev) => prev?.filter((x) => x.id !== id) ?? null)}
          />
        ))}
      </ol>
    </div>
  );
}

function TrendingRow({ rank, item, onDeleted }: { rank: number; item: Imagination; onDeleted: (id: number) => void }) {
  const href = itemPath(item);
  const summary = item.title ? item.body : item.body.split("\n").slice(1).join(" ").trim();
  return (
    <li className={styles.row}>
      <span className={styles.rank}>{rank}</span>
      <div className={styles.main}>
        <div className={styles.top}>
          <div className={styles.content}>
            <div className={styles.meta}>
              <Link to={`/@${item.author.nickname}`} className={styles.author}>
                <Avatar name={item.author.nickname} src={item.author.avatar_url} size={20} />
                <span className={styles.name}>{item.author.nickname}</span>
              </Link>
              <span className={styles.date}>· {dateLabel(item.created_at)}</span>
              <ItemMenu item={item} onDeleted={onDeleted} className={styles.more} />
            </div>
            <Link to={href} className={styles.link}>
              <h2 className={styles.title}>{item.kind === "quote" ? item.body : item.display_title}</h2>
              {item.kind !== "quote" && summary ? <p className={styles.summary}>{summary}</p> : null}
            </Link>
          </div>
          {item.image_url ? (
            <Link to={href} className={styles.thumb} tabIndex={-1} aria-hidden="true">
              <img src={item.image_url} alt="" loading="lazy" />
            </Link>
          ) : null}
        </div>
        {/* 다른 화면과 같은 액션 바 — 인기 상상에서 바로 Thunder · Wave · 댓글 · Shake it (풍향계) */}
        <ActionBar item={item} />
      </div>
    </li>
  );
}
