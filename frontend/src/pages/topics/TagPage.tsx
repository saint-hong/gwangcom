import { useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { ImaginationCard } from "../../components/card/ImaginationCard";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../design-system";
import { useAuth } from "../../hooks/useAuth";
import { usePaged } from "../../hooks/usePaged";
import type { Imagination, TagFeed } from "../../types/api";
import styles from "./TopicsPage.module.css";

/**
 * S9 태그별 상상 (하이젠버그 주제 상세 구조, 기획안 v10 F12)
 *   [←] #태그 · 상상 N개 → 그 기술 태그가 붙은 상상 최신순 (원본 · 인용 · 혼합 모두, 2026-11-12 사용자 결정), 무한 스크롤.
 */
export function TagPage() {
  const { name = "" } = useParams();
  const { user } = useAuth();
  const list = usePaged<Imagination, TagFeed>(
    user === undefined ? null : `/api/tags/${encodeURIComponent(name)}/imaginations`,
    user ? `u${user.id}` : "guest",
    "상상을 불러오지 못했어요.",
  );

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && list.loadMore(), {
      rootMargin: "400px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [list.loadMore]);

  const tag = list.head?.tag;
  return (
    <div>
      <PageHeader title={tag ? `#${tag.label}` : "태그"} sub={tag ? `상상 ${tag.count}개` : undefined} />

      {list.items.map((item) => (
        <ImaginationCard key={item.id} data={item} onDeleted={list.remove} />
      ))}

      {list.error ? (
        <div className={styles.status}>
          <p>{list.error}</p>
          <Button size="sm" variant="outline" onClick={() => void list.retry()}>
            다시 불러오기
          </Button>
        </div>
      ) : list.loading || user === undefined ? (
        <p className={styles.status}>불러오는 중…</p>
      ) : list.done && list.items.length === 0 ? (
        <p className={styles.status}>이 태그가 붙은 상상이 아직 없어요.</p>
      ) : null}
      <div ref={sentinel} aria-hidden="true" />
    </div>
  );
}
