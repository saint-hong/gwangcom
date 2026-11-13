import clsx from "clsx";
import { ChevronDown, Plus } from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { Pagination } from "../../components/common/Pagination";
import { useToast } from "../../components/feedback/Toast";
import { Avatar, Button, ButtonLink } from "../../design-system";
import type { AdminItems, AdminPrompt, AdminPrompts, Answerer, PromptStatus } from "../../types/api";
import styles from "./Admin.module.css";
import { shortDate } from "./adminFormat";
import { SortHeader, type Sort, type SortOption } from "./SortHeader";

const STATUS: { value: "all" | PromptStatus; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "open", label: "진행" },
  { value: "scheduled", label: "예정" },
  { value: "ended", label: "종료" },
  { value: "off", label: "꺼짐" },
];
// 상태 칸 = 기간만 본 상태 (켜짐 · 꺼짐은 설정 칸, 2026-11-13 사용자 요청)
const PHASE_LABEL: Record<AdminPrompt["phase"], string> = { open: "진행", scheduled: "예정", ended: "종료" };

const up = (key: string, asc: string, desc: string): SortOption[] => [
  { key, order: "asc", label: asc },
  { key, order: "desc", label: desc },
];
const SORTS: Record<string, SortOption[]> = {
  id: up("id", "번호 작은 순", "번호 큰 순"),
  title: up("title", "질문 가나다순", "질문 역순"),
  starts: [
    { key: "starts", order: "desc", label: "시작 늦은 순" },
    { key: "starts", order: "asc", label: "시작 이른 순" },
    { key: "ends", order: "asc", label: "끝 이른 순" },
    { key: "ends", order: "desc", label: "끝 늦은 순" },
  ],
  answers: [
    { key: "answers", order: "desc", label: "답한 상상 많은 순" },
    { key: "answers", order: "asc", label: "답한 상상 적은 순" },
  ],
  answerers: [
    { key: "answerers", order: "desc", label: "답한 사용자 많은 순" },
    { key: "answerers", order: "asc", label: "답한 사용자 적은 순" },
  ],
  created: up("created", "오래된 순", "최근 만든 순"),
  status: up("status", "진행 → 종료 순", "종료 → 진행 순"),
  active: [
    { key: "active", order: "desc", label: "켜짐 먼저" },
    { key: "active", order: "asc", label: "꺼짐 먼저" },
  ],
};

/** datetime-local 입력값 ↔ ISO (브라우저 시간대 = 한국 시간 기준으로 쓴다) */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const fromLocalInput = (v: string): string | null => (v ? new Date(v).toISOString() : null);

type Draft = { title: string; body: string; starts: string; ends: string };
const emptyDraft = (): Draft => {
  const now = new Date();
  const week = new Date(now.getTime() + 7 * 86_400_000);
  return { title: "", body: "", starts: toLocalInput(now.toISOString()), ends: toLocalInput(week.toISOString()) };
};

/**
 * A3 이번 주 질문 관리 (Sprint 6-C, 기획안 v11 F13) — A4 · A5 와 같은 표 · 정렬 · 토글 · 펼치기 · 페이지 번호
 *   [전체 · 진행 중 · 예정 · 끝 · 꺼짐] · 찾기 · [+ 새 질문] → 표
 *   줄: 번호 · 질문(누르면 펼침: 고치기 · 답한 사용자 · 답한 상상 · 지우기) · 기간 · 답한 상상 · 답한 사용자 · 만든 사람 · 상태(진행 · 종료 뱃지) · 설정(켜짐 · 꺼짐)
 *   (2026-11-13) 답한 사용자 칸 · 펼친 줄에 답한 사용자(반응 많은 순). 질문별 관리 화면 · 보상은 추후 고도화
 *   지금 질문 = 켜져 있고 기간 안인 것 중 가장 늦게 시작한 것 → 오른쪽 컬럼 · 홈 배너 · 글쓰기 질문 카드
 */
export function AdminPromptsPage() {
  const toast = useToast();
  const [status, setStatus] = useState<"all" | PromptStatus>("all");
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>({ key: "starts", order: "desc" });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [data, setData] = useState<AdminPrompts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);
  useEffect(() => setPage(1), [status, q, sort, size]);

  const load = useCallback(() => {
    const params = new URLSearchParams({ status, sort: sort.key, order: sort.order, page: String(page), size: String(size), ...(q ? { q } : {}) });
    const ctrl = new AbortController();
    setError(null);
    api<AdminPrompts>(`/api/admin/prompts?${params}`, { signal: ctrl.signal })
      .then(setData)
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e instanceof ApiError ? e.message : "목록을 불러오지 못했어요.");
      });
    return () => ctrl.abort();
  }, [status, q, sort, page, size]);
  useEffect(load, [load]);

  const act = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast.show(done);
      load();
      return true;
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "저장하지 못했어요.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const create = () =>
    act(
      () =>
        api("/api/admin/prompts", {
          method: "POST",
          json: { title: draft.title.trim(), body: draft.body.trim() || null, starts_at: fromLocalInput(draft.starts), ends_at: fromLocalInput(draft.ends) },
        }),
      "질문을 만들었어요.",
    ).then((ok) => {
      if (ok) {
        setCreating(false);
        setDraft(emptyDraft());
      }
    });

  return (
    <div>
      <div className={styles.toolbar}>
        <div className={styles.seg} role="group" aria-label="상태">
          {STATUS.map((s) => (
            <button key={s.value} type="button" aria-pressed={status === s.value} onClick={() => setStatus(s.value)}>
              {s.label}
            </button>
          ))}
        </div>
        <input className={styles.search} value={text} onChange={(e) => setText(e.target.value)} placeholder="질문 · 설명으로 찾기" aria-label="찾기" />
        <Button size="sm" onClick={() => setCreating((v) => !v)} aria-expanded={creating}>
          <Plus aria-hidden="true" className={styles.btnIcon} /> 새 질문
        </Button>
      </div>

      {creating ? (
        <section className={styles.formBox} aria-label="새 질문">
          <PromptForm draft={draft} onChange={setDraft} />
          <div className={styles.actions}>
            <Button size="sm" variant="outline" onClick={() => setCreating(false)} disabled={busy}>
              취소
            </Button>
            <Button size="sm" onClick={() => void create()} disabled={busy || !draft.title.trim() || !draft.starts}>
              만들기
            </Button>
          </div>
        </section>
      ) : null}

      <div className={styles.tableWrap}>
        <table className={clsx(styles.table, styles.centerAll)}>
          <colgroup>
            <col className={styles.cId} />
            <col />
            <col className={styles.cPeriod} />
            <col className={styles.cCount} />
            <col className={styles.cPeople} />
            <col className={styles.cAuthor} />
            <col className={styles.cPhase} />
            <col className={styles.cSetting} />
          </colgroup>
          <thead>
            <tr>
              <th>
                <SortHeader label="번호" options={SORTS.id} value={sort} onChange={setSort} />
              </th>
              <th>
                <SortHeader label="질문" options={SORTS.title} value={sort} onChange={setSort} />
              </th>
              <th>
                <SortHeader label="기간" options={SORTS.starts} value={sort} onChange={setSort} />
              </th>
              <th>
                <SortHeader label="답한 상상" options={SORTS.answers} value={sort} onChange={setSort} />
              </th>
              <th>
                <SortHeader label="답한 사용자" options={SORTS.answerers} value={sort} onChange={setSort} />
              </th>
              <th>
                <SortHeader label="만든 사람" options={SORTS.created} value={sort} onChange={setSort} />
              </th>
              <th>
                <SortHeader label="상태" options={SORTS.status} value={sort} onChange={setSort} />
              </th>
              <th>
                <SortHeader label="설정" options={SORTS.active} value={sort} onChange={setSort} alignRight />
              </th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((p) => {
              const isOpen = open === p.id;
              return (
                <Fragment key={p.id}>
                  <tr className={clsx(!p.is_active && styles.rowHidden, isOpen && styles.rowOpen)}>
                    <td className={styles.muted}>{p.id}</td>
                    <td className={styles.content}>
                      <button type="button" className={styles.contentToggle} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : p.id)}>
                        <span className={styles.contentTitle}>{p.title}</span>
                        {p.body ? <span className={styles.contentBodyOne}>{p.body}</span> : null}
                        <ChevronDown className={styles.chevron} aria-hidden="true" />
                      </button>
                    </td>
                    <td className={styles.muted}>
                      <span className={styles.periodLine}>{shortDate(p.starts_at)}</span>
                      <span className={styles.periodLine}>~ {p.ends_at ? shortDate(p.ends_at) : "끝 없음"}</span>
                    </td>
                    <td>{p.answer_count}</td>
                    <td>{p.answerer_count}명</td>
                    <td title={p.created_by ?? undefined}>{p.created_by ?? "—"}</td>
                    <td>
                      <span className={clsx(styles.promptState, styles[`ps_${p.phase}`])}>{PHASE_LABEL[p.phase]}</span>
                    </td>
                    <td>
                      <div className={styles.stateToggle} role="group" aria-label={`${p.id}번 켜기 · 끄기`}>
                        {[true, false].map((on) => (
                          <button
                            key={String(on)}
                            type="button"
                            aria-pressed={p.is_active === on}
                            className={clsx(!on && styles.hideBtn)}
                            disabled={busy || p.is_active === on}
                            onClick={() =>
                              void act(
                                () => api(`/api/admin/prompts/${p.id}`, { method: "PATCH", json: { is_active: on } }),
                                on ? "질문을 켰어요." : "질문을 껐어요. 사용자 화면에서 빠져요.",
                              )
                            }
                          >
                            {on ? "켜짐" : "꺼짐"}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr className={styles.detailRow}>
                      <td colSpan={8}>
                        <PromptDetail prompt={p} busy={busy} act={act} onDeleted={() => setOpen(null)} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
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
        <p className={styles.status}>{status === "all" && !q ? "아직 질문이 없어요. [새 질문]으로 첫 질문을 올려 보세요." : "조건에 맞는 질문이 없어요."}</p>
      ) : (
        <Pagination
          page={data.page}
          total={data.total}
          size={data.size}
          onPage={(n) => {
            setPage(n);
            window.scrollTo({ top: 0 });
          }}
          onSize={setSize}
        />
      )}
    </div>
  );
}

/** 질문 · 설명 · 시작 · 끝 입력 (새 질문 · 고치기 공통) */
function PromptForm({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  return (
    <div className={styles.formGrid}>
      <label className={styles.formLabel} htmlFor="pf-title">
        질문
      </label>
      <input id="pf-title" className={styles.cellInput} value={draft.title} maxLength={80} placeholder="예) 10년 뒤 학교는 어떤 모습일까요?" onChange={(e) => onChange({ ...draft, title: e.target.value })} />
      <label className={styles.formLabel} htmlFor="pf-body">
        설명
      </label>
      <input id="pf-body" className={styles.cellInput} value={draft.body} maxLength={300} placeholder="질문 아래 한 줄 설명 (선택)" onChange={(e) => onChange({ ...draft, body: e.target.value })} />
      <label className={styles.formLabel} htmlFor="pf-start">
        기간
      </label>
      <div className={styles.periodInputs}>
        <input id="pf-start" type="datetime-local" className={styles.dateInput} value={draft.starts} onChange={(e) => onChange({ ...draft, starts: e.target.value })} aria-label="시작" />
        <span className={styles.muted}>~</span>
        <input type="datetime-local" className={styles.dateInput} value={draft.ends} onChange={(e) => onChange({ ...draft, ends: e.target.value })} aria-label="끝 (비우면 끝 없음)" />
        <span className={styles.muted}>끝을 비우면 끌 때까지 계속</span>
      </div>
    </div>
  );
}

/** 펼친 줄: 고치기 · 이 질문에 답한 상상(최근 5개) · 지우기(답이 없을 때) */
function PromptDetail({
  prompt,
  busy,
  act,
  onDeleted,
}: {
  prompt: AdminPrompt;
  busy: boolean;
  act: (fn: () => Promise<unknown>, done: string) => Promise<boolean>;
  onDeleted: () => void;
}) {
  const [draft, setDraft] = useState<Draft>({
    title: prompt.title,
    body: prompt.body ?? "",
    starts: toLocalInput(prompt.starts_at),
    ends: toLocalInput(prompt.ends_at),
  });
  const [answers, setAnswers] = useState<AdminItems | null>(null);
  const [people, setPeople] = useState<Answerer[] | null>(null);
  useEffect(() => {
    api<AdminItems>(`/api/admin/imaginations?prompt_id=${prompt.id}&size=20`).then(setAnswers, () => setAnswers(null));
    api<Answerer[]>(`/api/admin/prompts/${prompt.id}/answerers`).then(setPeople, () => setPeople([]));
  }, [prompt.id]);

  return (
    <div className={styles.detail}>
      <PromptForm draft={draft} onChange={setDraft} />
      <div className={styles.detailList}>
        <span className={styles.formLabel}>답한 사용자</span>
        <div className={styles.detailChips}>
          {people === null ? (
            <span className={styles.detailEmpty}>불러오는 중…</span>
          ) : people.length === 0 ? (
            <span className={styles.detailEmpty}>아직 없어요</span>
          ) : (
            <>
              {people.slice(0, 10).map((a) => (
                <Link
                  key={a.author.id}
                  to={`/admin/users/${a.author.id}`}
                  className={styles.answererChip}
                  title={`답 ${a.answers}개 · Thunder ${a.thunders} · Wave ${a.waves} · 댓글 ${a.comments}`}
                >
                  <Avatar name={a.author.nickname} src={a.author.avatar_url} size={20} />
                  {a.author.nickname}
                  <span className={styles.muted}>
                    답 {a.answers} · 반응 {a.total}
                  </span>
                </Link>
              ))}
              {people.length > 10 ? <span className={styles.detailEmpty}>외 {people.length - 10}명</span> : null}
            </>
          )}
        </div>
      </div>
      <div className={styles.detailList}>
        <span className={styles.formLabel}>답한 상상</span>
        <div className={styles.detailChips}>
          {answers === null ? (
            <span className={styles.detailEmpty}>불러오는 중…</span>
          ) : answers.total === 0 ? (
            <span className={styles.detailEmpty}>아직 없어요</span>
          ) : (
            <>
              {answers.items.slice(0, 5).map((a) => (
                <Link key={a.id} to={`/i/${a.id}`} className={styles.answerChip} title={a.display_title}>
                  {a.display_title} · {a.author.nickname}
                </Link>
              ))}
              {answers.total > 5 ? <span className={styles.detailEmpty}>외 {answers.total - 5}개</span> : null}
            </>
          )}
        </div>
      </div>
      <div className={styles.detailFoot}>
        <div className={styles.actions}>
          {prompt.answer_count === 0 ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`"${prompt.title}" 질문을 지울까요?`))
                  void act(() => api(`/api/admin/prompts/${prompt.id}`, { method: "DELETE" }), "질문을 지웠어요.").then((ok) => ok && onDeleted());
              }}
            >
              지우기
            </Button>
          ) : null}
          {/* 저장 옆, 같은 크기의 검정 버튼 (2026-11-13 사용자 요청) */}
          {prompt.status === "open" || prompt.status === "ended" ? (
            <ButtonLink to={`/prompts/${prompt.id}`} size="sm" variant="dark">
              사용자 화면에서 보기
            </ButtonLink>
          ) : null}
          <Button
            size="sm"
            disabled={busy || !draft.title.trim() || !draft.starts}
            onClick={() =>
              void act(
                () =>
                  api(`/api/admin/prompts/${prompt.id}`, {
                    method: "PATCH",
                    json: { title: draft.title.trim(), body: draft.body.trim() || null, starts_at: fromLocalInput(draft.starts), ends_at: fromLocalInput(draft.ends) },
                  }),
                "질문을 고쳤어요.",
              )
            }
          >
            저장
          </Button>
        </div>
      </div>
    </div>
  );
}
