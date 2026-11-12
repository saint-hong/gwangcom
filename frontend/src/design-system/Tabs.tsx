import clsx from "clsx";
import styles from "./Tabs.module.css";

type Tab = { value: string; label: string };
type Props = {
  tabs: Tab[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  /** 탭 폭을 똑같이 나눠 줄 전체에 고르게 (서재처럼 탭이 많을 때) */
  even?: boolean;
};

/**
 * 상단 글자 탭 (캡처: 추천 · 바이오 · 인공지능 …).
 * 선택된 탭은 굵은 글자 + 글자 폭만큼의 강조색 밑줄. 넘치면 가로 스크롤.
 */
export function Tabs({ tabs, value, onChange, label, even = false }: Props) {
  return (
    <div className={styles.tabs} role="tablist" aria-label={label}>
      {tabs.map((t) => {
        const selected = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={selected}
            className={clsx(styles.tab, even && styles.even, selected && styles.selected)}
            onClick={() => onChange(t.value)}
          >
            <span className={styles.label}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
