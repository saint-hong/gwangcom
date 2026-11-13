import { MessageCircle, MessageCircleQuestion, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { WaveIcon } from "../../components/actions/WaveIcon";
import { ImaginationCard } from "../../components/card/ImaginationCard";
import { PageHeader } from "../../components/layout/PageHeader";
import { leftLabel } from "../../components/prompt/useCurrentPrompt";
import { Avatar, Button, ButtonLink } from "../../design-system";
import { useAuth } from "../../hooks/useAuth";
import { usePaged } from "../../hooks/usePaged";
import type { Answerer, Imagination, PromptInsight } from "../../types/api";
import styles from "./PromptPage.module.css";

const CHART_MAX = 8; // 그래프에 보여 줄 사람 수 (나머지는 아래 목록에서)

/**
 * 이번 주 질문 상세 (/prompts/:id, 2026-11-13 사용자 요청) — 상상 상세(X 구조)처럼
 *   [←] 이번 주 질문
 *   질문 머리: 이번 주 질문 · N일 남음 / 질문 / 설명 / 답한 상상 N개 · M명 참여 / [상상하기]
 *   반응 그래프: 답한 사용자별 Thunder · Wave · 댓글 합계 (반응 많은 순, 가로 쌓은 막대)
 *   답한 상상: 댓글처럼 이어지는 카드 목록 (최신순, 무한 스크롤)
 */
export function PromptPage() {
  const { id = "" } = useParams();
  const { user, openAuth } = useAuth();
  const [data, setData] = useState<PromptInsight | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    api<PromptInsight>(`/api/prompts/${id}/insight`).then(setData, (e) =>
      setError(e instanceof ApiError ? e.message : "질문을 불러오지 못했어요."),
    );
  }, [id]);

  const list = usePaged<Imagination>(
    user === undefined || error ? null : `/api/prompts/${id}/imaginations`,
    user ? `u${user.id}` : "guest",
    "상상을 불러오지 못했어요.",
  );
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && list.loadMore(), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [list.loadMore]);

  if (error) {
    return (
      <div>
        <PageHeader title="이번 주 질문" />
        <p className={styles.status}>{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div>
        <PageHeader title="이번 주 질문" />
        <p className={styles.status}>불러오는 중…</p>
      </div>
    );
  }

  const { prompt, answerers } = data;
  const left = leftLabel(prompt.ends_at);
  return (
    <div>
      <PageHeader title="이번 주 질문" />

      <header className={styles.head}>
        <span className={styles.eyebrow}>
          <MessageCircleQuestion aria-hidden="true" />
          {prompt.open ? `이번 주 질문${left ? ` · ${left}` : ""}` : "끝난 질문"}
        </span>
        <h2 className={styles.title}>{prompt.title}</h2>
        {prompt.body ? <p className={styles.body}>{prompt.body}</p> : null}
        <div className={styles.headFoot}>
          <span className={styles.meta}>
            답한 상상 {prompt.answer_count}개 · {prompt.answerer_count}명 참여
          </span>
          {prompt.open ? (
            user ? (
              <ButtonLink to={`/write?prompt=${prompt.id}`} size="sm">
                상상하기
              </ButtonLink>
            ) : (
              <Button size="sm" onClick={() => openAuth("login")}>
                상상하기
              </Button>
            )
          ) : null}
        </div>
      </header>

      <ReactionChart answerers={answerers} />

      <h3 className={styles.listTitle}>답한 상상</h3>
      {list.items.map((item) => (
        <ImaginationCard key={item.id} data={item} onDeleted={list.remove} />
      ))}
      {list.error ? (
        <div className={styles.status}>
          <p>{list.error}</p>
          <Button size="sm" variant="outline" onClick={() => void list.retry()}>
            다시 불러오기
          </Button>
        </div>
      ) : list.loading || user === undefined ? (
        <p className={styles.status}>불러오는 중…</p>
      ) : list.done && list.items.length === 0 ? (
        <p className={styles.status}>아직 이 질문에 답한 상상이 없어요. 첫 상상을 올려 보세요.</p>
      ) : null}
      <div ref={sentinel} aria-hidden="true" />
    </div>
  );
}

const SERIES = [
  { key: "thunders", label: "Thunder", cls: "thunder", Icon: Zap },
  { key: "waves", label: "Wave", cls: "wave", Icon: WaveIcon },
  { key: "comments", label: "댓글", cls: "comment", Icon: MessageCircle },
] as const;

/**
 * 반응 그래프 — 답한 사용자별 가로 쌓은 막대 (Thunder · Wave · 댓글)
 *   줄: 아바타 · 닉네임(누르면 그 사람의 반응 가장 많은 답) | 막대 | 합계
 *   막대에 올리면 자세한 수 (툴팁), 범례는 위에 한 줄
 */
function ReactionChart({ answerers }: { answerers: Answerer[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const rows = answerers.slice(0, CHART_MAX);
  const max = Math.max(1, ...rows.map((a) => a.total));
  const hasReactions = rows.some((a) => a.total > 0);

  return (
    <section className={styles.chart} aria-label="답한 사용자별 반응">
      <div className={styles.chartHead}>
        <h3 className={styles.chartTitle}>반응이 좋은 상상</h3>
        <ul className={styles.legend} aria-label="범례">
          {SERIES.map((s) => (
            <li key={s.key}>
              <span className={`${styles.swatch} ${styles[s.cls]}`} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
      </div>
      {rows.length === 0 ? (
        <p className={styles.chartEmpty}>답한 상상이 생기면 사람들의 반응을 여기에서 비교해 볼 수 있어요.</p>
      ) : !hasReactions ? (
        <p className={styles.chartEmpty}>아직 반응이 없어요. 마음에 드는 상상에 Thunder 를 눌러 보세요.</p>
      ) : (
        <ol className={styles.bars}>
          {rows.map((a) => {
            const detail = `Thunder ${a.thunders} · Wave ${a.waves} · 댓글 ${a.comments} (답 ${a.answers}개)`;
            return (
              <li
                key={a.author.id}
                className={styles.barRow}
                onMouseEnter={() => setHover(a.author.id)}
                onMouseLeave={() => setHover(null)}
              >
                <Link to={`/i/${a.best_id}`} className={styles.who} title={`${a.author.nickname}님의 상상 보기`}>
                  <Avatar name={a.author.nickname} src={a.author.avatar_url} size={20} />
                  <span className={styles.whoName}>{a.author.nickname}</span>
                </Link>
                <div className={styles.track} role="img" aria-label={`${a.author.nickname}: ${detail}`}>
                  {SERIES.map((s) =>
                    a[s.key] > 0 ? (
                      <span key={s.key} className={`${styles.seg} ${styles[s.cls]}`} style={{ width: `${(a[s.key] / max) * 100}%` }} />
                    ) : null,
                  )}
                  {hover === a.author.id ? (
                    <span className={styles.tip} role="tooltip">
                      {SERIES.map((s) => (
                        <span key={s.key} className={styles.tipItem}>
                          <s.Icon aria-hidden="true" /> {a[s.key]}
                        </span>
                      ))}
                      <span className={styles.tipMuted}>답 {a.answers}개</span>
                    </span>
                  ) : null}
                </div>
                <span className={styles.total}>{a.total}</span>
              </li>
            );
          })}
        </ol>
      )}
      {answerers.length > CHART_MAX ? <p className={styles.chartNote}>반응 많은 {CHART_MAX}명만 보여요. 나머지는 아래 목록에서 볼 수 있어요.</p> : null}
    </section>
  );
}
