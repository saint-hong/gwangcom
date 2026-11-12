import { Moon, SquarePen, Sun } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { SERVICE_NAME } from "../../brand";
import { IconButton } from "../../design-system";
import { useAuth } from "../../hooks/useAuth";
import type { Theme } from "../../hooks/useTheme";
import { ImagineLogo } from "./ImagineLogo";
import styles from "./MobileTopBar.module.css";

type Props = { theme: Theme; onToggleTheme: () => void };

/** 모바일(700px 미만) 상단 바 — 로고 · 다크 모드 · (로그인 후) 상상하기 / (로그인 전) 가입하기 */
export function MobileTopBar({ theme, onToggleTheme }: Props) {
  const navigate = useNavigate();
  const { user, openAuth } = useAuth();
  return (
    <div className={styles.bar}>
      <Link to="/" aria-label={`${SERVICE_NAME} 홈`}>
        <ImagineLogo />
      </Link>
      <div className={styles.actions}>
        <IconButton
          icon={theme === "dark" ? Sun : Moon}
          label={theme === "dark" ? "라이트 모드" : "다크 모드"}
          onClick={onToggleTheme}
        />
        {user ? (
          <IconButton icon={SquarePen} label="상상하기" onClick={() => navigate("/write")} />
        ) : user === null ? (
          <button type="button" className={styles.signup} onClick={() => openAuth("signup")}>
            가입하기
          </button>
        ) : null}
      </div>
    </div>
  );
}
