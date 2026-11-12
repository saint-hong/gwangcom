import { LogIn, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../../api/client";
import { SERVICE_NAME } from "../../brand";
import { Button } from "../../design-system";
import { useAuth, type AuthMode } from "../../hooks/useAuth";
import styles from "./AuthModal.module.css";

type Props = { mode: AuthMode; onModeChange: (m: AuthMode) => void; onClose: () => void };

/** 로그인 · 가입 모달 (하이젠버그 로그인 모달 구조, 문구는 Imagine 자체 문구) */
export function AuthModal({ mode, onModeChange, onClose }: Props) {
  const { login, signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstField.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => setError(null), [mode]);

  function close() {
    onClose();
    // /login · /signup 주소로 들어왔으면 홈으로
    if (location.pathname === "/login" || location.pathname === "/signup") navigate("/", { replace: true });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") await login(email, password);
      else await signup(email, password, nickname);
      if (location.pathname === "/login" || location.pathname === "/signup") navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  const isLogin = mode === "login";
  return (
    <div className={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button type="button" className={styles.close} onClick={close} aria-label="닫기">
          <X aria-hidden="true" />
        </button>
        <span className={styles.badge} aria-hidden="true">
          <LogIn />
        </span>
        <h2 id="auth-title" className={styles.title}>
          {isLogin ? `${SERVICE_NAME} 에 오신 걸 환영해요` : "Dreamer 가 되어 보세요"}
        </h2>
        <p className={styles.lead}>
          {isLogin ? "로그인하거나 가입해 보세요." : "가입하면 누구나 바로 상상을 올릴 수 있어요."}
        </p>

        <form className={styles.form} onSubmit={submit} noValidate>
          <label className={styles.label}>
            이메일
            <input
              ref={firstField}
              type="email"
              autoComplete="email"
              className={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className={styles.label}>
            비밀번호{isLogin ? null : <span className={styles.hint}> 8자 이상</span>}
            <input
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {isLogin ? null : (
            <label className={styles.label}>
              닉네임<span className={styles.hint}> 한글·영문·숫자·_ 2~20자, 프로필 주소가 돼요</span>
              <input
                type="text"
                autoComplete="nickname"
                className={styles.input}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                required
              />
            </label>
          )}
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="md" block disabled={busy} className={styles.submit}>
            {busy ? "잠시만요…" : isLogin ? "로그인" : "가입하기"}
          </Button>
        </form>

        <p className={styles.switch}>
          {isLogin ? "계정이 없나요? " : "이미 계정이 있나요? "}
          <button type="button" className={styles.switchLink} onClick={() => onModeChange(isLogin ? "signup" : "login")}>
            {isLogin ? "가입하기" : "로그인"}
          </button>
        </p>
      </div>
    </div>
  );
}
