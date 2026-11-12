/**
 * 백엔드 API 호출. 개발 중에는 Vite 가 /api 를 localhost:8000 으로 넘긴다.
 * 로그인 토큰은 localStorage 에 둔다 (기획안 v9 10장 — 보안 강화 때 httpOnly 쿠키로 바꾼다).
 */

const TOKEN_KEY = "imagine.token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* 저장소를 못 쓰는 환경 — 새로고침하면 로그아웃된다 */
  }
}

/** 서버 오류: {"detail": {"code", "message"}} 또는 FastAPI 검증 오류(422) */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

type Options = { method?: string; json?: unknown; form?: FormData; signal?: AbortSignal };

const FIELD_NAMES: Record<string, string> = {
  email: "이메일",
  password: "비밀번호",
  nickname: "닉네임",
};

function messageFrom(status: number, body: unknown): { code: string; message: string } {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail) && "message" in detail) {
    const d = detail as { code?: string; message: string };
    return { code: d.code ?? "error", message: d.message };
  }
  if (Array.isArray(detail) && detail.length) {
    // 422 검증 오류: 첫 항목을 한국어로 보여 준다
    const first = detail[0] as { loc?: string[]; msg?: string };
    const field = first.loc?.[first.loc.length - 1] ?? "";
    const label = FIELD_NAMES[field] ?? field;
    const raw = (first.msg ?? "").replace(/^Value error, /, "");
    if (field === "email") return { code: "invalid", message: "이메일 형식을 확인해 주세요." };
    if (field === "password" && /at least/.test(raw))
      return { code: "invalid", message: "비밀번호는 8자 이상이에요." };
    return { code: "invalid", message: label ? `${label}: ${raw}` : raw || "입력값을 확인해 주세요." };
  }
  if (status >= 500) return { code: "server", message: "서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요." };
  return { code: "error", message: `요청을 처리하지 못했어요 (${status})` };
}

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json);
  } else if (opts.form) {
    body = opts.form;
  }

  let res: Response;
  try {
    res = await fetch(path, { method: opts.method ?? (body ? "POST" : "GET"), headers, body, signal: opts.signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "network", "서버에 연결할 수 없어요. 백엔드가 켜져 있는지 확인해 주세요.");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const { code, message } = messageFrom(res.status, data);
    throw new ApiError(res.status, code, message);
  }
  return data as T;
}

export type Health = {
  status: "ok";
  app: string;
  version: string;
  env: string;
  database: "ok" | "unavailable";
};

export const getHealth = (signal?: AbortSignal) => api<Health>("/api/health", { signal });
