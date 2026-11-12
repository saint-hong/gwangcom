import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./PageHeader.module.css";

type Props = { title: string; sub?: string; right?: ReactNode };

/** 하위 화면의 상단 바 [←] 제목 (+ 보조 정보) — 하이젠버그 서재·프로필 구조 (기획안 v9 4장) */
export function PageHeader({ title, sub, right }: Props) {
  const navigate = useNavigate();
  return (
    <div className={styles.bar}>
      <button
        type="button"
        className={styles.back}
        aria-label="뒤로"
        onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))}
      >
        <ArrowLeft aria-hidden="true" />
      </button>
      <div className={styles.titles}>
        <h1 className={styles.title}>{title}</h1>
        {sub ? <p className={styles.sub}>{sub}</p> : null}
      </div>
      {right ? <div className={styles.right}>{right}</div> : null}
    </div>
  );
}
