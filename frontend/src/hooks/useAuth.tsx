import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, getToken, setToken } from "../api/client";
import { AuthModal } from "../components/auth/AuthModal";
import type { Me, TokenResponse } from "../types/api";

export type AuthMode = "login" | "signup";

type AuthApi = {
  /** undefined = 확인 중, null = 비로그인 */
  user: Me | null | undefined;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, nickname: string) => Promise<void>;
  logout: () => void;
  openAuth: (mode?: AuthMode) => void;
  /** 프로필 수정 뒤 내 정보를 바꾼다 */
  setMe: (me: Me) => void;
};

const AuthContext = createContext<AuthApi | null>(null);

/** 로그인 상태 + 로그인·가입 모달 (기획안 v9 F1, S2). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null | undefined>(getToken() ? undefined : null);
  const [modal, setModal] = useState<AuthMode | null>(null);

  useEffect(() => {
    if (!getToken()) return;
    const ctrl = new AbortController();
    api<Me>("/api/auth/me", { signal: ctrl.signal })
      .then(setUser)
      .catch((e: Error) => {
        if (e.name === "AbortError") return;
        setToken(null); // 만료·잘못된 토큰
        setUser(null);
      });
    return () => ctrl.abort();
  }, []);

  const applyToken = useCallback((res: TokenResponse) => {
    setToken(res.access_token);
    setUser(res.user);
    setModal(null);
  }, []);

  const value = useMemo<AuthApi>(
    () => ({
      user,
      login: async (email, password) =>
        applyToken(await api<TokenResponse>("/api/auth/login", { json: { email, password } })),
      signup: async (email, password, nickname) =>
        applyToken(await api<TokenResponse>("/api/auth/signup", { json: { email, password, nickname } })),
      logout: () => {
        setToken(null);
        setUser(null);
      },
      openAuth: (mode = "login") => setModal(mode),
      setMe: (me) => setUser(me),
    }),
    [user, applyToken],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {modal ? <AuthModal mode={modal} onModeChange={setModal} onClose={() => setModal(null)} /> : null}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth 는 AuthProvider 안에서 써야 해요");
  return ctx;
}
