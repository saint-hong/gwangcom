import type { LucideIcon } from "lucide-react";
import { Bell, Bookmark, Home, User, Zap } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useUnread } from "../../hooks/useUnread";
import styles from "./BottomTabBar.module.css";

/** 모바일 하단 탭바 — 홈 · 인기 · 서재 · 알림 · 마이 (기획안 v9 4장). 아이콘만, 글자 없음 */
export function BottomTabBar() {
  const { user, openAuth } = useAuth();
  const unread = useUnread().count;
  const tabs: { to: string; label: string; icon: LucideIcon; end?: boolean; member?: boolean }[] = [
    { to: "/", label: "홈", icon: Home, end: true },
    { to: "/trending", label: "인기 상상", icon: Zap },
    { to: "/library", label: "서재", icon: Bookmark, member: true },
    { to: "/notifications", label: "알림", icon: Bell, member: true },
    { to: user ? `/@${user.nickname}` : "/login", label: "마이", icon: User, member: true },
  ];
  return (
    <nav className={styles.bar} aria-label="하단 메뉴">
      {tabs.map(({ to, label, icon: Icon, end, member }) => (
        <NavLink
          key={label}
          to={to}
          end={end}
          aria-label={label}
          className={styles.tab}
          onClick={(e) => {
            if (member && !user) {
              e.preventDefault();
              openAuth("login");
            }
          }}
        >
          {({ isActive }) => (
            <span className={styles.iconWrap}>
              <Icon aria-hidden="true" strokeWidth={isActive ? 2.6 : 1.7} className={styles.icon} />
              {to === "/notifications" && unread > 0 ? <span className={styles.dot} aria-hidden="true" /> : null}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
