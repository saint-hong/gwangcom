import clsx from "clsx";
import { TagPill } from "../../design-system";
import type { DomainRef, TagRef } from "../../types/api";
import styles from "./Tags.module.css";

export const tagPath = (t: TagRef) => `/tags/${encodeURIComponent(t.name)}`;
export const domainPath = (d: DomainRef) => `/?domain=${d.slug}`;

/** 글의 분야 1~2개 (첫 분야 · 두 번째 분야) */
export function domainsOf(item: { domain: DomainRef; secondary_domain: DomainRef | null }): DomainRef[] {
  return item.secondary_domain ? [item.domain, item.secondary_domain] : [item.domain];
}

/**
 * 분류 줄 = [분야] 회색 알약 + #주제(기술 태그) 보라 알약 (2026-11-12 사용자 결정).
 *   용어: 분야 = 고정 8개(누르면 홈 그 분야), 주제 = 기술 태그(누르면 S9 태그별 상상).
 *   예전 ⋯ > 뱃지 보기 는 없앴다. 욕망 태그는 분석용이라 서버가 보내지 않는다.
 * max: 주제는 카드에서 3개까지 (기획안 "#기술요소 1~3개"). 분야는 늘 다 보인다.
 */
export function TagList({
  tags,
  domains = [],
  max,
  className,
}: {
  tags: TagRef[];
  domains?: DomainRef[];
  max?: number;
  className?: string;
}) {
  if (tags.length === 0 && domains.length === 0) return null;
  const shown = max ? tags.slice(0, max) : tags;
  return (
    <ul className={clsx(styles.list, className)} aria-label="분야 · 주제">
      {domains.map((d) => (
        <li key={`d-${d.slug}`}>
          <TagPill variant="neutral" to={domainPath(d)} className={styles.domain}>
            {d.name}
          </TagPill>
        </li>
      ))}
      {shown.map((t) => (
        <li key={t.name}>
          <TagPill to={tagPath(t)}>#{t.label}</TagPill>
        </li>
      ))}
    </ul>
  );
}
