import { Activity, MoreHorizontal, Settings, ShieldCheck } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Avatar } from "../../design-system";
import { useAuth } from "../../hooks/useAuth";
import { useDismiss } from "../../hooks/useDismiss";
import type { Me } from "../../types/api";
import styles from "./AccountChip.module.css";

/** in••••••@gmail.com 처럼 이메일 앞부분을 가린다 */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}${"•".repeat(Math.max(3, local.length - 2))}@${domain}`;
}

/**
 * 사이드바 맨 아래 계정 칩 + 계정 메뉴 (하이젠버그 구조, 기획안 v9 4장)
 *   프로필 보기 / 설정 · 내 활동 · (운영자) 운영자 화면 / 로그아웃 + 이메일
 */
export function AccountChip({ user }: { user: Me }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, ref, close);

  return (
    <div className={styles.wrap} ref={ref}>
      {open ? (
        <div className={styles.menu} role="menu">
          <Link to={`/@${user.nickname}`} role="menuitem" className={styles.profile} onClick={close}>
            <Avatar name={user.nickname} src={user.avatar_url} size={48} />
            <span>
              <span className={styles.profileName}>{user.nickname}</span>
              <span className={styles.profileSub}>프로필 보기</span>
            </span>
          </Link>
          <div className={styles.group}>
            <Link to="/settings" role="menuitem" className={styles.item} onClick={close}>
              <Settings aria-hidden="true" /> 설정
            </Link>
            <Link to="/me/activity" role="menuitem" className={styles.item} onClick={close}>
              <Activity aria-hidden="true" /> 내 활동
            </Link>
            {user.role === "admin" ? (
              <Link to="/admin" role="menuitem" className={styles.item} onClick={close}>
                <ShieldCheck aria-hidden="true" /> 운영자 화면
              </Link>
            ) : null}
          </div>
          <div className={styles.group}>
            <button
              type="button"
              role="menuitem"
              className={styles.logout}
              onClick={() => {
                logout();
                close();
                navigate("/");
              }}
            >
              로그아웃
              <span className={styles.email}>{maskEmail(user.email)}</span>
            </button>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className={styles.chip}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="계정 메뉴"
        onClick={() => setOpen((v) => !v)}
      >
        <Avatar name={user.nickname} src={user.avatar_url} size={40} />
        <span className={styles.names}>
          <span className={styles.name}>{user.nickname}</span>
          <span className={styles.handle}>@{user.nickname}</span>
        </span>
        <MoreHorizontal className={styles.dots} aria-hidden="true" />
      </button>
    </div>
  );
}
