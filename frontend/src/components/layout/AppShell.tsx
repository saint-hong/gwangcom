import clsx from "clsx";
import { Outlet, useLocation } from "react-router-dom";
import { useTheme } from "../../hooks/useTheme";
import styles from "./AppShell.module.css";
import { BottomTabBar } from "./BottomTabBar";
import { MobileTopBar } from "./MobileTopBar";
import { RightRail } from "./RightRail";
import { SideNav } from "./SideNav";
import { SiteFooter } from "./SiteFooter";

/**
 * 공통 레이아웃 — 하이젠버그 메인 캡처 기준 (상단 헤더 없음)
 *   왼쪽 사이드바 275px  |  본문 600px (좌우 세로 테두리)  |  오른쪽 컬럼 350px (+30px 간격)
 * 반응형
 *   1100px 미만: 오른쪽 컬럼 숨김 (푸터는 본문 아래로)
 *    900px 미만: 왼쪽 사이드바를 아이콘만 보이게 접음
 *    700px 미만: 사이드바 숨김 → 상단 바 + 하단 탭바
 * 넓은 본문(오른쪽 컬럼 없음)이 필요한 화면은 WIDE_PATHS 에 넣는다.
 * 인기 상상도 다른 화면과 같이 오른쪽 컬럼을 둔다 (2026-11-10 사용자 지정, 기획안 S7 "넓게" 를 바꿈).
 */
const WIDE_PATHS: string[] = [];

export function AppShell() {
  const { theme, toggle } = useTheme();
  const wide = WIDE_PATHS.includes(useLocation().pathname);
  return (
    <div className={styles.shell}>
      <MobileTopBar theme={theme} onToggleTheme={toggle} />
      <div className={clsx(styles.columns, wide && styles.wide)}>
        <header className={styles.left}>
          <SideNav theme={theme} onToggleTheme={toggle} />
        </header>
        <main className={styles.main} id="main">
          <Outlet />
          <div className={styles.mainFooter}>
            <SiteFooter />
          </div>
        </main>
        {wide ? null : (
          <aside className={styles.right} aria-label="추천">
            <RightRail />
          </aside>
        )}
      </div>
      <BottomTabBar />
    </div>
  );
}
