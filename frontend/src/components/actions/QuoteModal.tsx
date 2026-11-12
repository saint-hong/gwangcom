import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { Avatar, Button } from "../../design-system";
import { useAuth } from "../../hooks/useAuth";
import type { Imagination, Limits } from "../../types/api";
import { QuoteEmbed } from "../card/QuoteEmbed";
import { useToast } from "../feedback/Toast";
import styles from "./QuoteModal.module.css";

/**
 * S6 인용하기 — X 인용하기 창 구조 (기획안 v9 F6 · v10 반영목록 2장 · 12장)
 *   [×] / (아바타) 내 글 입력 / 원본 카드(둥근 모서리, 이미지 크게) / 글자 수 …… [게시하기]
 *   X 의 [초안] · 이미지 · GIF · 이모지 도구는 넣지 않는다 (기본 기능만).
 * 내 글(기본 300자)만 쓰고 원본을 아래에 붙인다. 분야는 원본을 따른다. 올리면 새 인용 글 상세로 간다.
 */
export function QuoteModal({ item, onClose }: { item: Imagination; onClose: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [max, setMax] = useState(300);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Limits>("/api/me/limits").then((l) => setMax(l.limits.quote_chars ?? 300), () => {});
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    setSending(true);
    setError(null);
    try {
      const created = await api<Imagination>(`/api/imaginations/${item.id}/quote`, { json: { body: text } });
      toast.show("인용 글을 올렸어요.");
      onClose();
      navigate(`/i/${created.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "올리지 못했어요. 잠시 후 다시 시도해 주세요.");
      setSending(false);
    }
  };

  const over = text.length > max;
  return (
    <div className={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="인용하기">
        <div className={styles.top}>
          <button type="button" className={styles.close} aria-label="닫기" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>
        <div className={styles.row}>
          {user ? <Avatar name={user.nickname} src={user.avatar_url} size={40} /> : null}
          <div className={styles.field}>
            <textarea
              className={styles.input}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="이 상상에 내 생각을 더해 보세요"
              aria-label="인용하며 남길 글"
              rows={2}
              autoFocus
            />
            <QuoteEmbed
              preview
              quoted={{
                id: item.id,
                deleted: false,
                kind: item.kind,
                author: item.author,
                domain: item.domain,
                display_title: item.display_title,
                body: item.body,
                image_url: item.image_url,
                created_at: item.created_at,
              }}
            />
          </div>
        </div>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.foot}>
          <span className={over ? styles.over : styles.counter}>
            {text.length} / {max}
          </span>
          <Button onClick={() => void submit()} disabled={sending || over || !text.trim()}>
            게시하기
          </Button>
        </div>
      </div>
    </div>
  );
}
