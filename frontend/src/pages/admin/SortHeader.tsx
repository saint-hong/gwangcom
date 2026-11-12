import clsx from "clsx";
import { ArrowDown, ArrowUp, ArrowUpDown, Check } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useDismiss } from "../../hooks/useDismiss";
import menu from "../../components/common/DropMenu.module.css";
import styles from "./Admin.module.css";

export type Sort = { key: string; order: "asc" | "desc" };
export type SortOption = { key: string; order: "asc" | "desc"; label: string };

/**
 * 표 칸 이름 + 정렬 아이콘 (2026-11-12 사용자 요청: 칸마다 정렬)
 *   아이콘을 누르면 그 칸의 정렬 방법이 메뉴로 열리고, 고르면 바로 적용된다.
 *   지금 이 칸으로 정렬 중이면 아이콘이 강조색 화살표(↑ 오름 · ↓ 내림)로 바뀐다.
 */
export function SortHeader({
  label,
  options,
  value,
  onChange,
  alignRight = false,
}: {
  alignRight?: boolean;
  label: string;
  options: SortOption[];
  value: Sort;
  onChange: (s: Sort) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, ref, close);
  const active = options.find((o) => o.key === value.key && o.order === value.order);
  const Icon = active ? (active.order === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <div className={styles.sortHead} ref={ref}>
      <span>{label}</span>
      <button
        type="button"
        className={clsx(styles.sortBtn, active && styles.sortActive)}
        aria-label={`${label} 정렬${active ? ` (지금: ${active.label})` : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon aria-hidden="true" />
      </button>
      {open ? (
        <div className={clsx(menu.menu, alignRight ? menu.right : menu.center)} role="menu" aria-label={`${label} 정렬`}>
          {options.map((o) => {
            const on = o === active;
            return (
              <button
                key={`${o.key}-${o.order}`}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                className={menu.item}
                onClick={() => {
                  onChange({ key: o.key, order: o.order });
                  close();
                }}
              >
                <Check aria-hidden="true" className={clsx(menu.check, on && menu.checkOn)} />
                {o.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
