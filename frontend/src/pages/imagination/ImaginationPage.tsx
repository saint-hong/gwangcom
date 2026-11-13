import { Bot, EyeOff, MessageCircleQuestion, Network } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { ActionBar } from "../../components/actions/ActionBar";
import { ShakeIcon } from "../../components/actions/ShakeIcon";
import { ItemMenu } from "../../components/card/ItemMenu";
import { QuoteEmbed } from "../../components/card/QuoteEmbed";
import { CommentSection, type CommentSectionHandle } from "../../components/comments/CommentSection";
import { PageHeader } from "../../components/layout/PageHeader";
import { SimilarBlock } from "../../components/similar/SimilarBlock";
import { FollowButton } from "../../components/social/FollowButton";
import { Avatar } from "../../design-system";
import { useAuth } from "../../hooks/useAuth";
import { useDreamerCard } from "../../hooks/useDreamerCard";
import { fullDateTime } from "../../lib/actions";
import type { Imagination } from "../../types/api";
import { ItemTags } from "../../components/tags/ItemTags";
import prompts from "../../components/prompt/Prompt.module.css";
import styles from "./ImaginationPage.module.css";

const KIND_LABEL = { original: "원본", blend: "Shake it", quote: "인용", comment: "댓글" } as const;

/**
 * S4 상상 상세 — X 게시물 상세 구조 (v10 반영목록 3-1, etc_datas/x_로그인_카드상세_1~4)
 *   [←] 상상
 *   작성자 줄: 아바타 · 닉네임 · 운영자 배지 …… [팔로우] ⋯   (오른쪽 컬럼 "이 상상의 Dreamer" 와 같은 상태)
 *   제목 → 본문 → 왜 원하나요 → 이미지 → (인용 글) 원본 카드
 *   시간 줄: 오후 2:10 · 2026년 11월 10일 · 원본 / Shake it (· 계보)(· AI 도움: 혼합 글은 Shake it 과 뜻이 겹쳐 숨김, 2026-11-12)
 *   분류 줄: [분야] 회색 알약 + #주제(기술 태그) (+ 작성자면 [태그 편집]) — ⋯ > 뱃지 보기는 없앰 (2026-11-12)
 *     계보 링크는 혼합 글이거나 이 글에서 태어난 상상이 있을 때 (2026-11-12 사용자 지정: 이름 "계보", 시간 줄 안으로)
 *   기술 태그 줄 (+ 작성자면 [태그 편집], 5-D) — 욕망 태그는 보이지 않는다
 *   액션 바 (위아래 선, 글 아래 한 번) → 댓글 입력창 → 댓글 목록
 * 댓글 주소(/i/댓글id)로 들어오면 원글의 그 댓글 위치(/i/원글#c댓글)로 옮긴다.
 */
export function ImaginationPage() {
  const { id = "" } = useParams();
  const { hash } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [item, setItem] = useState<Imagination | null>(null);
  const [error, setError] = useState<string | null>(null);
  const comments = useRef<CommentSectionHandle>(null);
  const dreamer = useDreamerCard();
  const authorName = item?.author.nickname ?? null;

  // 오른쪽 컬럼 "이 상상의 Dreamer" 블록에 작성자를 알려 준다
  useEffect(() => {
    dreamer.show(authorName);
    return () => dreamer.show(null);
  }, [authorName, dreamer.show]);

  useEffect(() => {
    if (user === undefined) return; // 로그인 확인이 끝난 뒤 불러야 actions · my 가 맞다
    const ctrl = new AbortController();
    setError(null);
    api<Imagination>(`/api/imaginations/${encodeURIComponent(id)}`, { signal: ctrl.signal })
      .then((data) => {
        if (data.kind === "comment" && data.root_id) navigate(`/i/${data.root_id}#c${data.id}`, { replace: true });
        else setItem(data);
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e instanceof ApiError ? e.message : "불러오지 못했어요.");
      });
    return () => ctrl.abort();
  }, [id, user, navigate]);

  // 카드의 댓글 버튼(#comments)으로 들어오면 입력창으로
  useEffect(() => {
    if (item && hash === "#comments") {
      document.getElementById("comments")?.scrollIntoView({ block: "start" });
      comments.current?.focusComposer();
    }
  }, [item, hash]);

  const changeCount = useCallback(
    (delta: number) =>
      setItem((prev) =>
        prev ? { ...prev, counts: { ...prev.counts, comments: Math.max(0, prev.counts.comments + delta) } } : prev,
      ),
    [],
  );

  if (error || !item) {
    return (
      <div>
        <PageHeader title="상상" />
        <p className={styles.status}>{error ?? "불러오는 중…"}</p>
      </div>
    );
  }

  const { author } = item;
  const focusId = /^#c\d+$/.test(hash) ? Number(hash.slice(2)) : null;
  return (
    <article>
      <PageHeader title="상상" />
      {item.hidden ? (
        <p className={styles.hiddenNotice} role="status">
          <EyeOff aria-hidden="true" /> 운영자가 숨긴 상상이에요. 다른 Dreamer 에게는 보이지 않아요.
        </p>
      ) : null}
      <div className={styles.page}>
        <header className={styles.authorRow}>
          <Link to={`/@${author.nickname}`} className={styles.author}>
            <Avatar name={author.nickname} src={author.avatar_url} size={40} />
            <span className={styles.authorName}>
              {author.nickname}
              {author.is_operator ? <span className={styles.operator}>운영자</span> : null}
            </span>
          </Link>
          <span className={styles.headTools}>
            {dreamer.card && dreamer.card.author.nickname === author.nickname ? (
              <FollowButton
                nickname={author.nickname}
                following={dreamer.card.following}
                onChange={(r) => dreamer.setFollowing(r.following)}
              />
            ) : null}
            <ItemMenu item={item} onDeleted={() => navigate("/", { replace: true })} className={styles.more} />
          </span>
        </header>

        {item.prompt ? (
          <p className={styles.promptLine}>
            <Link to={`/prompts/${item.prompt.id}`} className={prompts.answerLine}>
              <MessageCircleQuestion aria-hidden="true" />
              <span>이번 주 질문 · {item.prompt.title}</span>
            </Link>
          </p>
        ) : null}
        {item.kind === "quote" ? null : <h1 className={styles.title}>{item.display_title}</h1>}

        <p className={item.kind === "quote" ? styles.quoteBody : styles.body}>{item.body}</p>

        {item.desire ? (
          <aside className={styles.desire}>
            <span className={styles.desireLabel}>왜 원하나요</span>
            <p>{item.desire}</p>
          </aside>
        ) : null}

        {item.image_url ? (
          <div className={styles.image}>
            <img src={item.image_url} alt="" />
          </div>
        ) : null}

        {item.quoted ? <QuoteEmbed quoted={item.quoted} /> : null}

        {item.kind === "blend" && item.sources?.length ? (
          <section className={styles.sources} aria-label="재료 상상">
            <h2 className={styles.sourcesTitle}>재료 상상 {item.sources.length}개</h2>
            {item.sources.map((s, i) => (
              <QuoteEmbed key={s.id ?? i} quoted={s} />
            ))}
          </section>
        ) : null}

        <p className={styles.metaLine}>
          <time dateTime={item.created_at}>{fullDateTime(item.created_at)}</time>
          <span aria-hidden="true">·</span>
          {item.kind === "blend" ? (
            <span className={styles.shakeBadge}>
              <ShakeIcon className={styles.shakeIcon} aria-hidden="true" /> Shake it
            </span>
          ) : (
            <span>{KIND_LABEL[item.kind]}</span>
          )}
          {item.kind === "blend" || item.counts.shakes > 0 ? (
            <>
              <span aria-hidden="true">·</span>
              <Link to={`/i/${item.id}/lineage`} className={styles.lineageLink}>
                <Network aria-hidden="true" />
                계보
                {item.counts.shakes > 0 ? <span className={styles.lineageCount}>· 이 상상에서 태어난 상상 {item.counts.shakes}개</span> : null}
              </Link>
            </>
          ) : null}
          {item.ai_assisted && item.kind !== "blend" ? (
            <>
              <span aria-hidden="true">·</span>
              <span className={styles.ai}>
                <Bot aria-hidden="true" /> AI 도움
              </span>
            </>
          ) : null}
        </p>

        <ItemTags item={item} onChange={setItem} />

        <div className={styles.actions}>
          <ActionBar item={item} onComment={() => comments.current?.focusComposer()} />
        </div>
      </div>

      <SimilarBlock id={item.id} inline />

      <CommentSection ref={comments} root={item} onCountChange={changeCount} focusId={focusId} />
    </article>
  );
}
