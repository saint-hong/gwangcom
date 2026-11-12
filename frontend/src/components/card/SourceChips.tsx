import clsx from "clsx";
import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Imagination } from "../../types/api";
import styles from "./ImaginationCard.module.css";

type Source = NonNullable<Imagination["sources"]>[number];

/**
 * 혼합 글 카드의 재료 알약 줄 — 항상 한 줄 (2026-11-12 사용자 지정).
 * 줄을 넘으면 넘친 알약은 잘리고 끝에 "…" 를 붙인다. 재료를 다 보려면 상세나 계보로 간다.
 * 알약은 글자가 길면 먼저 말줄임으로 줄어들고(최소 폭까지), 그래도 넘치면 뒤쪽 알약이 가려진다.
 */
export function SourceChips({ sources }: { sources: Source[] }) {
  const listRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const check = () => setOverflow(el.scrollWidth > el.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sources]);

  return (
    <>
      <div ref={listRef} className={clsx(styles.sourceList, overflow && styles.sourceListCut)}>
        {sources.map((s, i) =>
          s.deleted || s.id === null ? (
            <span key={i} className={clsx(styles.source, styles.sourceGone)}>
              삭제된 상상
            </span>
          ) : (
            <Link key={i} to={`/i/${s.id}`} className={styles.source} title={s.display_title ?? undefined}>
              {s.display_title}
            </Link>
          ),
        )}
      </div>
      {overflow ? (
        <span className={styles.sourceMore} aria-label={`재료 상상 ${sources.length}개 중 일부만 보여요`}>
          …
        </span>
      ) : null}
    </>
  );
}
