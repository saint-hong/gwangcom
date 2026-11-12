import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";
import styles from "./ShakeButton.module.css";
import { ShakeIcon } from "./ShakeIcon";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & { count?: number };

/**
 * Shake it 버튼 — 하트·Wave·댓글과 같은 선 아이콘(배경 없음).
 * 아이콘 모양(비빔밥 그릇 + 숟가락·젓가락 + 반짝이 별)으로 구분한다. hover 색·배경·툴팁 없음.
 * 마우스를 올리면 숟가락·젓가락이 번갈아 들썩이고 별이 하나씩 깜빡인다. 쓸 수 없으면(actions.shake) aria-disabled 로 흐리게 — 누르면 안내 메시지.
 */
export function ShakeButton({ count, className, ...rest }: Props) {
  return (
    <button
      type="button"
      aria-label="Shake it: 내 상상과 섞기"
      className={clsx(styles.button, className)}
      {...rest}
    >
      <span className={styles.iconWrap}>
        <ShakeIcon className={styles.icon} aria-hidden="true" />
      </span>
      {count ? <span className={styles.count}>{count}</span> : null}
    </button>
  );
}
