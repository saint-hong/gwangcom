import { Search, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import styles from "./SearchBox.module.css";

export const QUERY_MAX = 50; // 서버 QUERY_MAX 와 같다

/**
 * 검색창 (Sprint 7 홈 검색) — 오른쪽 컬럼 맨 위 · 검색 화면 맨 위가 함께 쓴다.
 *   Enter → /search?q=검색어 (검색 화면에서는 보고 있던 탭을 그대로 둔다). 검색 화면에서는 주소의 검색어를 보여 준다.
 */
export function SearchBox({ autoFocus = false }: { autoFocus?: boolean }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const onSearch = pathname === "/search";
  const current = onSearch ? params.get("q") ?? "" : "";
  const [text, setText] = useState(current);
  const input = useRef<HTMLInputElement>(null);

  // 주소의 검색어가 바뀌면(뒤로 가기 · 다른 검색창에서 검색) 입력칸도 맞춘다
  useEffect(() => setText(current), [current]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const q = text.replace(/\s+/g, " ").trim();
    if (!q) return;
    const tab = onSearch ? params.get("tab") : null;
    navigate(`/search?q=${encodeURIComponent(q)}${tab ? `&tab=${tab}` : ""}`);
    input.current?.blur();
  }

  return (
    <form className={styles.search} role="search" onSubmit={submit}>
      <Search className={styles.icon} aria-hidden="true" strokeWidth={2} />
      <input
        ref={input}
        type="search"
        className={styles.input}
        placeholder="상상 · 주제 · Dreamer 검색"
        aria-label="검색"
        value={text}
        maxLength={QUERY_MAX}
        autoFocus={autoFocus}
        enterKeyHint="search"
        onChange={(e) => setText(e.target.value)}
      />
      {text ? (
        <button
          type="button"
          className={styles.clear}
          aria-label="검색어 지우기"
          onClick={() => {
            setText("");
            input.current?.focus();
          }}
        >
          <X aria-hidden="true" />
        </button>
      ) : null}
    </form>
  );
}
