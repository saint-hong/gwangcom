import { useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { useToast } from "../../components/feedback/Toast";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../design-system";
import { useAuth } from "../../hooks/useAuth";
import styles from "./SettingsPage.module.css";

/**
 * S14 설정 (계정 메뉴 > 설정). 프로필(이름 · 소개 · 이미지)은 프로필 화면의 [프로필 수정] 팝업에서 바꾼다 (v10 반영목록 7장).
 * 여기서는 비밀번호만 바꾼다.
 */
export function SettingsPage() {
  const { user, openAuth } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user === null) {
    return (
      <div>
        <PageHeader title="설정" />
        <div className={styles.page}>
          <Button size="sm" onClick={() => openAuth("login")}>
            로그인
          </Button>
        </div>
      </div>
    );
  }

  const mismatch = confirm.length > 0 && next !== confirm;
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/users/me/password", { json: { current_password: current, new_password: next } });
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.show("비밀번호를 바꿨어요.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "바꾸지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="설정" />
      <div className={styles.page}>
        <section className={styles.section}>
          <h2 className={styles.heading}>프로필</h2>
          <p className={styles.text}>
            이름 · 자기소개 · 프로필 이미지 · 커버 이미지는{" "}
            {user ? <Link to={`/@${user.nickname}`}>내 프로필</Link> : "내 프로필"}의 [프로필 수정]에서 바꿀 수 있어요.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.heading}>비밀번호 변경</h2>
          <label className={styles.field}>
            <span>지금 비밀번호</span>
            <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>새 비밀번호 (8자 이상)</span>
            <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>새 비밀번호 확인</span>
            <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          {mismatch ? <p className={styles.error}>새 비밀번호가 서로 달라요.</p> : null}
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          <Button size="md" disabled={busy || !current || next.length < 8 || next !== confirm} onClick={() => void submit()}>
            비밀번호 바꾸기
          </Button>
        </section>
      </div>
    </div>
  );
}
