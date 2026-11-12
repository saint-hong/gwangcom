import clsx from "clsx";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { Button, ButtonLink } from "../../design-system";
import { dateLabel } from "../../lib/actions";
import type { Imagination, Quoted, ShakeCandidates } from "../../types/api";
import { QuoteEmbed } from "../card/QuoteEmbed";
import { useToast } from "../feedback/Toast";
import { ShakeIcon } from "./ShakeIcon";
import styles from "./ShakeModal.module.css";

const KIND_LABEL = {
  original: "원본",
  quote: "인용",
  blend: "Shake it",
  comment: "댓글",
} as const;
/** 섞는 애니메이션을 최소 이만큼은 보여 준다 (AI 가 빨리 끝나도 흔들림이 보이게) */
const MIN_MIX_MS = 1600;

export function toQuoted(item: Imagination): Quoted {
  return {
    id: item.id,
    deleted: false,
    kind: item.kind,
    author: item.author,
    domain: item.domain,
    display_title: item.display_title,
    body: item.body,
    image_url: item.image_url,
    created_at: item.created_at,
  };
}

/**
 * S7 Shake it 선택 창 (기획안 v10 F8 · 6장)
 *   [×] Shake it + 한 줄 설명 / 섞을 상대 글(요약 카드) / 내 상상 고르기(원본 · 인용 · 혼합, 최신순) / 오늘 남은 Shake 7/10 …… [완료]
 *   → [완료] → 두 카드가 흔들리며 합쳐지는 애니메이션(AI 가 섞는 동안) → 홈 피드(최신) 맨 위에 새 혼합 글
 * - 미리보기 · 다시 흔들기 없음. 실패하면 게시되지 않고 횟수도 줄지 않는다 (서버가 처리)
 * - 선택 창이 열린 뒤 [완료]까지 걸린 시간(selection_ms)을 함께 보낸다 (분석용)
 * - 창 틀은 고정하고 가운데만 스크롤한다 → 스크롤바가 둥근 모서리를 덮지 않는다 (2026-11-11 사용자 확인)
 */
export function ShakeModal({
  target,
  onClose,
}: {
  target: Imagination;
  onClose: () => void;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState<ShakeCandidates | null>(null);
  const [items, setItems] = useState<Imagination[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [picked, setPicked] = useState<Imagination | null>(null);
  const [phase, setPhase] = useState<"pick" | "mixing">("pick");
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const openedAt = useRef(performance.now());

  useEffect(() => {
    api<ShakeCandidates>(`/api/shake/candidates?target_id=${target.id}`).then(
      (res) => {
        setData(res);
        setItems(res.items);
        setCursor(res.next_cursor);
        openedAt.current = performance.now();
      },
      (e) =>
        setLoadError(
          e instanceof ApiError ? e.message : "내 상상을 불러오지 못했어요.",
        ),
    );
  }, [target.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" && phase === "pick" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, phase]);

  const more = useCallback(async () => {
    if (!cursor) return;
    try {
      const res = await api<ShakeCandidates>(
        `/api/shake/candidates?target_id=${target.id}&cursor=${encodeURIComponent(cursor)}`,
      );
      setItems((prev) => [...prev, ...res.items]);
      setCursor(res.next_cursor);
    } catch {
      toast.show("더 불러오지 못했어요.");
    }
  }, [cursor, target.id, toast]);

  const submit = async () => {
    if (!picked) return;
    setError(null);
    setPhase("mixing");
    const started = performance.now();
    try {
      const created = await api<Imagination>("/api/shake", {
        json: {
          target_id: target.id,
          mine_id: picked.id,
          selection_ms: Math.round(started - openedAt.current),
        },
      });
      const wait = MIN_MIX_MS - (performance.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      onClose();
      toast.show("두 상상을 섞어 새 상상을 올렸어요!");
      navigate("/?tab=latest", { state: { shaken: created } });
    } catch (e) {
      setPhase("pick");
      setError(
        e instanceof ApiError
          ? e.message
          : "상상을 섞지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
    }
  };

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(e) =>
        e.target === e.currentTarget && phase === "pick" && onClose()
      }
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Shake it: 내 상상과 섞기"
      >
        {phase === "mixing" && picked ? (
          <Mixing a={target} b={picked} />
        ) : (
          <>
            <div className={styles.top}>
              <button
                type="button"
                className={styles.close}
                aria-label="닫기"
                onClick={onClose}
              >
                <X aria-hidden="true" />
              </button>
              <h2 className={styles.heading}>
                <ShakeIcon className={styles.headingIcon} aria-hidden="true" />{" "}
                Shake it
              </h2>
            </div>
            <p className={styles.intro}>
              선택한 상상과 내 상상을 AI가 섞어서 새로운 상상으로 만들어 드려요!
            </p>

            <div className={styles.scroll}>
              <p className={styles.label}>섞을 상대 상상</p>
              <QuoteEmbed quoted={toQuoted(target)} preview />

              <p className={styles.label}>내 상상 고르기</p>
              {loadError ? (
                <p className={styles.error}>{loadError}</p>
              ) : data === null ? (
                <p className={styles.muted}>불러오는 중…</p>
              ) : items.length === 0 ? (
                <div className={styles.empty}>
                  <p>
                    먼저 상상을 하나 올려 주세요. 내 상상이 있어야 섞을 수
                    있어요.
                  </p>
                  <ButtonLink to="/write" size="sm" onClick={onClose}>
                    상상하기
                  </ButtonLink>
                </div>
              ) : (
                <div
                  className={styles.list}
                  role="radiogroup"
                  aria-label="섞을 내 상상"
                >
                  {items.map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      role="radio"
                      aria-checked={picked?.id === it.id}
                      className={clsx(
                        styles.option,
                        picked?.id === it.id && styles.picked,
                      )}
                      onClick={() => setPicked(it)}
                    >
                      <span className={styles.radio} aria-hidden="true" />
                      <span className={styles.optionText}>
                        <span className={styles.optionTitle}>
                          {it.display_title}
                        </span>
                        <span className={styles.optionMeta}>
                          {KIND_LABEL[it.kind]} · {dateLabel(it.created_at)}
                        </span>
                      </span>
                    </button>
                  ))}
                  {cursor ? (
                    <button
                      type="button"
                      className={styles.more}
                      onClick={() => void more()}
                    >
                      더 보기
                    </button>
                  ) : null}
                </div>
              )}

              {error ? <p className={styles.error}>{error}</p> : null}
            </div>

            <div className={styles.foot}>
              {data ? (
                <span className={styles.quota}>
                  오늘 남은 Shake {data.remaining}/{data.limit}
                </span>
              ) : null}
              <Button
                size="sm"
                disabled={!picked}
                onClick={() => void submit()}
              >
                완료
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** 두 카드가 흔들리며 가운데로 모여 합쳐지는 동안 AI 가 섞는다 */
function Mixing({ a, b }: { a: Imagination; b: Imagination }) {
  return (
    <div className={styles.mixing} aria-live="polite">
      <div className={styles.stage}>
        <div className={clsx(styles.card, styles.cardA)}>
          <span className={styles.cardName}>{a.author.nickname}</span>
          <span className={styles.cardTitle}>{a.display_title}</span>
        </div>
        <div className={styles.core} aria-hidden="true">
          <ShakeIcon className={styles.coreIcon} />
        </div>
        <div className={clsx(styles.card, styles.cardB)}>
          <span className={styles.cardName}>{b.author.nickname}</span>
          <span className={styles.cardTitle}>{b.display_title}</span>
        </div>
      </div>
      <p className={styles.mixText}>두 상상을 흔들어 섞고 있어요…</p>
    </div>
  );
}
