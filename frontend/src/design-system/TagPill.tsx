import clsx from "clsx";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import styles from "./TagPill.module.css";

type Props = { children: ReactNode; to?: string; variant?: "accent" | "neutral"; className?: string };

/**
 * 작은 알약 표시.
 * accent  = 태그 (캡처: #오피니언 — 연한 강조색 배경 + 테두리)
 * neutral = 메타 정보 (캡처: 소속 학교 pill — 회색 테두리)
 */
export function TagPill({ children, to, variant = "accent", className }: Props) {
  const cls = clsx(styles.pill, styles[variant], to && styles.link, className);
  return to ? (
    <Link to={to} className={cls}>
      {children}
    </Link>
  ) : (
    <span className={cls}>{children}</span>
  );
}
