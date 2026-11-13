import { Pencil, X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { api, ApiError } from "../../api/client";
import { Button } from "../../design-system";
import type { Imagination } from "../../types/api";
import { domainsOf, TagList } from "./TagList";
import styles from "./Tags.module.css";

/**
 * 상상 상세의 기술 태그 줄 + 작성자 태그 편집 (기획안 v10 F2 "작성자가 태그를 직접 추가·삭제, 최대 5개", S4 8번).
 * - 편집 가능 여부 · 더 붙일 수 있는 수는 서버 actions.edit_tags 를 그대로 쓴다 (규칙은 서버가 다시 검사)
 * - 목록 전체를 PUT 으로 보낸다. 지운 태그는 서버가 기록으로 남긴다 (분석용)
 * - 분야 알약이 늘 앞에 있다 (분류 줄, 2026-11-12)
 */
export function ItemTags({
  item,
  onChange,
}: {
  item: Imagination;
  onChange: (next: Imagination) => void;
}) {
  const can = item.actions.edit_tags;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const max = item.tags.length + (can.remaining ?? 0);

  if (!editing) {
    return (
      <div className={styles.row}>
        {/* [태그 편집]은 태그 줄 맨 끝 알약 — 태그가 늘어도 버튼이 눌려 글자가 꺾이지 않는다 (2026-11-13) */}
        <TagList
          tags={item.tags}
          domains={domainsOf(item)}
          after={
            can.allowed ? (
              <button
                type="button"
                className={styles.editBtn}
                onClick={() => {
                  setDraft(item.tags.map((t) => t.label));
                  setText("");
                  setError(null);
                  setEditing(true);
                }}
              >
                <Pencil aria-hidden="true" />
                {item.tags.length === 0 ? "태그 달기" : "태그 편집"}
              </button>
            ) : null
          }
        />
      </div>
    );
  }

  const add = () => {
    const v = text.trim().replace(/^#+/, "").trim();
    if (!v) return;
    if (
      !draft.some(
        (d) =>
          d.replace(/\s+/g, "").toLowerCase() ===
          v.replace(/\s+/g, "").toLowerCase(),
      )
    ) {
      setDraft((prev) => [...prev, v]);
    }
    setText("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return; // 한글 조합 중 Enter 는 무시
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && !text && draft.length) {
      setDraft((prev) => prev.slice(0, -1));
    }
  };
  const save = async () => {
    const pending = text.trim()
      ? [...draft, text.trim().replace(/^#+/, "").trim()]
      : draft;
    setSaving(true);
    setError(null);
    try {
      const next = await api<Imagination>(`/api/imaginations/${item.id}/tags`, {
        method: "PUT",
        json: { tech: pending },
      });
      onChange(next);
      setEditing(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "태그를 저장하지 못했어요.");
    } finally {
      setSaving(false);
    }
  };
  const full = draft.length >= max;

  return (
    <div className={styles.editor}>
      <div className={styles.editorHead}>
        <span>기술 태그</span>
        <span>
          {draft.length} / {max}
        </span>
      </div>
      <div className={styles.chips}>
        {draft.map((d, i) => (
          <span key={`${d}-${i}`} className={styles.chip}>
            #{d}
            <button
              type="button"
              className={styles.chipRemove}
              aria-label={`${d} 태그 빼기`}
              onClick={() => setDraft((prev) => prev.filter((_, j) => j !== i))}
            >
              <X aria-hidden="true" />
            </button>
          </span>
        ))}
        {full ? null : (
          <input
            className={styles.input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            onBlur={add}
            placeholder={draft.length ? "태그 더하기" : "예) 드론, 배터리"}
            aria-label="태그 더하기"
            autoFocus
          />
        )}
      </div>
      <p className={styles.hint}>
        Enter 로 더해요. 상상에 쓰인 기술을 짧게 적어 주세요.
      </p>
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.foot}>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setEditing(false)}
          disabled={saving}
        >
          취소
        </Button>
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? "저장 중…" : "저장"}
        </Button>
      </div>
    </div>
  );
}
