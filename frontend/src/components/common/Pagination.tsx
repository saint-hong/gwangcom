import { ChevronLeft, ChevronRight } from "lucide-react";
import styles from "./Pagination.module.css";
import { SelectMenu } from "./SelectMenu";

type Props = {
  page: number;
  total: number;
  size: number;
  sizes?: number[];
  onPage: (page: number) => void;
  onSize?: (size: number) => void;
};

/** 보여 줄 번호: 처음 · 끝 · 지금 앞뒤 2개, 사이는 … */
function pageList(page: number, last: number): (number | "gap")[] {
  const keep = new Set([1, last, page - 2, page - 1, page, page + 1, page + 2]);
  const out: (number | "gap")[] = [];
  for (let p = 1; p <= last; p++) {
    if (!keep.has(p)) continue;
    if (out.length && typeof out[out.length - 1] === "number" && (out[out.length - 1] as number) < p - 1) out.push("gap");
    out.push(p);
  }
  return out;
}

/**
 * 페이지 번호 이동 (운영자 표, 2026-11-12 사용자 요청: [더 보기] 대신 번호)
 *   전체 N개 · [20개씩 ▾]        ‹ 1 … 4 5 [6] 7 8 … 20 ›
 */
export function Pagination({ page, total, size, sizes = [20, 50, 100], onPage, onSize }: Props) {
  const last = Math.max(1, Math.ceil(total / size));
  return (
    <nav className={styles.bar} aria-label="페이지">
      <div className={styles.info}>
        <span>전체 {total.toLocaleString()}개</span>
        {onSize ? (
          <SelectMenu
            value={size}
            options={sizes.map((s) => ({ value: s, label: `${s}개씩` }))}
            onChange={onSize}
            label="한 페이지에 볼 수"
            up
            small
          />
        ) : null}
      </div>
      <div className={styles.pages}>
        <button type="button" className={styles.arrow} onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="이전 페이지">
          <ChevronLeft aria-hidden="true" />
        </button>
        {pageList(page, last).map((p, i) =>
          p === "gap" ? (
            <span key={`g${i}`} className={styles.gap} aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              className={styles.num}
              aria-current={p === page ? "page" : undefined}
              onClick={() => onPage(p)}
            >
              {p}
            </button>
          ),
        )}
        <button type="button" className={styles.arrow} onClick={() => onPage(page + 1)} disabled={page >= last} aria-label="다음 페이지">
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
