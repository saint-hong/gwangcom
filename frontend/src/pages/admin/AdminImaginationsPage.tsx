import clsx from "clsx";
import { ChevronDown, MessageCircle, Zap } from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { WaveIcon } from "../../components/actions/WaveIcon";
import { Pagination } from "../../components/common/Pagination";
import { SelectMenu } from "../../components/common/SelectMenu";
import { useToast } from "../../components/feedback/Toast";
import { domainsOf, TagList } from "../../components/tags/TagList";
import { Button, ButtonLink, TagPill } from "../../design-system";
import type { AdminItem, AdminItems, Imagination, Kind } from "../../types/api";
import styles from "./Admin.module.css";
import { shortDate } from "./adminFormat";
import { SortHeader, type Sort, type SortOption } from "./SortHeader";

const STATUS = [
  { value: "all", label: "전체" },
  { value: "visible", label: "보이는 글" },
  { value: "hidden", label: "숨긴 글" },
] as const;
const KINDS: { value: "all" | Kind; label: string }[] = [
  { value: "all", label: "모든 종류" },
  { value: "original", label: "원본" },
  { value: "quote", label: "인용" },
  { value: "blend", label: "Shake it" },
  { value: "comment", label: "댓글" },
];
const KIND_LABEL: Record<Kind, string> = { original: "원본", quote: "인용", blend: "Shake it", comment: "댓글" };

/** 칸마다 고를 수 있는 정렬 (서버 sort · order). 기본 = 작성일 최신순 */
const DEFAULT_SORT: Sort = { key: "created", order: "desc" };
const up = (key: string, asc: string, desc: string): SortOption[] => [
  { key, order: "asc", label: asc },
  { key, order: "desc", label: desc },
];
const SORTS: Record<string, SortOption[]> = {
  id: up("id", "번호 작은 순", "번호 큰 순"),
  kind: up("kind", "원본 → 댓글 순", "댓글 → 원본 순"),
  author: up("author", "닉네임 가나다순", "닉네임 역순"),
  content: up("content", "제목 가나다순", "제목 역순"),
  reactions: [
    { key: "thunders", order: "desc", label: "Thunder 많은 순" },
    { key: "thunders", order: "asc", label: "Thunder 적은 순" },
    { key: "waves", order: "desc", label: "Wave 많은 순" },
    { key: "waves", order: "asc", label: "Wave 적은 순" },
    { key: "comments", order: "desc", label: "댓글 많은 순" },
    { key: "comments", order: "asc", label: "댓글 적은 순" },
    { key: "reactions", order: "desc", label: "반응 합계 많은 순" },
    { key: "reactions", order: "asc", label: "반응 합계 적은 순" },
  ],
  created: [
    { key: "created", order: "desc", label: "최신순" },
    { key: "created", order: "asc", label: "오래된 순" },
  ],
  status: up("status", "보임 먼저", "숨김 먼저"),
};

/**
 * A4 게시물 관리 (Sprint 6-A, 기획안 v11 F19)
 *   [전체 | 보이는 글 | 숨긴 글] · 종류 · 찾기(제목 · 본문 · 닉네임) → 표 (기본 최신순)
 *   칸 이름 옆 정렬 아이콘 → 그 칸의 정렬 메뉴 (반응: Thunder · Wave · 댓글 · 합계 많은/적은 순, 작성일: 최신/오래된 순,
 *   그 밖: 오름/내림차순을 칸에 맞는 말로). 한 번에 정렬 하나 (2026-11-12 사용자 요청)
 *   아래 페이지 번호 + 한 페이지 [20 · 50 · 100개씩] (2026-11-12 사용자 요청, 처음 20개)
 *   표는 본문 폭 안에 맞춘다 (칸 폭 고정, 길면 말줄임 — 2026-11-12 화면이 넘친 문제)
 *   줄: 번호 · 종류 · 작성자 · 내용 · 반응 · 작성일 · 상태 [보임 | 숨김](+ 마지막 숨김 기록)
 *   내용을 누르면 상세 화면으로 가지 않고 그 줄 아래가 펼쳐진다: 분야 · 주제 · 왜 원하나요 · 본문 · Shake it 재료 · [상세 보기]
 *   (2026-11-12 사용자 요청. 펼친 내용은 조회 기록을 남기지 않는 /api/admin/imaginations/{id} 로 불러온다)
 *   숨길 때 메모(작성자에게 안 보임)를 남길 수 있다. 숨긴 글은 피드 · 목록 · 집계에서 빠진다.
 */
export function AdminImaginationsPage() {
  const toast = useToast();
  const [status, setStatus] = useState<(typeof STATUS)[number]["value"]>("all");
  const [kind, setKind] = useState<"all" | Kind>("all");
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Record<number, AdminItem>>({}); // 숨김 · 되돌림 뒤 바뀐 줄
  const [asking, setAsking] = useState<number | null>(null); // 메모를 받는 중인 줄
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<number | null>(null); // 펼친 줄
  const [details, setDetails] = useState<Record<number, Imagination>>({}); // 펼친 줄의 자세한 내용 (한 번 불러오면 둔다)
  const addDetail = useCallback((d: Imagination) => setDetails((p) => ({ ...p, [d.id]: d })), []);

  // 찾기는 입력이 멈추고 0.3초 뒤에
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);

  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  const [data, setData] = useState<AdminItems | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setPage(1), [status, kind, q, size, sort]); // 조건이 바뀌면 1페이지로

  const load = useCallback(() => {
    const params = new URLSearchParams({
      status,
      kind,
      page: String(page),
      size: String(size),
      sort: sort.key,
      order: sort.order,
      ...(q ? { q } : {}),
    });
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    api<AdminItems>(`/api/admin/imaginations?${params}`, { signal: ctrl.signal })
      .then((d) => {
        setData(d);
        setRows({});
        setOpen(null);
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e instanceof ApiError ? e.message : "목록을 불러오지 못했어요.");
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [status, kind, q, page, size, sort]);
  useEffect(load, [load]);

  const change = async (item: AdminItem, next: "hidden" | "visible") => {
    setBusy(true);
    try {
      const row = await api<AdminItem>(`/api/admin/imaginations/${item.id}`, {
        method: "PATCH",
        json: { status: next, reason: next === "hidden" ? reason : null },
      });
      setRows((prev) => ({ ...prev, [row.id]: row }));
      setDetails((prev) => {
        const { [row.id]: _drop, ...rest } = prev; // 숨김 여부가 바뀌었으니 다시 불러오게
        return rest;
      });
      setAsking(null);
      setReason("");
      toast.show(next === "hidden" ? "숨겼어요. 피드와 목록에서 빠져요." : "다시 보이게 했어요.");
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "바꾸지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

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
        <SelectMenu value={kind} options={KINDS} onChange={setKind} label="종류" />
        <input
          className={styles.search}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="제목 · 본문 · 닉네임으로 찾기"
          aria-label="찾기"
        />
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <colgroup>
            <col className={styles.cId} />
            <col className={styles.cKind} />
            <col className={styles.cAuthor} />
            <col />
            <col className={styles.cCounts} />
            <col className={styles.cDate} />
            <col className={styles.cStatus} />
          </colgroup>
          <thead>
            <tr>
              {(
                [
                  ["번호", "id"],
                  ["종류", "kind"],
                  ["작성자", "author"],
                  ["내용", "content"],
                  ["반응", "reactions"],
                  ["작성일", "created"],
                  ["상태", "status"],
                ] as const
              ).map(([label, col]) => (
                <th key={col} aria-sort={SORTS[col].some((o) => o.key === sort.key) ? (sort.order === "asc" ? "ascending" : "descending") : undefined}>
                  <SortHeader label={label} options={SORTS[col]} value={sort} onChange={setSort} alignRight={col === "status"} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((base) => {
              const item = rows[base.id] ?? base;
              const hidden = item.status === "hidden";
              const isOpen = open === item.id;
              const log = item.last_moderation;
              const short = item.kind === "comment" || item.kind === "quote";
              return (
                <Fragment key={item.id}>
                  <tr className={clsx(hidden && styles.rowHidden, isOpen && styles.rowOpen)}>
                    <td className={styles.muted}>{item.id}</td>
                    <td>
                      <span className={styles.kind}>{KIND_LABEL[item.kind]}</span>
                    </td>
                    <td className={styles.ellipsis}>
                      <Link to={`/@${item.author.nickname}`} title={item.author.nickname}>
                        {item.author.nickname}
                      </Link>
                    </td>
                    <td className={styles.content}>
                      <button
                        type="button"
                        className={styles.contentToggle}
                        aria-expanded={isOpen}
                        onClick={() => setOpen(isOpen ? null : item.id)}
                      >
                        <span className={styles.contentTitle}>
                          {short ? item.body.split("\n")[0] : item.display_title}
                        </span>
                        {short ? null : <span className={styles.contentBody}>{item.body}</span>}
                        <ChevronDown className={styles.chevron} aria-hidden="true" />
                      </button>
                    </td>
                    <td className={styles.muted}>
                      <span className={styles.counts}>
                        <span aria-label={`Thunder ${item.counts.thunders}`}>
                          <Zap aria-hidden="true" />
                          {item.counts.thunders}
                        </span>
                        <span aria-label={`Wave ${item.counts.waves}`}>
                          <WaveIcon aria-hidden="true" />
                          {item.counts.waves}
                        </span>
                        <span aria-label={`댓글 ${item.counts.comments}`}>
                          <MessageCircle aria-hidden="true" />
                          {item.counts.comments}
                        </span>
                      </span>
                    </td>
                    <td className={styles.muted}>{shortDate(item.created_at)}</td>
                    <td>
                      {/* 상태 = [보임 | 숨김] 토글. 지금 상태가 채워지고, 다른 쪽을 누르면 바뀐다 (2026-11-12 사용자) */}
                      <div className={styles.stateToggle} role="group" aria-label={`${item.id}번 상태`}>
                        <button
                          type="button"
                          aria-pressed={!hidden}
                          disabled={busy || !hidden}
                          onClick={() => void change(item, "visible")}
                        >
                          보임
                        </button>
                        <button
                          type="button"
                          aria-pressed={hidden}
                          className={styles.hideBtn}
                          disabled={busy || hidden}
                          onClick={() => {
                            setReason("");
                            setAsking(asking === item.id ? null : item.id);
                          }}
                        >
                          숨김
                        </button>
                      </div>
                      {log ? (
                        <p className={styles.modNote} title={log.reason ?? undefined}>
                          {log.action === "hide" ? "숨김" : "되돌림"} · {log.admin ?? "?"}
                          {log.reason ? ` · ${log.reason}` : ""}
                        </p>
                      ) : null}
                    </td>
                  </tr>
                  {asking === item.id ? (
                    <tr className={styles.reasonRow}>
                      <td colSpan={7}>
                        <div className={styles.reasonBox}>
                          <input
                            className={styles.reasonInput}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            maxLength={200}
                            placeholder="숨기는 이유 메모 (선택, 작성자에게 안 보여요)"
                            aria-label="숨기는 이유 메모"
                            autoFocus
                          />
                          <Button size="sm" onClick={() => void change(item, "hidden")} disabled={busy}>
                            숨기기
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setAsking(null)} disabled={busy}>
                            취소
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                  {isOpen ? (
                    <tr className={styles.detailRow}>
                      <td colSpan={7}>
                        <RowDetail id={item.id} cache={details} onLoad={addDetail} />
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
      ) : !data && loading ? (
        <p className={styles.status}>불러오는 중…</p>
      ) : data && data.total === 0 ? (
        <p className={styles.status}>조건에 맞는 글이 없어요.</p>
      ) : null}
      {data && data.total > 0 ? (
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
      ) : null}
    </div>
  );
}

/** 펼친 줄: 분야 · 주제 · 왜 원하나요 · 본문 · (혼합) Shake it 재료 · (인용) 원본 · [상세 보기] */
function RowDetail({
  id,
  cache,
  onLoad,
}: {
  id: number;
  cache: Record<number, Imagination>;
  onLoad: (d: Imagination) => void;
}) {
  const item = cache[id];
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (item) return;
    api<Imagination>(`/api/admin/imaginations/${id}`).then(onLoad, (e) =>
      setError(e instanceof ApiError ? e.message : "불러오지 못했어요."),
    );
  }, [id, item, onLoad]);

  if (error) return <p className={styles.detailEmpty}>{error}</p>;
  if (!item) return <p className={styles.detailEmpty}>불러오는 중…</p>;
  const href = item.kind === "comment" && item.root_id ? `/i/${item.root_id}#c${item.id}` : `/i/${item.id}`;
  const none = <span className={styles.detailEmpty}>없음</span>;
  return (
    <div className={styles.detail}>
      <dl className={styles.detailList}>
        <dt>분야</dt>
        <dd>
          <TagList tags={[]} domains={domainsOf(item)} />
        </dd>
        {item.kind === "comment" ? null : (
          <>
            <dt>주제</dt>
            <dd>{item.tags.length ? <TagList tags={item.tags} /> : none}</dd>
            <dt>왜 원하나요</dt>
            <dd>{item.desire ? item.desire : none}</dd>
          </>
        )}
        <dt>본문</dt>
        <dd className={styles.detailBody}>{item.body}</dd>
        {item.kind === "blend" ? (
          <>
            <dt>Shake it 재료</dt>
            <dd className={styles.detailChips}>
              {(item.sources ?? []).map((s, i) =>
                s.deleted || s.id === null ? (
                  <TagPill key={i} variant="neutral">
                    삭제된 상상
                  </TagPill>
                ) : (
                  <TagPill key={i} variant="neutral" to={`/i/${s.id}`}>
                    {s.display_title}
                  </TagPill>
                ),
              )}
            </dd>
          </>
        ) : null}
        {item.kind === "quote" ? (
          <>
            <dt>인용한 원본</dt>
            <dd>
              {item.quoted && !item.quoted.deleted && item.quoted.id ? (
                <Link to={`/i/${item.quoted.id}`}>{item.quoted.display_title}</Link>
              ) : (
                <span className={styles.detailEmpty}>삭제된 상상</span>
              )}
            </dd>
          </>
        ) : null}
      </dl>
      <div className={styles.detailFoot}>
        <ButtonLink size="sm" variant="outline" to={href}>
          상세 보기
        </ButtonLink>
      </div>
    </div>
  );
}
