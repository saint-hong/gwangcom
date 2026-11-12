import { Construction } from "lucide-react";
import styles from "./PlaceholderPage.module.css";

type Props = { title: string; sprint: string; description?: string };

/** 아직 만들지 않은 화면 — 어느 스프린트에서 만드는지 보여 준다. */
export function PlaceholderPage({ title, sprint, description }: Props) {
  return (
    <section className={styles.wrap}>
      <Construction className={styles.icon} aria-hidden="true" strokeWidth={1.6} />
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.text}>{description ?? `이 화면은 ${sprint}에서 만들어요.`}</p>
    </section>
  );
}
