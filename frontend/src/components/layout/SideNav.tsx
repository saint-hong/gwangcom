import clsx from "clsx";
import { LogIn, Moon, MoreHorizontal, SquarePen, Sun, UserPlus } from "lucide-react";
import { useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { SERVICE_NAME } from "../../brand";
import { Button, ButtonLink } from "../../design-system";
import { useAuth } from "../../hooks/useAuth";
import { useUnread } from "../../hooks/useUnread";
import { useDismiss } from "../../hooks/useDismiss";
import type { Theme } from "../../hooks/useTheme";
import { AccountChip } from "./AccountChip";
import { ImagineLogo } from "./ImagineLogo";
import { sideNav } from "./navItems";
import styles from "./SideNav.module.css";

type Props = { theme: Theme; onToggleTheme: () => void };

/**
 * 왼쪽 사이드바 (하이젠버그 구조, 기획안 v9 4장)
 *   로그인 전: 로고 → 메뉴 → 더 보기 → [가입하기] [로그인]
 *   로그인 후: 로고 → 메뉴 → 더 보기 → [상상하기] …… 맨 아래 계정 칩
 */
export function SideNav({ theme, onToggleTheme }: Props) {
  const { user, openAuth } = useAuth();
  const items = sideNav(user ? user.nickname : null);
  const unread = useUnread().count;

  return (
    <div className={styles.side}>
      <Link to="/" className={styles.logo} aria-label={`${SERVICE_NAME} 홈`}>
        <ImagineLogo />
      </Link>

      <nav className={styles.nav} aria-label="주 메뉴">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => clsx(styles.item, isActive && styles.active)}>
            {({ isActive }) => (
              <>
                <span className={styles.iconWrap}>
                  <Icon className={styles.icon} aria-hidden="true" strokeWidth={isActive ? 2.4 : 1.8} />
                  {to === "/notifications" && unread > 0 ? (
                    <span className={styles.badge} aria-label={`안 읽은 알림 ${unread}개`}>
                      {unread > 99 ? "99+" : unread}
                    </span>
                  ) : null}
                </span>
                <span className={styles.label}>{label}</span>
              </>
            )}
          </NavLink>
        ))}
        <MoreMenu theme={theme} onToggleTheme={onToggleTheme} />
      </nav>

      {user === undefined ? null : user ? (
        <>
          <div className={styles.auth}>
            <ButtonLink to="/write" size="lg" block className={styles.fullButton}>
              상상하기
            </ButtonLink>
            <Link to="/write" className={clsx(styles.roundButton, styles.roundPrimary)} aria-label="상상하기">
              <SquarePen aria-hidden="true" strokeWidth={2} />
            </Link>
          </div>
          <div className={styles.account}>
            <AccountChip user={user} />
          </div>
        </>
      ) : (
        <div className={styles.auth}>
          <Button size="lg" block className={styles.fullButton} onClick={() => openAuth("signup")}>
            가입하기
          </Button>
          <Button variant="outline" size="md" block className={styles.fullButton} onClick={() => openAuth("login")}>
            로그인
          </Button>
          {/* 접힌 사이드바(아이콘만)에서 쓰는 둥근 버튼 */}
          <button
            type="button"
            className={clsx(styles.roundButton, styles.roundPrimary)}
            aria-label="가입하기"
            onClick={() => openAuth("signup")}
          >
            <UserPlus aria-hidden="true" strokeWidth={2} />
          </button>
          <button type="button" className={styles.roundButton} aria-label="로그인" onClick={() => openAuth("login")}>
            <LogIn aria-hidden="true" strokeWidth={2} />
          </button>
        </div>
      )}
    </div>
  );
}

/** 더 보기 — 다크 모드 */
function MoreMenu({ theme, onToggleTheme }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, ref, () => setOpen(false));

  return (
    <div className={styles.more} ref={ref}>
      <button
        type="button"
        className={styles.item}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal className={clsx(styles.icon, styles.moreIcon)} aria-hidden="true" strokeWidth={1.8} />
        <span className={styles.label}>더 보기</span>
      </button>
      {open ? (
        <div className={styles.menu} role="menu">
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => {
              onToggleTheme();
              setOpen(false);
            }}
          >
            {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
            {theme === "dark" ? "라이트 모드" : "다크 모드"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
