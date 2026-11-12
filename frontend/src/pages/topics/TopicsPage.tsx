import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { PageHeader } from "../../components/layout/PageHeader";
import { tagPath } from "../../components/tags/TagList";
import { TagPill } from "../../design-system";
import type { Topics } from "../../types/api";
import styles from "./TopicsPage.module.css";

/**
 * S8 주제 둘러보기 (하이젠버그 주제 구조, 기획안 v10 F12)
 *   분야마다 섹션 → 그 분야 상상에 많이 붙은 기술 태그 (많은 순 · 개수) → 누르면 S9 태그별 상상.
 *   센 글 = 원본 · 인용 (혼합 글은 "대중 상상" 지표에서 뺀다). 지금은 다양한 태그를 다 보여 주는 게 우선이고,
 *   의미 없는 태그는 데이터를 보며 줄여 간다 (2026-11-12 사용자 결정).
 *   /topics#ai 처럼 분야 위치로 바로 갈 수 있다.
 */
export function TopicsPage() {
  const [data, setData] = useState<Topics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { hash } = useLocation();

  useEffect(() => {
    api<Topics>("/api/topics").then(setData, (e) =>
      setError(e instanceof ApiError ? e.message : "주제를 불러오지 못했어요."),
    );
  }, []);

  useEffect(() => {
    if (data && hash) document.getElementById(`topic-${hash.slice(1)}`)?.scrollIntoView({ block: "start" });
  }, [data, hash]);

  return (
    <div>
      <PageHeader title="주제 둘러보기" sub="분야마다 Dreamer 들이 많이 상상한 기술" />
      {error ? <p className={styles.status}>{error}</p> : null}
      {!data && !error ? <p className={styles.status}>불러오는 중…</p> : null}
      {data?.domains.map((d) => (
        <section key={d.slug} id={`topic-${d.slug}`} className={styles.section} aria-labelledby={`topic-h-${d.slug}`}>
          <h2 id={`topic-h-${d.slug}`} className={styles.title}>
            {d.name}
          </h2>
          {d.tags.length === 0 ? (
            <p className={styles.empty}>아직 이 분야의 기술 태그가 없어요.</p>
          ) : (
            <ul className={styles.tags}>
              {d.tags.map((t) => (
                <li key={t.name}>
                  <TagPill to={tagPath(t)}>
                    #{t.label}
                    <span className={styles.count}>{t.count}</span>
                  </TagPill>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
