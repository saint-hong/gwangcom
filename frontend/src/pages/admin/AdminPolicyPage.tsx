import { Fragment, useEffect, useState } from "react";
import { api, ApiError } from "../../api/client";
import { useToast } from "../../components/feedback/Toast";
import { Button } from "../../design-system";
import type { PolicyKey, PolicyValue, PolicyView, Tier } from "../../types/api";
import styles from "./Admin.module.css";
import { logTarget, shortDate, showValue } from "./adminFormat";
import { PolicyInput } from "./PolicyInput";

/**
 * A6 기본 정책 (Sprint 6-B, 기획안 v11 F20)
 *   ① 한도 · 권한 표: 항목 | 전체 기본값 | 등급마다 값 (비우면 전체 기본값을 따름 — 흐린 글씨로 따르는 값)
 *   ② 등급: 이름 · 설명 · 사용자 수 · 기본 등급 · [기본으로] [지우기] + 새 등급 추가
 *   ③ 최근 변경 기록 (전체 · 등급)
 *   적용 순서: 개인 예외(A5) → 등급 → 전체 기본값. 값을 바꾸면 바로 저장된다 (Enter · 칸 벗어나기 · 토글).
 */
export function AdminPolicyPage() {
  const toast = useToast();
  const [data, setData] = useState<PolicyView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  useEffect(() => {
    api<PolicyView>("/api/admin/policy").then(setData, (e) =>
      setError(e instanceof ApiError ? e.message : "불러오지 못했어요."),
    );
  }, []);

  const send = async (path: string, method: string, json?: unknown, done?: string) => {
    setBusy(true);
    try {
      setData(await api<PolicyView>(path, { method, json }));
      if (done) toast.show(done);
      return true;
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "저장하지 못했어요.");
      // 화면 값을 서버 값으로 되돌린다
      api<PolicyView>("/api/admin/policy").then(setData, () => undefined);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = (key: string, tier: Tier | null, value: PolicyValue | null) =>
    void send(
      "/api/admin/policy",
      "PUT",
      { scope: tier ? "tier" : "global", tier_id: tier?.id ?? null, key, value },
      "저장했어요. 다음 요청부터 바로 적용돼요.",
    );

  if (error) return <p className={styles.status}>{error}</p>;
  if (!data) return <p className={styles.status}>불러오는 중…</p>;

  const groups: [string, PolicyKey[]][] = [];
  for (const k of data.keys) {
    const g = groups.find(([name]) => name === k.group);
    if (g) g[1].push(k);
    else groups.push([k.group, [k]]);
  }
  const specOf = (key: string) => data.keys.find((k) => k.key === key);

  return (
    <div>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>한도 · 권한</h2>
        <p className={styles.sectionHint}>
          적용 순서: 개인 예외(사용자 탭) → 등급 → 전체 기본값. 등급 칸을 비우면 전체 기본값을 따라요.
        </p>
        <div className={styles.tableWrap}>
          <table className={`${styles.table} ${styles.centerAll}`}>
            <colgroup>
              <col className={styles.cLabel} />
              <col />
              {data.tiers.map((t) => (
                <col key={t.id} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th>항목</th>
                <th>전체 기본값</th>
                {data.tiers.map((t) => (
                  <th key={t.id}>
                    {t.name}
                    {t.is_default ? <span className={styles.badge}>기본</span> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map(([group, keys]) => (
                <Fragment key={group}>
                  <tr className={styles.groupRow}>
                    <td colSpan={2 + data.tiers.length}>{group}</td>
                  </tr>
                  {keys.map((k) => {
                    const g = data.global_values[k.key];
                    return (
                      <tr key={k.key}>
                        <td title={k.label}>
                          {k.label}
                          {k.kind === "int" ? (
                            <span className={styles.range}>
                              {k.min}~{k.max}
                              {k.unit}
                            </span>
                          ) : null}
                        </td>
                        <td className={styles.center}>
                          <PolicyInput spec={k} value={g} onSave={(v) => save(k.key, null, v)} disabled={busy} />
                        </td>
                        {data.tiers.map((t) => {
                          const tv = data.tier_values[String(t.id)]?.[k.key];
                          return (
                            <td key={t.id} className={styles.center}>
                              <PolicyInput
                                spec={k}
                                value={tv ?? null}
                                allowEmpty
                                placeholder={g}
                                onSave={(v) => save(k.key, t, v)}
                                disabled={busy}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>등급</h2>
        <table className={styles.table}>
          <colgroup>
            <col className={styles.cTierName} />
            <col />
            <col className={styles.cCount} />
            <col className={styles.cTierAction} />
          </colgroup>
          <thead>
            <tr>
              <th>이름</th>
              <th>설명</th>
              <th>사용자</th>
              <th aria-label="관리" />
            </tr>
          </thead>
          <tbody>
            {data.tiers.map((t) => (
              <tr key={t.id}>
                <td>
                  {t.name}
                  {t.is_default ? <span className={styles.badge}>기본</span> : null}
                </td>
                <td className={styles.muted}>{t.description ?? "—"}</td>
                <td className={styles.center}>{t.user_count}명</td>
                <td>
                  {t.is_default ? null : (
                    <div className={styles.actions}>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void send(`/api/admin/tiers/${t.id}`, "PATCH", { is_default: true }, `${t.name}을(를) 기본 등급으로 정했어요.`)}
                      >
                        기본으로
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(`"${t.name}" 등급을 지울까요? 이 등급의 사용자 ${t.user_count}명은 기본 등급이 돼요.`))
                            void send(`/api/admin/tiers/${t.id}`, "DELETE", undefined, "등급을 지웠어요.");
                        }}
                      >
                        지우기
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            <tr className={styles.addRow}>
              <td>
                <input className={styles.cellInput} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="새 등급 이름" aria-label="새 등급 이름" />
              </td>
              <td colSpan={2}>
                <input className={styles.cellInput} value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={200} placeholder="설명 (선택)" aria-label="새 등급 설명" />
              </td>
              <td>
                <div className={styles.actions}>
                <Button
                  size="sm"
                  disabled={busy || !name.trim()}
                  onClick={async () => {
                    if (await send("/api/admin/tiers", "POST", { name: name.trim(), description: desc.trim() || null }, "등급을 만들었어요.")) {
                      setName("");
                      setDesc("");
                    }
                  }}
                >
                  추가
                </Button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>최근 변경 기록</h2>
        {data.logs.length === 0 ? (
          <p className={styles.sectionHint}>아직 바꾼 기록이 없어요.</p>
        ) : (
          <LogTable logs={data.logs} specOf={specOf} />
        )}
      </section>
    </div>
  );
}

/** 변경 기록 표 (A5 · A6 공통) */
export function LogTable({ logs, specOf }: { logs: PolicyView["logs"]; specOf: (key: string) => PolicyKey | undefined }) {
  return (
    <table className={styles.table}>
      <colgroup>
        <col className={styles.cDate} />
        <col className={styles.cAuthor} />
        <col className={styles.cTarget} />
        <col />
        <col />
      </colgroup>
      <thead>
        <tr>
          <th>시각</th>
          <th>운영자</th>
          <th>대상</th>
          <th>항목</th>
          <th>바뀐 값</th>
        </tr>
      </thead>
      <tbody>
        {logs.map((log) => {
          const spec = specOf(log.key);
          return (
            <tr key={log.id}>
              <td className={styles.muted}>{shortDate(log.at)}</td>
              <td className={styles.ellipsis}>{log.admin ?? "—"}</td>
              <td className={styles.ellipsis}>{logTarget(log)}</td>
              <td>{log.label}</td>
              <td>
                <span className={styles.muted}>{showValue(spec, log.old_value)}</span> → <b>{showValue(spec, log.new_value)}</b>
                {log.expires_at ? <span className={styles.muted}> (만료 {shortDate(log.expires_at)})</span> : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
