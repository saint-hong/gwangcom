import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { Pagination } from "../../components/common/Pagination";
import { SelectMenu } from "../../components/common/SelectMenu";
import { Avatar, Button } from "../../design-system";
import type { AdminUsers, PolicyView } from "../../types/api";
import styles from "./Admin.module.css";
import { ROLE_LABEL, shortDate } from "./adminFormat";
import { SortHeader, type Sort, type SortOption } from "./SortHeader";

const up = (key: string, asc: string, desc: string): SortOption[] => [
  { key, order: "asc", label: asc },
  { key, order: "desc", label: desc },
];
const SORTS: Record<string, SortOption[]> = {
  id: up("id", "번호 작은 순", "번호 큰 순"),
  nickname: up("nickname", "닉네임 가나다순", "닉네임 역순"),
  email: up("email", "이메일 가나다순", "이메일 역순"),
  role: up("role", "운영자 먼저", "Dreamer 먼저"),
  tier: up("tier", "등급 가나다순", "등급 역순"),
  posts: [
    { key: "posts", order: "desc", label: "상상 많은 순" },
    { key: "posts", order: "asc", label: "상상 적은 순" },
  ],
  created: [
    { key: "created", order: "desc", label: "최근 가입순" },
    { key: "created", order: "asc", label: "오래된 가입순" },
  ],
};
const COLUMNS = [
  ["번호", "id"],
  ["닉네임", "nickname"],
  ["이메일", "email"],
  ["역할", "role"],
  ["등급", "tier"],
  ["상상", "posts"],
  ["가입일", "created"],
] as const;

/**
 * A5 사용자 관리 목록 (Sprint 6-B, 기획안 v11 F20) — 게시물 탭(A4)과 같은 표 · 정렬 · 작은 메뉴 · 페이지 번호
 *   닉네임 · 이메일 찾기 · [역할 ▾] · [등급 ▾] → 표 → 줄을 누르면 사용자 상세(/admin/users/:id)
 *   "예외" = 지금 적용 중인 개인 예외 수
 */
export function AdminUsersPage() {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [role, setRole] = useState<"all" | "user" | "admin">("all");
  const [tier, setTier] = useState<number | "all">("all");
  const [tiers, setTiers] = useState<PolicyView["tiers"]>([]);
  const [sort, setSort] = useState<Sort>({ key: "created", order: "desc" });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [data, setData] = useState<AdminUsers | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);
  useEffect(() => {
    api<PolicyView>("/api/admin/policy").then((d) => setTiers(d.tiers), () => undefined);
  }, []);
  useEffect(() => setPage(1), [q, role, tier, sort, size]);

  const load = useCallback(() => {
    const params = new URLSearchParams({
      role,
      page: String(page),
      size: String(size),
      sort: sort.key,
      order: sort.order,
      ...(q ? { q } : {}),
      ...(tier === "all" ? {} : { tier_id: String(tier) }),
    });
    const ctrl = new AbortController();
    setError(null);
    api<AdminUsers>(`/api/admin/users?${params}`, { signal: ctrl.signal })
      .then(setData)
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e instanceof ApiError ? e.message : "목록을 불러오지 못했어요.");
      });
    return () => ctrl.abort();
  }, [q, role, tier, page, size, sort]);
  useEffect(load, [load]);

  return (
    <div>
      <div className={styles.toolbar}>
        <SelectMenu
          value={role}
          options={[
            { value: "all", label: "모든 역할" },
            { value: "user", label: "Dreamer" },
            { value: "admin", label: "운영자" },
          ]}
          onChange={setRole}
          label="역할"
        />
        <SelectMenu
          value={tier}
          options={[{ value: "all" as const, label: "모든 등급" }, ...tiers.map((t) => ({ value: t.id, label: t.name }))]}
          onChange={setTier}
          label="등급"
        />
        <input className={styles.search} value={text} onChange={(e) => setText(e.target.value)} placeholder="닉네임 · 이메일로 찾기" aria-label="찾기" />
      </div>

      <div className={styles.tableWrap}>
        <table className={`${styles.table} ${styles.centerAll}`}>
          <colgroup>
            <col className={styles.cId} />
            <col />
            <col />
            <col className={styles.cKind} />
            <col className={styles.cTierCol} />
            <col className={styles.cCount} />
            <col className={styles.cCount} />
            <col className={styles.cDate} />
          </colgroup>
          <thead>
            <tr>
              {COLUMNS.slice(0, 6).map(([label, col]) => (
                <th key={col}>
                  <SortHeader label={label} options={SORTS[col]} value={sort} onChange={setSort} />
                </th>
              ))}
              <th>예외</th>
              <th>
                <SortHeader label="가입일" options={SORTS.created} value={sort} onChange={setSort} alignRight />
              </th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((u) => (
              <tr key={u.id} className={styles.linkRow}>
                <td className={styles.muted}>{u.id}</td>
                <td className={styles.ellipsis}>
                  <Link to={`/admin/users/${u.id}`} className={styles.userCell}>
                    <Avatar name={u.nickname} src={u.avatar_url} size={20} />
                    <span className={styles.ellipsis}>{u.nickname}</span>
                  </Link>
                </td>
                <td className={`${styles.ellipsis} ${styles.muted}`} title={u.email}>
                  {u.email}
                </td>
                <td className={styles.center}>
                  <span className={u.role === "admin" ? styles.roleAdmin : styles.kind}>{ROLE_LABEL[u.role]}</span>
                </td>
                <td className={styles.ellipsis}>{u.tier ?? "—"}</td>
                <td className={styles.center}>{u.posts}</td>
                <td className={styles.center}>{u.exceptions ? <b className={styles.accentText}>{u.exceptions}</b> : <span className={styles.muted}>0</span>}</td>
                <td className={styles.muted}>{shortDate(u.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error ? (
        <div className={styles.status}>
          <p>{error}</p>
          <Button size="sm" variant="outline" onClick={load}>
            다시 불러오기
          </Button>
        </div>
      ) : !data ? (
        <p className={styles.status}>불러오는 중…</p>
      ) : data.total === 0 ? (
        <p className={styles.status}>조건에 맞는 사용자가 없어요.</p>
      ) : (
        <Pagination
          page={data.page}
          total={data.total}
          size={data.size}
          onPage={(p) => {
            setPage(p);
            window.scrollTo({ top: 0 });
          }}
          onSize={setSize}
        />
      )}
    </div>
  );
}
