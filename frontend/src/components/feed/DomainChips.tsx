import clsx from "clsx";
import { DOMAINS } from "../../brand";
import styles from "./DomainChips.module.css";

type Props = { value: string | null; onChange: (slug: string | null) => void };

/** 로그인 후 홈의 분야 칩 줄 [전체] [AI] [Semiconductor] … (하이젠버그 구조, 넘치면 가로 스크롤) */
export function DomainChips({ value, onChange }: Props) {
  const chips = [{ slug: null as string | null, name: "전체" }, ...DOMAINS];
  return (
    <div className={styles.row} role="tablist" aria-label="분야">
      {chips.map((c) => {
        const selected = c.slug === value;
        return (
          <button
            key={c.name}
            type="button"
            role="tab"
            aria-selected={selected}
            className={clsx(styles.chip, selected && styles.selected)}
            onClick={() => onChange(c.slug)}
          >
            {c.name}
          </button>
        );
      })}
    </div>
  );
}
