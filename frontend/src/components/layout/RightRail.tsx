import { MessageCircle, Plus, Search, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../../api/client";
import { DOMAINS } from "../../brand";
import { Avatar, ButtonLink } from "../../design-system";
import { useAuth } from "../../hooks/useAuth";
import { useDreamerCard } from "../../hooks/useDreamerCard";
import type { Dreamer, Imagination, Page } from "../../types/api";
import { ShakeIcon } from "../actions/ShakeIcon";
import { WaveIcon } from "../actions/WaveIcon";
import { SimilarBlock } from "../similar/SimilarBlock";
import { FollowButton } from "../social/FollowButton";
import styles from "./RightRail.module.css";
import { SiteFooter } from "./SiteFooter";

/**
 * 오른쪽 컬럼 (로그인 전·후 같음, 기획안 v9 4장)
 *   검색창 → (상세 화면) 이 상상의 Dreamer → 비슷한 상상(F23) → 이번 주 질문 → 인기 상상 1~5 → 추천 Dreamer 3명 → 추천 주제 → 푸터
 * 이번 주 질문은 Sprint 6 에서 채운다.
 */
export function RightRail() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const dreamer = useDreamerCard();
  const [trending, setTrending] = useState<Imagination[] | null>(null);
  const [dreamers, setDreamers] = useState<Dreamer[] | null>(null);

  // 로그인 상태가 바뀌거나 다른 화면으로 가면 다시 불러온다 (팔로우하면 추천에서 빠지도록)
  useEffect(() => {
    if (user === undefined) return;
    api<Page<Imagination>>("/api/trending?limit=5").then((p) => setTrending(p.items), () => setTrending([]));
    api<Dreamer[]>("/api/users/recommended?limit=3").then(setDreamers, () => setDreamers([]));
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

        <section className={styles.card}>
          <h2 className={styles.title}>이번 주 질문</h2>
          <p className={styles.desc}>운영자가 질문을 올리면 여기에 보여요. 질문에 답하듯 상상을 올려 보세요.</p>
          <ButtonLink to="/write" size="sm" className={styles.cardButton}>
            상상하기
          </ButtonLink>
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
          <div className={styles.topics}>
            {DOMAINS.map((d) => (
              <Link key={d.slug} to={`/?domain=${d.slug}`} className={styles.topic}>
                {d.name}
                <Plus aria-hidden="true" />
              </Link>
            ))}
          </div>
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
