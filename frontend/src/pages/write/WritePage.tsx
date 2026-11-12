import clsx from "clsx";
import { ImagePlus, MessageCircleQuestion, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { DOMAINS } from "../../brand";
import { useToast } from "../../components/feedback/Toast";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../design-system";
import { useAuth } from "../../hooks/useAuth";
import type { Imagination, Limits, Prompt } from "../../types/api";
import prompts from "../../components/prompt/Prompt.module.css";
import { leftLabel } from "../../components/prompt/useCurrentPrompt";
import styles from "./WritePage.module.css";

/**
 * S3 상상하기 (기획안 v9 F2)
 * 분야(필수) → 제목(선택) → 상상 → 왜 원하나요 → 대표 이미지 → AI 도움 여부 · Shake it 허용
 * 글자 수는 내 이용 한도(/api/me/limits) 기준 "123 / 500". 최종 검사는 서버가 한다.
 * 이번 주 질문에서 들어오면(?prompt=ID) 맨 위에 질문 카드 → prompt_id 를 붙여 올린다 (6-C, F13).
 *   [×] 로 질문 없이 쓸 수 있다. 끝난 질문이면 카드를 흐리게 보여 주고 붙이지 않는다 (자유 상상).
 */
export function WritePage() {
  const { user, openAuth } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [limits, setLimits] = useState<Limits | null>(null);
  // 홈의 상상하기 유도 영역에서 분야 칩을 눌러 들어오면 그 분야가 골라진 채로 시작한다
  const [domain, setDomain] = useState<string | null>(() => {
    const d = new URLSearchParams(window.location.search).get("domain");
    return d && DOMAINS.some((x) => x.slug === d) ? d : null;
  });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [desire, setDesire] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [aiAssisted, setAiAssisted] = useState(false);
  const [shakeAllowed, setShakeAllowed] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("prompt");
    if (id && /^\d+$/.test(id)) api<Prompt>(`/api/prompts/${id}`).then(setPrompt, () => setPrompt(null));
  }, []);

  useEffect(() => {
    if (user === null) openAuth("login");
    if (!user) return;
    api<Limits>("/api/me/limits").then(setLimits, () => setLimits(null));
  }, [user, openAuth]);

  const preview = useMemo(() => (image ? URL.createObjectURL(image) : null), [image]);
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);

  if (user === undefined) return null;
  if (user === null) {
    return (
      <div>
        <PageHeader title="상상하기" />
        <section className={styles.needLogin}>
          <p>로그인하면 누구나 상상을 올릴 수 있어요.</p>
          <Button size="sm" onClick={() => openAuth("login")}>
            로그인
          </Button>
        </section>
      </div>
    );
  }

  const L = limits?.limits ?? { title_chars: 40, body_chars: 500, desire_chars: 100, image_mb: 5 };
  const over = title.length > L.title_chars || body.length > L.body_chars || desire.length > L.desire_chars;
  const canSubmit = !!domain && body.trim().length > 0 && !over && !busy;

  const pickImage = (file: File | undefined) => {
    if (!file) return;
    if (file.size > L.image_mb * 1024 * 1024) {
      toast.show(`이미지는 ${L.image_mb}MB 까지 올릴 수 있어요.`);
      return;
    }
    setImage(file);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!domain) {
      setError("분야를 하나 골라 주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("domain", domain);
    form.set("body", body);
    if (title.trim()) form.set("title", title);
    if (desire.trim()) form.set("desire", desire);
    form.set("ai_assisted", String(aiAssisted));
    form.set("shake_allowed", String(shakeAllowed));
    if (image) form.set("image", image);
    if (prompt?.open) form.set("prompt_id", String(prompt.id));
    try {
      const created = await api<Imagination>("/api/imaginations", { form });
      toast.show("상상을 올렸어요.");
      navigate(`/i/${created.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "올리지 못했어요. 잠시 후 다시 시도해 주세요.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <PageHeader
        title="상상하기"
        sub={limits ? `오늘 ${limits.today.posts_remaining}개 더 올릴 수 있어요` : undefined}
        right={
          <Button type="submit" size="sm" disabled={!canSubmit}>
            {busy ? "올리는 중…" : "게시"}
          </Button>
        }
      />

      <div className={styles.form}>
        {prompt ? (
          <section className={clsx(prompts.card, !prompt.open && prompts.cardClosed)} aria-label="이번 주 질문">
            <span className={prompts.eyebrow}>
              <MessageCircleQuestion aria-hidden="true" className={styles.inlineIcon} />{" "}
              {prompt.open
                ? `이번 주 질문에 답하는 상상이에요${leftLabel(prompt.ends_at) ? ` · ${leftLabel(prompt.ends_at)}` : ""}`
                : "끝난 질문이에요 · 질문 없이 자유 상상으로 올라가요"}
            </span>
            <strong className={prompts.question}>{prompt.title}</strong>
            {prompt.body ? <p className={prompts.body}>{prompt.body}</p> : null}
            <button type="button" className={prompts.close} aria-label="질문 없이 쓰기" onClick={() => setPrompt(null)}>
              <X aria-hidden="true" />
            </button>
          </section>
        ) : null}
        <fieldset className={styles.field}>
          <legend className={styles.label}>
            분야 <span className={styles.required}>필수</span>
          </legend>
          <div className={styles.chips}>
            {DOMAINS.map((d) => (
              <button
                key={d.slug}
                type="button"
                aria-pressed={domain === d.slug}
                className={clsx(styles.chip, domain === d.slug && styles.chipOn)}
                onClick={() => setDomain(d.slug)}
              >
                {d.name}
              </button>
            ))}
          </div>
        </fieldset>

        <Field label="제목" optional count={title.length} max={L.title_chars}>
          <input
            className={styles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="비우면 상상의 첫 줄이 제목이 돼요"
          />
        </Field>

        <Field label="어떤 미래를 상상하나요?" count={body.length} max={L.body_chars}>
          <textarea
            className={clsx(styles.input, styles.textarea)}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="예) 아침마다 지붕 위 정류장에서 드론 버스를 타고 학교에 가요."
            rows={7}
            required
          />
        </Field>

        <Field label="왜 원하나요?" optional count={desire.length} max={L.desire_chars}>
          <input
            className={styles.input}
            value={desire}
            onChange={(e) => setDesire(e.target.value)}
            placeholder="이 상상 밑에 있는 바람을 한 줄로 (예: 아침잠을 더 자고 싶어서)"
          />
        </Field>

        <div className={styles.field}>
          <span className={styles.label}>
            대표 이미지 <span className={styles.optional}>선택 · 1장 · {L.image_mb}MB</span>
          </span>
          {preview ? (
            <div className={styles.preview}>
              <img src={preview} alt="선택한 대표 이미지" />
              <button type="button" className={styles.removeImage} onClick={() => setImage(null)} aria-label="이미지 빼기">
                <X aria-hidden="true" />
              </button>
            </div>
          ) : (
            <label className={styles.imagePick}>
              <ImagePlus aria-hidden="true" />
              이미지 고르기 (가로형 권장)
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="visually-hidden"
                onChange={(e) => pickImage(e.target.files?.[0])}
              />
            </label>
          )}
        </div>

        <label className={styles.check}>
          <input type="checkbox" checked={aiAssisted} onChange={(e) => setAiAssisted(e.target.checked)} />
          AI 의 도움을 받아 작성했어요
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={shakeAllowed} onChange={(e) => setShakeAllowed(e.target.checked)} />
          다른 Dreamer 가 이 상상으로 Shake it 하는 것을 허용해요
        </label>

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <p className={styles.note}>올린 상상은 고칠 수 없고 삭제만 할 수 있어요. "먼저 상상한 기록"을 지키기 위해서예요.</p>
      </div>
    </form>
  );
}

function Field({
  label,
  optional,
  count,
  max,
  children,
}: {
  label: string;
  optional?: boolean;
  count: number;
  max: number;
  children: ReactNode;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.labelRow}>
        <span className={styles.label}>
          {label} {optional ? <span className={styles.optional}>선택</span> : null}
        </span>
        <span className={clsx(styles.counter, count > max && styles.counterOver)}>
          {count} / {max}
        </span>
      </span>
      {children}
    </label>
  );
}
