import { useEffect, useState } from "react";
import { getHealth, type Health } from "../../api/client";
import { COMPANY_NAME, SERVICE_NAME } from "../../brand";
import styles from "./SiteFooter.module.css";

type Status = { kind: "loading" } | { kind: "ok"; health: Health } | { kind: "down" };

/** 푸터 — 링크 줄 + 회사 정보 한 줄. 개발 중에는 서버 연결 상태도 표시한다. */
export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <nav className={styles.links} aria-label="푸터 링크">
        <span>도움말</span>
        <span>이용약관(준비 중)</span>
        <span>개인정보처리방침(준비 중)</span>
        <span>문의</span>
      </nav>
      <p>
        © 2026 {COMPANY_NAME} · {SERVICE_NAME}
      </p>
      {import.meta.env.DEV ? <DevStatus /> : null}
    </footer>
  );
}

function DevStatus() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    const ctrl = new AbortController();
    getHealth(ctrl.signal)
      .then((health) => setStatus({ kind: "ok", health }))
      .catch((err: unknown) => {
        if ((err as Error).name !== "AbortError") setStatus({ kind: "down" });
      });
    return () => ctrl.abort();
  }, []);

  if (status.kind === "loading") return <p className={styles.dev}>서버 확인 중…</p>;
  if (status.kind === "down") return <p className={`${styles.dev} ${styles.bad}`}>● 백엔드 연결 안 됨 (localhost:8000)</p>;
  const { health } = status;
  return (
    <p className={styles.dev}>
      <span className={styles.good}>● 백엔드 연결됨</span> v{health.version} · DB{" "}
      <span className={health.database === "ok" ? styles.good : styles.bad}>
        {health.database === "ok" ? "연결됨" : "연결 안 됨"}
      </span>
    </p>
  );
}
