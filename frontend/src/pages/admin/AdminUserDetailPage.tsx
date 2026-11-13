import clsx from "clsx";
import { ChevronLeft, Sparkles } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { SelectMenu } from "../../components/common/SelectMenu";
import { useToast } from "../../components/feedback/Toast";
import { Avatar } from "../../design-system";
import { useAuth } from "../../hooks/useAuth";
import type { AdminUserDetail, LimitRow, PolicyKey, PolicyValue, UserSummary } from "../../types/api";
import styles from "./Admin.module.css";
import { shortDate, showValue } from "./adminFormat";
import { ChangeLogSection } from "./ChangeLogSection";
import { PolicyInput } from "./PolicyInput";

const SOURCE_LABEL: Record<LimitRow["source"], string> = {
  user: "개인 예외",
  tier: "등급",
  global: "전체 기본값",
  default: "전체 기본값",
};

/**
 * A5 사용자 상세 (Sprint 6-B, 기획안 v11 F20)
 *   ← 사용자 목록 / 프로필 줄(아바타 · 닉네임 · 이메일 · 가입일) + 역할 [Dreamer | 운영자] · 등급 [▾]
 *   활동 요약 6칸 + "AI가 분석했어요"(옅은 파랑, /summary) / 지금 적용되는 한도 표(값 · 어디서 왔는지 · 개인 예외 값 · 만료일 · [해제]) / 변경 기록
 *   완료 기준: 개인 예외로 Shake 하루 20회 → 그 사용자 화면(Shake 남은 횟수)에 바로 반영
 */
export function AdminUserDetailPage() {
  const { id = "" } = useParams();
  const { user: me } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expires, setExpires] = useState<Record<string, string>>({}); // key → yyyy-mm-dd (예외 만료일 입력)

  const [summary, setSummary] = useState<UserSummary | null>(null);
  useEffect(() => {
    // AI 요약은 따로 불러온다 (느려도 나머지 화면은 먼저 보이게)
    setSummary(null);
    api<UserSummary>(`/api/admin/users/${id}/summary`).then(setSummary, () =>
      setSummary({ summary: null, error: "지금은 AI 분석을 불러오지 못했어요.", model: null, at: null }),
    );
  }, [id]);

  useEffect(() => {
    setData(null);
    api<AdminUserDetail>(`/api/admin/users/${id}`).then(setData, (e) =>
      setError(e instanceof ApiError ? e.message : "불러오지 못했어요."),
    );
  }, [id]);

  const send = async (path: string, method: string, json?: unknown, done?: string) => {
    setBusy(true);
    try {
      setData(await api<AdminUserDetail>(path, { method, json }));
      if (done) toast.show(done);
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "저장하지 못했어요.");
      api<AdminUserDetail>(`/api/admin/users/${id}`).then(setData, () => undefined);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p className={styles.status}>{error}</p>;
  if (!data) return <p className={styles.status}>불러오는 중…</p>;

  const { user, activity } = data;
  const specOf = (key: string) => data.keys.find((k) => k.key === key);
  const saveException = (spec: PolicyKey, value: PolicyValue | null) => {
    if (value === null) {
      void send(`/api/admin/users/${user.id}/policy/${spec.key}`, "DELETE", undefined, "개인 예외를 해제했어요.");
      return;
    }
    const day = expires[spec.key];
    // 만료일은 그날 끝(한국 시간 23:59)까지
    const expires_at = day ? new Date(`${day}T23:59:59+09:00`).toISOString() : null;
    void send(`/api/admin/users/${user.id}/policy`, "PUT", { key: spec.key, value, expires_at }, "개인 예외를 저장했어요. 바로 적용돼요.");
  };

  const groups: [string, PolicyKey[]][] = [];
  for (const k of data.keys) {
    const g = groups.find(([name]) => name === k.group);
    if (g) g[1].push(k);
    else groups.push([k.group, [k]]);
  }
  const stats: [string, number][] = [
    ["상상 (원본 · 인용)", activity.posts],
    ["Shake it 으로 만든 글", activity.blends],
    ["댓글", activity.comments],
    ["받은 Thunder", activity.thunders_received],
    ["오늘 올린 상상", activity.posts_today],
    ["오늘 한 Shake", activity.shakes_today],
  ];

  return (
    <div>
      <div className={styles.subBar}>
        <Link to="/admin/users" className={styles.backLink}>
          <ChevronLeft aria-hidden="true" /> 사용자 목록
        </Link>
      </div>

      <section className={styles.profileRow}>
        <Avatar name={user.nickname} src={user.avatar_url} size={48} />
        <div className={styles.profileText}>
          <Link to={`/@${user.nickname}`} className={styles.profileName}>
            {user.nickname}
          </Link>
          <span className={styles.muted}>
            {user.email} · 가입 {shortDate(user.created_at)}
          </span>
        </div>
        <div className={styles.profileControls}>
          <div className={styles.stateToggle} role="group" aria-label="역할">
            {(["user", "admin"] as const).map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={user.role === r}
                disabled={busy || user.role === r || user.id === me?.id}
                onClick={() => {
                  if (r === "admin" && !window.confirm(`${user.nickname}님을 운영자로 바꿀까요? 운영자 화면을 모두 쓸 수 있게 돼요.`)) return;
                  void send(`/api/admin/users/${user.id}`, "PATCH", { role: r }, "역할을 바꿨어요.");
                }}
              >
                {r === "user" ? "Dreamer" : "운영자"}
              </button>
            ))}
          </div>
          <SelectMenu
            value={data.tier_id ?? 0}
            options={data.tiers.map((t) => ({ value: t.id, label: `등급: ${t.name}` }))}
            onChange={(tid) => {
              const t = data.tiers.find((x) => x.id === tid);
              void send(`/api/admin/users/${user.id}`, "PATCH", { tier_id: t?.is_default ? null : tid }, "등급을 바꿨어요.");
            }}
            label="등급"
          />
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>활동 요약</h2>
        <div className={styles.stats}>
          {stats.map(([label, n]) => (
            <div key={label} className={styles.stat}>
              <span className={styles.statNum}>{n.toLocaleString()}</span>
              <span className={styles.statLabel}>{label}</span>
            </div>
          ))}
        </div>
        {/* AI 분석 (2026-11-13): 활동 6칸을 바탕으로 한 설명. 판단은 운영자가 한다 */}
        <div className={styles.aiBox} aria-live="polite">
          <div className={styles.aiHead}>
            <Sparkles aria-hidden="true" />
            <span>AI가 분석했어요.</span>
          </div>
          <p className={clsx(styles.aiText, !summary?.summary && styles.aiMuted)}>
            {summary === null ? "활동을 살펴보는 중…" : summary.summary ?? summary.error}
          </p>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>지금 적용되는 한도 · 권한</h2>
        <p className={styles.sectionHint}>
          개인 예외 칸에 값을 넣으면 이 사용자에게만 적용돼요 (만료일을 비우면 계속). [해제]를 누르면 등급 값을 따라요.
        </p>
        <div className={styles.tableWrap}>
          <table className={`${styles.table} ${styles.centerAll}`}>
            <colgroup>
              <col className={styles.cLabel} />
              <col className={styles.cValue} />
              <col className={styles.cSource} />
              <col />
              <col className={styles.cExpire} />
            </colgroup>
            <thead>
              <tr>
                <th>항목</th>
                <th>지금 값</th>
                <th>어디서</th>
                <th>개인 예외</th>
                <th>만료일</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(([group, keys]) => (
                <Fragment key={group}>
                  <tr className={styles.groupRow}>
                    <td colSpan={5}>{group}</td>
                  </tr>
                  {keys.map((k) => {
                    const row = data.limits.find((l) => l.key === k.key)!;
                    const active = row.exception !== null && !row.exception_expired;
                    return (
                      <tr key={k.key}>
                        <td title={k.label}>{k.label}</td>
                        <td>
                          <b>{showValue(k, row.value)}</b>
                        </td>
                        <td className={styles.center}>
                          <span className={clsx(styles.sourceBadge, row.source === "user" && styles.sourceUser, row.source === "tier" && styles.sourceTier)}>
                            {SOURCE_LABEL[row.source]}
                          </span>
                        </td>
                        <td className={styles.center}>
                          <div className={styles.tierCell}>
                            <PolicyInput
                              spec={k}
                              value={active ? row.exception : null}
                              allowEmpty
                              placeholder={active ? undefined : row.value}
                              onSave={(v) => saveException(k, v)}
                              disabled={busy}
                            />
                            <button
                              type="button"
                              className={styles.textBtn}
                              disabled={busy || !active}
                              title={active ? "개인 예외를 지우고 등급 값을 따르기" : "개인 예외가 없어요"}
                              onClick={() => saveException(k, null)}
                            >
                              해제
                            </button>
                          </div>
                          {row.exception_expired ? <span className={styles.expired}>만료됨</span> : null}
                        </td>
                        <td className={styles.center}>
                          {active && row.exception_expires_at ? (
                            <span className={styles.muted}>{shortDate(row.exception_expires_at)}</span>
                          ) : (
                            <input
                              type="date"
                              className={styles.dateInput}
                              value={expires[k.key] ?? ""}
                              onChange={(e) => setExpires((p) => ({ ...p, [k.key]: e.target.value }))}
                              aria-label={`${k.label} 예외 만료일`}
                              disabled={busy || active}
                              title={active ? "만료일을 바꾸려면 예외를 해제하고 다시 넣어 주세요" : "비우면 만료 없음"}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ChangeLogSection userId={user.id} specOf={specOf} reloadKey={data} />

    </div>
  );
}
