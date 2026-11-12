import { ShieldAlert } from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button, Tabs } from "../../design-system";
import { useAuth } from "../../hooks/useAuth";
import styles from "./Admin.module.css";

/** 운영자 화면 메뉴 (기획안 v11 4장 A1~A7). 아직 만들지 않은 화면은 "6-B에서" 같은 자리표시. */
export const ADMIN_TABS = [
  { value: "", label: "대시보드" }, // A1 (6-D)
  { value: "notes", label: "Observe Note" }, // A2 (6-E)
  { value: "prompts", label: "이번 주 질문" }, // A3 (6-C)
  { value: "imaginations", label: "게시물" }, // A4 (6-A)
  { value: "users", label: "사용자" }, // A5 (6-B)
  { value: "policy", label: "기본 정책" }, // A6 (6-B)
  { value: "graph", label: "탐색기" }, // A7 (Sprint 7)
];

/**
 * 운영자 화면 틀 (Sprint 6-A) — 서비스와 같은 사이드바 + 넓은 본문(오른쪽 컬럼 없음, AppShell 이 /admin 을 넓게).
 *   [←] 운영자 화면 / 메뉴 탭 / 각 화면
 * 운영자(role=admin)만. 서버도 /api/admin/* 를 요청마다 다시 검사한다.
 */
export function AdminLayout() {
  const { user, openAuth } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const current = pathname.replace(/^\/admin\/?/, "").split("/")[0];

  if (user === undefined) return <p className={styles.status}>불러오는 중…</p>;
  if (user === null || user.role !== "admin") {
    return (
      <div>
        <PageHeader title="운영자 화면" />
        <section className={styles.denied}>
          <ShieldAlert className={styles.deniedIcon} aria-hidden="true" strokeWidth={1.6} />
          <h1 className={styles.deniedTitle}>운영자만 볼 수 있는 화면이에요</h1>
          {user === null ? (
            <Button size="sm" onClick={() => openAuth("login")}>
              로그인
            </Button>
          ) : null}
        </section>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="운영자 화면" sub="Imagine 운영 · 분석" />
      <div className={styles.tabBar}>
        <Tabs
          tabs={ADMIN_TABS}
          value={current}
          onChange={(v) => navigate(v ? `/admin/${v}` : "/admin")}
          label="운영자 메뉴"
        />
      </div>
      <Outlet />
    </div>
  );
}
