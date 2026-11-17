import clsx from "clsx";
import { ArrowLeft, ImagePlus, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { useToast } from "../../components/feedback/Toast";
import { NoteBody, noteToc } from "../../components/note/NoteBody";
import { Button } from "../../design-system";
import type { Note } from "../../types/api";
import styles from "./AdminNotes.module.css";
import adminStyles from "./Admin.module.css";

const TEMPLATE = `## 이번에 보인 흐름
어떤 상상과 욕망이 반복됐는지 적어 주세요.

## 대표 상상
- [상상 제목](/i/번호)

## 숨은 욕망

## 현실에서 관측된 시도

## 운영자 해석
`;

type Draft = { title: string; lead: string; body: string; cover: string; summary: string; sources: string };
const EMPTY: Omit<Draft, "body"> = { title: "", lead: "", cover: "", summary: "", sources: "" };
const fromNote = (n: Note): Draft => ({ title: n.title, lead: n.lead ?? "", body: n.body_md, cover: n.cover_url ?? "", summary: n.summary ?? "", sources: n.sources ?? "" });

/**
 * A2 Observe Note 쓰기 · 고치기 (/admin/notes/new · /admin/notes/:id, Sprint 6-E)
 *   제목 · 한 줄 요약 · 대표 이미지 · 본문(Markdown) — [글쓰기 | 미리보기] · [이미지 넣기] = 올린 뒤 커서 자리에 ![캡션](주소)
 *   · AI 요약([AI로 요약 만들기] → 초안을 고쳐서 저장) · 출처(한 줄에 하나)
 *   버튼: 새 노트 [임시 저장] [발행] / 임시 저장 글 [저장] [발행] [지우기] / 발행한 글 [고친 내용 저장] [발행 취소] [지우기]
 *   운영자는 발행한 글도 고치고 지울 수 있다 (2026-11-17 사용자 결정)
 */
export function AdminNoteEditPage() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const toast = useToast();
  const [note, setNote] = useState<Note | null>(null);
  const [draft, setDraft] = useState<Draft>({ ...EMPTY, body: isNew ? TEMPLATE : "" });
  const [saved, setSaved] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [busy, setBusy] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const coverFile = useRef<HTMLInputElement>(null);
  const [summarizing, setSummarizing] = useState(false);

  useEffect(() => {
    if (isNew) return;
    api<Note>(`/api/admin/notes/${id}`).then(
      (n) => {
        setNote(n);
        const d = fromNote(n);
        setDraft(d);
        setSaved(d);
      },
      (e) => setError(e instanceof ApiError ? e.message : "노트를 불러오지 못했어요."),
    );
  }, [id, isNew]);

  const dirty =
    saved === null
      ? !!(draft.title || draft.lead || draft.cover || draft.summary || draft.sources || draft.body !== TEMPLATE)
      : JSON.stringify(draft) !== JSON.stringify(saved);

  const save = async (status?: "draft" | "published", done = "저장했어요.") => {
    if (!draft.title.trim()) {
      toast.show("제목을 적어 주세요.");
      return;
    }
    setBusy(true);
    try {
      const json = {
        title: draft.title.trim(),
        lead: draft.lead.trim() || null,
        body_md: draft.body,
        cover_url: draft.cover || null,
        summary: draft.summary.trim() || null,
        sources: draft.sources.trim() || null,
        ...(status ? { status } : {}),
      };
      const n = isNew
        ? await api<Note>("/api/admin/notes", { method: "POST", json: { ...json, status: status ?? "draft" } })
        : await api<Note>(`/api/admin/notes/${id}`, { method: "PATCH", json });
      setNote(n);
      const d = fromNote(n);
      setDraft(d);
      setSaved(d);
      toast.show(done);
      if (isNew) navigate(`/admin/notes/${n.id}`, { replace: true });
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "저장하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!note || !window.confirm(`"${note.title}" 노트를 지울까요? 지우면 되돌릴 수 없어요.`)) return;
    setBusy(true);
    try {
      await api(`/api/admin/notes/${note.id}`, { method: "DELETE" });
      toast.show("노트를 지웠어요.");
      navigate("/admin/notes");
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "지우지 못했어요.");
      setBusy(false);
    }
  };

  /** 커서 자리에 글 넣기 */
  const insert = (text: string) => {
    const el = area.current;
    const at = el ? el.selectionStart : draft.body.length;
    const end = el ? el.selectionEnd : at;
    const body = draft.body.slice(0, at) + text + draft.body.slice(end);
    setDraft({ ...draft, body });
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(at + text.length, at + text.length);
    });
  };

  /** 이미지 올리기 → 주소 */
  const uploadImage = async (f: File): Promise<string | null> => {
    const form = new FormData();
    form.append("file", f);
    try {
      return (await api<{ url: string }>("/api/admin/notes/images", { form })).url;
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "이미지를 올리지 못했어요.");
      return null;
    }
  };

  const upload = async (f: File) => {
    setBusy(true);
    const url = await uploadImage(f);
    if (url) {
      setTab("write");
      insert(`\n\n![이미지 설명을 적어 주세요](${url})\n\n`);
      toast.show("이미지를 넣었어요. [ ] 안의 글이 이미지 아래 캡션이 돼요.");
    }
    setBusy(false);
    if (file.current) file.current.value = "";
  };

  const uploadCover = async (f: File) => {
    setBusy(true);
    const url = await uploadImage(f);
    if (url) setDraft((d) => ({ ...d, cover: url }));
    setBusy(false);
    if (coverFile.current) coverFile.current.value = "";
  };

  /** AI 요약 초안 → 요약 칸에 넣음 (운영자가 고쳐서 저장). 이미 쓴 요약이 있으면 바꿀지 묻는다 */
  const summarize = async () => {
    if (!draft.title.trim() || !draft.body.trim()) {
      toast.show("제목과 본문을 먼저 써 주세요.");
      return;
    }
    if (draft.summary.trim() && !window.confirm("지금 요약을 AI 초안으로 바꿀까요?")) return;
    setSummarizing(true);
    try {
      const res = await api<{ summary: string | null; error: string | null }>("/api/admin/notes/summary", {
        method: "POST",
        json: { title: draft.title.trim(), lead: draft.lead.trim() || null, body_md: draft.body },
      });
      if (res.summary) {
        setDraft((d) => ({ ...d, summary: res.summary ?? "" }));
        toast.show("AI 요약 초안을 넣었어요. 고친 뒤 저장해 주세요.");
      } else toast.show(res.error ?? "AI 요약을 만들지 못했어요.");
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "AI 요약을 만들지 못했어요.");
    } finally {
      setSummarizing(false);
    }
  };

  if (error) return <p className={adminStyles.status}>{error}</p>;
  if (!isNew && !note) return <p className={adminStyles.status}>불러오는 중…</p>;

  const published = note?.status === "published";
  const toc = noteToc(draft.body);
  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <Link to="/admin/notes" className={styles.back}>
          <ArrowLeft aria-hidden="true" /> 노트 목록
        </Link>
        <span className={clsx(adminStyles.promptState, published && adminStyles.ps_open)}>
          {isNew ? "새 노트" : published ? `발행 · #${note?.number}` : "임시 저장"}
        </span>
        {dirty ? <span className={styles.unsaved}>저장하지 않은 변경</span> : null}
        <div className={styles.headActions}>
          {note ? (
            <Link to={`/notes/${note.id}`} className={styles.viewLink}>
              노트 화면에서 보기
            </Link>
          ) : null}
          {note ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void remove()}>
              지우기
            </Button>
          ) : null}
          {published ? (
            <>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void save("draft", "발행을 취소했어요. 노트 목록에서 빠져요.")}>
                발행 취소
              </Button>
              <Button size="sm" disabled={busy || !dirty} onClick={() => void save(undefined, "고친 내용을 저장했어요.")}>
                고친 내용 저장
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void save(isNew ? "draft" : undefined, "임시 저장했어요.")}>
                임시 저장
              </Button>
              <Button size="sm" disabled={busy} onClick={() => void save("published", "발행했어요. 누구나 읽을 수 있어요.")}>
                발행
              </Button>
            </>
          )}
        </div>
      </div>

      <div className={styles.form}>
        <input className={styles.titleInput} value={draft.title} maxLength={120} placeholder="제목" aria-label="제목" onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        <input className={styles.leadInput} value={draft.lead} maxLength={300} placeholder="한 줄 요약 (선택) — 목록과 제목 아래에 보여요" aria-label="한 줄 요약" onChange={(e) => setDraft({ ...draft, lead: e.target.value })} />

        {/* 대표 이미지 (2026-11-17) — 노트 머리 · 목록 카드 썸네일 */}
        <section className={styles.block}>
          <div className={styles.blockHead}>
            <b>대표 이미지</b>
            <span className={styles.hint}>노트 맨 위와 목록 카드에 보여요 (선택)</span>
          </div>
          {draft.cover ? (
            <div className={styles.coverBox}>
              <img src={draft.cover} alt="대표 이미지 미리보기" />
              <div className={styles.coverActions}>
                <button type="button" className={styles.imageBtn} disabled={busy} onClick={() => coverFile.current?.click()}>
                  <ImagePlus aria-hidden="true" /> 바꾸기
                </button>
                <button type="button" className={styles.imageBtn} disabled={busy} onClick={() => setDraft({ ...draft, cover: "" })}>
                  <X aria-hidden="true" /> 빼기
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className={styles.coverEmpty} disabled={busy} onClick={() => coverFile.current?.click()}>
              <ImagePlus aria-hidden="true" /> 대표 이미지 올리기
            </button>
          )}
          <input ref={coverFile} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => e.target.files?.[0] && void uploadCover(e.target.files[0])} />
        </section>

        <div className={styles.bodyBar}>
          <div className={adminStyles.seg} role="group" aria-label="본문 보기">
            <button type="button" aria-pressed={tab === "write"} onClick={() => setTab("write")}>
              글쓰기
            </button>
            <button type="button" aria-pressed={tab === "preview"} onClick={() => setTab("preview")}>
              미리보기
            </button>
          </div>
          <button type="button" className={styles.imageBtn} disabled={busy} onClick={() => file.current?.click()}>
            <ImagePlus aria-hidden="true" /> 이미지 넣기
          </button>
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
          <span className={styles.hint}>## 소제목 · ### 작은 소제목 · **굵게** · - 목록 · &gt; 인용 · [링크](주소) · ![캡션](이미지)</span>
        </div>

        {tab === "write" ? (
          <textarea ref={area} className={styles.bodyInput} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} aria-label="본문 (Markdown)" spellCheck={false} />
        ) : (
          <div className={styles.preview}>
            <h1 className={styles.previewTitle}>{draft.title || "제목"}</h1>
            {draft.lead ? <p className={styles.previewLead}>{draft.lead}</p> : null}
            {toc.length >= 2 ? <p className={styles.previewToc}>목차: {toc.map((t) => t.text).join(" · ")}</p> : null}
            <NoteBody md={draft.body} />
          </div>
        )}

        {/* AI 요약 (2026-11-17 사용자 결정): AI 초안 → 운영자가 고쳐서 저장 → 읽는 사람은 "AI 요약" 상자에서 봄 */}
        <section className={styles.block}>
          <div className={styles.blockHead}>
            <b>AI 요약</b>
            <span className={styles.hint}>한 줄에 한 항목 · 비우면 노트에 보이지 않아요</span>
            <button type="button" className={styles.aiBtn} disabled={busy || summarizing} onClick={() => void summarize()}>
              <Sparkles aria-hidden="true" /> {summarizing ? "요약 만드는 중…" : "AI로 요약 만들기"}
            </button>
          </div>
          <textarea
            className={styles.smallInput}
            rows={5}
            value={draft.summary}
            maxLength={2000}
            placeholder={"[AI로 요약 만들기]를 누르거나 직접 적어 주세요.\n한 줄에 한 항목씩 적어요."}
            aria-label="AI 요약"
            onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
          />
        </section>

        {/* 출처 (2026-11-17 사용자 결정): 적은 경우만 노트 끝에 번호 목록으로 */}
        <section className={styles.block}>
          <div className={styles.blockHead}>
            <b>출처</b>
            <span className={styles.hint}>한 줄에 하나 · 주소(https://…)는 링크가 돼요 · 비우면 노트에 보이지 않아요</span>
          </div>
          <textarea
            className={styles.smallInput}
            rows={4}
            value={draft.sources}
            maxLength={10000}
            placeholder={"예) 기사 제목, 매체, 2026 — https://example.com/news"}
            aria-label="출처"
            onChange={(e) => setDraft({ ...draft, sources: e.target.value })}
          />
        </section>
      </div>
    </div>
  );
}
