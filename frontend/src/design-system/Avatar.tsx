import clsx from "clsx";
import styles from "./Avatar.module.css";

type Props = { name: string; src?: string | null; size?: 20 | 32 | 40 | 48 | 64 | 120; className?: string };

/** 원형 아바타. 이미지가 없으면 이름 첫 글자 + 이름에서 정해지는 색. */
export function Avatar({ name, src, size = 40, className }: Props) {
  const hue = [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
  return (
    <span
      className={clsx(styles.avatar, className)}
      style={{ width: size, height: size, fontSize: size * 0.42, ["--avatar-hue" as string]: hue }}
      aria-hidden="true"
    >
      {src ? <img src={src} alt="" className={styles.img} /> : [...name][0]}
    </span>
  );
}
