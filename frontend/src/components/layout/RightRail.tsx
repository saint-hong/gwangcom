import { ChevronRight, MessageCircle, Search, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../../api/client";
import { Avatar, Button, ButtonLink } from "../../design-system";
import { useAuth } from "../../hooks/useAuth";
import { useDreamerCard } from "../../hooks/useDreamerCard";
import type { Dreamer, Imagination, Page, Topics } from "../../types/api";
import { ShakeIcon } from "../actions/ShakeIcon";
import { WaveIcon } from "../actions/WaveIcon";
import { leftLabel, usePromptList } from "../prompt/useCurrentPrompt";
import prompts from "../prompt/Prompt.module.css";
import { SimilarBlock } from "../similar/SimilarBlock";
import { tagPath } from "../tags/TagList";
import { FollowButton } from "../social/FollowButton";
import styles from "./RightRail.module.css";
import { SiteFooter } from "./SiteFooter";

/**
 * 오른쪽 컬럼 (로그인 전·후 같음, 기획안 v9 4장)
 *   검색창 → (상세 화면) 이 상상의 Dreamer → 비슷한 상상(F23) → 이번 주 질문 → 인기 상상 1~5 → 추천 Dreamer 3명 → 추천 주제 → 푸터
 * 이번 주 질문은 /api/prompts 진행 중 첫 번째 (제목 옆 "(N개)" = 진행 중 수, 2026-11-13). 좁은 화면은 홈 피드 위 배너(PromptBanner)가 대신한다.
 */
export function RightRail() {
  const { user, openAuth } = useAuth();
  // 진행 중 질문이 여러 개일 수 있다 (2026-11-13): 블록에는 지금 질문(첫 번째), 제목을 누르면 /prompts 목록
  const promptList = usePromptList();
  const prompt = promptList === undefined ? undefined : promptList.open[0] ?? null;
  const { pathname } = useLocation();
  const dreamer = useDreamerCard();
  const [trending, setTrending] = useState<Imagination[] | null>(null);
  const [dreamers, setDreamers] = useState<Dreamer[] | null>(null);
  const [topics, setTopics] = useState<Topics["popular"] | null>(null);

  // 로그인 상태가 바뀌거나 다른 화면으로 가면 다시 불러온다 (팔로우하면 추천에서 빠지도록)
  useEffect(() => {
    if (user === undefined) return;
    api<Page<Imagination>>("/api/trending?limit=5").then((p) => setTrending(p.items), () => setTrending([]));
    api<Dreamer[]>("/api/users/recommended?limit=3").then(setDreamers, () => setDreamers([]));
    api<Topics>("/api/topics").then((d) => setTopics(d.popular), () => setTopics([]));
  }, [user, pathname]);

  const showCard = pathname.startsWith("/i/") && dreamer.card;
  const detailId = /^\/i\/(\d+)$/.exec(pathname)?.[1];
  return (
    <div className={styles.rail}>
      <div className={styles.searchWrap}>
        <label className={styles.search}>
          <Search className={styles.searchIcon} aria-hidden="true" strokeWidth={2} />
          <span className="visually-hidden">검색</span>
          <input type="search" placeholder="검색 (준비 중)" disabled className={styles.searchInput} />
        </label>
      </div>

      <div className={styles.scroll}>
        {showCard && dreamer.card ? (
          <section className={styles.card}>
            <h2 className={styles.title}>이 상상의 Dreamer</h2>
            <DreamerRow d={dreamer.card} showBio onFollow={(f) => dreamer.setFollowing(f)} />
          </section>
        ) : null}
        {detailId ? <SimilarBlock id={Number(detailId)} /> : null}

        {/* 이번 주 질문 (6-C): 질문이 있으면 질문 · 설명 · 남은 기간 · 답한 상상 수 → [상상하기] = 질문에 답하는 글쓰기 */}
        <section className={styles.card}>
          <Link to="/prompts" className={styles.titleLink} title="이번 주 질문 모두 보기">
            <h2 className={styles.title}>
              이번 주 질문
              {promptList && promptList.open.length > 0 ? <span className={styles.titleCount}> ({promptList.open.length}개)</span> : null}
            </h2>
            <ChevronRight aria-hidden="true" />
          </Link>
          {prompt ? (
            <>
              <strong className={prompts.question}>{prompt.title}</strong>
              {prompt.body ? <p className={prompts.body}>{prompt.body}</p> : null}
              <span className={prompts.meta}>
                {[leftLabel(prompt.ends_at), `답한 상상 ${prompt.answer_count}개`, `${prompt.answerer_count}명 참여`].filter(Boolean).join(" · ")}
              </span>
            </>
          ) : (
            <p className={styles.desc}>
              {prompt === undefined ? "불러오는 중…" : "운영자가 질문을 올리면 여기에 보여요. 질문에 답하듯 상상을 올려 보세요."}
            </p>
          )}
          {/* 2026-11-13: [자세히 보기](왼쪽, 인기 상상 "더 보기"와 같은 글자 버튼) · [상상하기](오른쪽 끝) */}
          <div className={styles.cardFoot}>
            {prompt ? (
              <Link to={`/prompts/${prompt.id}`} className={styles.more}>
                자세히 보기
              </Link>
            ) : (
              <span />
            )}
            {user ? (
              <ButtonLink to={prompt ? `/write?prompt=${prompt.id}` : "/write"} size="sm">
                상상하기
              </ButtonLink>
            ) : (
              <Button size="sm" onClick={() => openAuth("login")}>
                상상하기
              </Button>
            )}
          </div>
        </section>

        <section className={styles.card}>
          <h2 className={styles.title}>인기 상상</h2>
          {trending && trending.length > 0 ? (
            <ol className={styles.rankList}>
              {trending.map((item, i) => (
                <li key={item.id}>
                  <Link to={`/i/${item.id}`} className={styles.rankItem}>
                    <span className={styles.rankNo}>{i + 1}</span>
                    <span className={styles.rankText}>
                      <span className={styles.rankTitle}>{item.kind === "quote" ? item.body : item.display_title}</span>
                      <span className={styles.rankMeta}>
                        <span className={styles.rankAuthor}>{item.author.nickname}</span>
                        {/* 버튼 요약: 액션 바와 같은 순서 Thunder · Wave · 댓글 · Shake it */}
                        <span className={styles.rankStat} aria-label={`Thunder ${item.counts.thunders}`}>
                          <Zap aria-hidden="true" /> {item.counts.thunders}
                        </span>
                        <span className={styles.rankStat} aria-label={`Wave ${item.counts.waves}`}>
                          <WaveIcon aria-hidden="true" /> {item.counts.waves}
                        </span>
                        <span className={styles.rankStat} aria-label={`댓글 ${item.counts.comments}`}>
                          <MessageCircle aria-hidden="true" /> {item.counts.comments}
                        </span>
                        <span className={styles.rankStat} aria-label={`Shake it ${item.counts.shakes}`}>
                          <ShakeIcon aria-hidden="true" /> {item.counts.shakes}
                        </span>
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.empty}>{trending ? "최근 7일 동안 올라온 상상이 없어요." : "불러오는 중…"}</p>
          )}
          <Link to="/trending" className={styles.more}>
            더 보기
          </Link>
        </section>

        <section className={styles.card}>
          <h2 className={styles.title}>추천 Dreamer</h2>
          {dreamers && dreamers.length > 0 ? (
            <ul className={styles.dreamers}>
              {dreamers.map((d) => (
                <li key={d.author.id}>
                  <DreamerRow d={d} />
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>{dreamers ? "추천할 Dreamer 가 아직 없어요." : "불러오는 중…"}</p>
          )}
        </section>

        <section className={styles.card}>
          <h2 className={styles.title}>추천 주제</h2>
          {/* 주제 = 기술 태그 (2026-11-12 사용자 결정). 분야로 가는 길은 홈 분야 탭에 있다. + (관심 주제 추가)는 고도화 때 */}
          {topics && topics.length > 0 ? (
            <div className={styles.topics}>
              {topics.map((t) => (
                <Link key={t.name} to={tagPath(t)} className={styles.topic}>
                  #{t.label}
                </Link>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>{topics ? "아직 주제가 없어요." : "불러오는 중…"}</p>
          )}
          <Link to="/topics" className={styles.more}>
            더 많은 주제 보기
          </Link>
        </section>

        <div className={styles.footer}>
          <SiteFooter />
        </div>
      </div>
    </div>
  );
}

/** 아바타 · 닉네임 · @닉네임 (· 소개) …… [팔로우] (X "팔로우 추천" 줄) */
function DreamerRow({ d, showBio, onFollow }: { d: Dreamer; showBio?: boolean; onFollow?: (following: boolean) => void }) {
  return (
    <div className={styles.dreamer}>
      <Link to={`/@${d.author.nickname}`} className={styles.dreamerLink}>
        <Avatar name={d.author.nickname} src={d.author.avatar_url} size={40} />
        <span className={styles.dreamerText}>
          <span className={styles.dreamerName}>{d.author.nickname}</span>
          <span className={styles.dreamerHandle}>@{d.author.nickname}</span>
        </span>
      </Link>
      <FollowButton nickname={d.author.nickname} following={d.following} onChange={(r) => onFollow?.(r.following)} />
      {showBio && d.bio ? <p className={styles.dreamerBio}>{d.bio}</p> : null}
    </div>
  );
}
