import clsx from "clsx";
import { Check, ChevronDown } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useDismiss } from "../../hooks/useDismiss";
import styles from "./DropMenu.module.css";

type Option<T> = { value: T; label: string };

/**
 * 선택 상자 — 브라우저 기본 select 대신, 정렬 메뉴와 같은 작은 메뉴로 연다 (2026-11-12 사용자: 통일).
 *   [모든 종류 ▾] → 메뉴, 고른 줄에 ✓. 바깥 클릭 · Esc 로 닫힘. up = 위로 열기 (화면 아래쪽)
 */
export function SelectMenu<T extends string | number>({
  value,
  options,
  onChange,
  label,
  up = false,
  small = false,
}: {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  label: string;
  up?: boolean;
  small?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, ref, close);
  const current = options.find((o) => o.value === value);
  return (
    <div className={styles.wrap} ref={ref}>
      <button
        type="button"
        className={clsx(styles.trigger, small && styles.small)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${label}: ${current?.label ?? ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        {current?.label}
        <ChevronDown aria-hidden="true" />
      </button>
      {open ? (
        <div className={clsx(styles.menu, up && styles.up)} role="menu" aria-label={label}>
          {options.map((o) => {
            const on = o.value === value;
            return (
              <button
                key={String(o.value)}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                className={styles.item}
                onClick={() => {
                  onChange(o.value);
                  close();
                }}
              >
                <Check aria-hidden="true" className={clsx(styles.check, on && styles.checkOn)} />
                {o.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
