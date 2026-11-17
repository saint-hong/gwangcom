import clsx from "clsx";
import { useEffect, useState } from "react";
import type { TocItem } from "./NoteBody";
import styles from "./NoteToc.module.css";

/**
 * Observe Note 목차 (2026-11-17 사용자 결정: 오른쪽 패널 맨 위, h사 긴 글 구조)
 *   ## 소제목 · ### 작은 소제목(들여쓰기) 두 단계, 지금 읽는 곳 굵게 + 왼쪽 막대. 누르면 그 자리로 부드럽게 이동
 */
export function NoteToc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (!items.length) return;
    const onScroll = () => {
      let cur: string | null = null;
      for (const t of items) {
        const el = document.getElementById(t.id);
        if (el && el.getBoundingClientRect().top < 140) cur = t.id;
      }
      setActive(cur ?? items[0].id);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [items]);

  return (
    <nav className={styles.toc} aria-label="목차">
      <h2 className={styles.title}>목차</h2>
      <ol className={styles.list}>
        {items.map((t) => (
          <li key={t.id}>
            <a
              href={`#${t.id}`}
              className={clsx(styles.item, t.level === 3 && styles.sub, active === t.id && styles.on)}
              aria-current={active === t.id ? "location" : undefined}
              onClick={(e) => {
                const el = document.getElementById(t.id);
                if (!el) return;
                e.preventDefault();
                el.scrollIntoView({ behavior: "smooth", block: "start" });
                history.replaceState(null, "", `#${t.id}`);
              }}
            >
              {t.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
