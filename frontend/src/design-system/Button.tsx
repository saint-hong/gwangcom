import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";
import { Link, type LinkProps } from "react-router-dom";
import styles from "./Button.module.css";

type Variant = "primary" | "outline" | "dark"; // dark = 검정 채움 (보라 버튼 옆 보조 동작, 2026-11-13)
type Size = "lg" | "md" | "sm";

type Common = { variant?: Variant; size?: Size; block?: boolean; className?: string };

/** 알약형 버튼 (캡처: 가입하기=primary lg, 로그인=outline md, 팔로우·구독하기=primary sm) */
export function Button({
  variant = "primary",
  size = "md",
  block = false,
  className,
  ...rest
}: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={clsx(styles.button, styles[variant], styles[size], block && styles.block, className)}
      {...rest}
    />
  );
}

/** 버튼 모양의 링크 */
export function ButtonLink({
  variant = "primary",
  size = "md",
  block = false,
  className,
  ...rest
}: Common & LinkProps) {
  return (
    <Link
      className={clsx(styles.button, styles[variant], styles[size], block && styles.block, className)}
      {...rest}
    />
  );
}
