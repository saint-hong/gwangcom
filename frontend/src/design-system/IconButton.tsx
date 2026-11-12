import clsx from "clsx";
import type { ButtonHTMLAttributes, ComponentType, SVGProps } from "react";
import styles from "./IconButton.module.css";

export type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { strokeWidth?: number | string }>;

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  /** lucide-react 아이콘 또는 같은 props 를 받는 자체 아이콘 (예: WaveIcon) */
  icon: IconComponent;
  /** 스크린리더용 이름 (버튼에 글자·툴팁은 표시하지 않는다) */
  label: string;
  /** 아이콘 오른쪽 숫자. 0 이거나 없으면 표시하지 않는다 */
  count?: number;
  active?: boolean;
  /** 켜졌을 때(active) 색 (예: var(--color-thunder)). 마우스를 올렸을 때는 색·배경이 바뀌지 않고 움직임만 있다 */
  color?: string;
  /** 켜졌을 때 아이콘을 채울지 (하트·책갈피) */
  fillWhenActive?: boolean;
  size?: "sm" | "md";
  iconClassName?: string;
};

/** 반응·액션 버튼의 기본형: 아이콘 + (숫자). 글자·툴팁·hover 색 없음, 움직임은 쓰는 쪽 CSS 에서 준다. */
export function IconButton({
  icon: Icon,
  label,
  count,
  active = false,
  color,
  fillWhenActive = false,
  size = "md",
  className,
  iconClassName,
  style,
  ...rest
}: Props) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={rest.onClick ? active : undefined}
      className={clsx(styles.button, styles[size], className)}
      style={active && color ? { ...style, color } : style}
      {...rest}
    >
      <span className={styles.iconWrap}>
        <Icon
          className={clsx(styles.icon, iconClassName)}
          aria-hidden="true"
          strokeWidth={1.8}
          fill={active && fillWhenActive ? "currentColor" : "none"}
        />
      </span>
      {count ? <span className={styles.count}>{count}</span> : null}
    </button>
  );
}
