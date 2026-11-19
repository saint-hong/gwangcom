import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { ImaginationCard } from "../../components/card/ImaginationCard";
import { PageHeader } from "../../components/layout/PageHeader";
import { SearchBox } from "../../components/search/SearchBox";
import { FollowButton } from "../../components/social/FollowButton";
import { tagPath } from "../../components/tags/TagList";
import { Avatar, Button, Tabs, TagPill } from "../../design-system";
import { useAuth } from "../../hooks/useAuth";
import { usePaged } from "../../hooks/usePaged";
import type { FollowUser, Imagination, SearchDreamers, SearchImaginations, SearchTopics } from "../../types/api";
import feedStyles from "../home/HomePage.module.css";
import rowStyles from "../profile/FollowListPage.module.css";
import styles from "./SearchPage.module.css";

type SearchTab = "imaginations" | "topics" | "dreamers";
const TABS: { value: SearchTab; label: string }[] = [
  { value: "imaginations", label: "상상" },
  { value: "topics", label: "주제" },
  { value: "dreamers", label: "Dreamer" },
];

/**
 * 검색 (Sprint 7 홈 검색, 2026-11-19 사용자 결정) — /search?q=검색어&tab=
 *   [←] 검색 / 검색창 / 탭 [상상 | 주제 | Dreamer]
 *   상상: 글자가 맞는 상상 → 글자는 다르지만 뜻이 비슷한 상상, 한 목록 (무한 스크롤)
 *   주제: #주제 알약 + 상상 수 → 태그별 상상 (이름이 맞는 주제 → 검색된 상상에 많이 쓰인 주제, 한 목록) / Dreamer: 팔로워 목록과 같은 줄
 */
export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = (params.get("q") ?? "").trim();
  const raw = params.get("tab");
  const tab: SearchTab = raw === "topics" || raw === "dreamers" ? raw : "imaginations";

  return (
    <div>
      <PageHeader title="검색" />
      <div className={styles.box}>
        <SearchBox autoFocus={!q} />
      </div>
      {q ? (
        <>
          <div className={styles.tabs}>
            <Tabs
              tabs={TABS}
              value={tab}
              even
              label="검색 결과 종류"
              onChange={(v) => setParams(v === "imaginations" ? { q } : { q, tab: v }, { replace: true })}
            />
          </div>
          {tab === "imaginations" ? <ImaginationResults q={q} /> : null}
          {tab === "topics" ? <TopicResults q={q} /> : null}
          {tab === "dreamers" ? <DreamerResults q={q} /> : null}
        </>
      ) : (
        <p className={feedStyles.status}>찾고 싶은 상상 · 주제 · Dreamer 를 입력해 보세요.</p>
      )}
    </div>
  );
}

function useSentinel(loadMore: () => void) {
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && loadMore(), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);
  return sentinel;
}

function ImaginationResults({ q }: { q: string }) {
  const { user } = useAuth();
  const list = usePaged<Imagination, SearchImaginations>(
    user === undefined ? null : `/api/search/imaginations?q=${encodeURIComponent(q)}`,
    user ? `u${user.id}` : "guest",
    "검색하지 못했어요.",
  );
  const sentinel = useSentinel(list.loadMore);
  const total = list.head?.total;

  return (
    <div>
      {total ? <p className={styles.count}>상상 {total}개</p> : null}
      {/* 글자가 맞는 상상 → 뜻이 비슷한 상상 순서로 한 목록 (구분 줄 없음, 2026-11-19 사용자) */}
      {list.items.map((item) => (
        <ImaginationCard key={item.id} data={item} onDeleted={list.remove} />
      ))}
      <ListStatus list={list} waiting={user === undefined} empty={`"${q}"에 맞는 상상이 아직 없어요. 다른 말로 찾아보세요.`} />
      <div ref={sentinel} aria-hidden="true" />
    </div>
  );
}

function TopicResults({ q }: { q: string }) {
  const [data, setData] = useState<SearchTopics | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    api<SearchTopics>(`/api/search/topics?q=${encodeURIComponent(q)}`).then(
      (d) => alive && setData(d),
      (e) => alive && setError(e instanceof ApiError ? e.message : "검색하지 못했어요."),
    );
    return () => {
      alive = false;
    };
  }, [q]);

  if (error) return <p className={feedStyles.status}>{error}</p>;
  if (!data) return <p className={feedStyles.status}>불러오는 중…</p>;
  // 이름이 맞는 주제 → 상상 검색 결과에 많이 쓰인 주제(관련 주제) 순서로 한 목록 (구분 줄 없음, 2026-11-19 사용자)
  const all = [...data.items, ...data.related];
  if (all.length === 0) return <p className={feedStyles.status}>{`"${q}"와 관련된 주제가 아직 없어요.`}</p>;
  return (
    <div>
      <p className={styles.count}>주제 {all.length}개</p>
      <TopicPills items={all} />
    </div>
  );
}

function TopicPills({ items }: { items: SearchTopics["items"] }) {
  return (
    <ul className={styles.topics}>
      {items.map((t) => (
        <li key={t.name}>
          <TagPill to={tagPath(t)}>
            #{t.label}
            <span className={styles.topicCount}>{t.count}</span>
          </TagPill>
        </li>
      ))}
    </ul>
  );
}

function DreamerResults({ q }: { q: string }) {
  const { user } = useAuth();
  const list = usePaged<FollowUser & { id: number }, SearchDreamers>(
    user === undefined ? null : `/api/search/dreamers?q=${encodeURIComponent(q)}`,
    user ? `u${user.id}` : "guest",
    "검색하지 못했어요.",
  );
  const sentinel = useSentinel(list.loadMore);
  const total = list.head?.total;

  return (
    <div>
      {total ? <p className={styles.count}>Dreamer {total}명</p> : null}
      {list.items.map((f) => (
        <div key={f.author.id} className={rowStyles.row}>
          <Link to={`/@${f.author.nickname}`} className={rowStyles.avatar} aria-label={`${f.author.nickname} 프로필`}>
            <Avatar name={f.author.nickname} src={f.author.avatar_url} size={40} />
          </Link>
          <div className={rowStyles.main}>
            <div className={rowStyles.head}>
              <Link to={`/@${f.author.nickname}`} className={rowStyles.names}>
                <span className={rowStyles.name}>{f.author.nickname}</span>
                <span className={rowStyles.handle}>
                  @{f.author.nickname}
                  {f.follows_me && f.author.id !== user?.id ? <span className={rowStyles.followsMe}>나를 팔로우합니다</span> : null}
                </span>
              </Link>
              {f.author.id !== user?.id ? (
                <FollowButton nickname={f.author.nickname} following={f.following} followsMe={f.follows_me} />
              ) : null}
            </div>
            {f.bio ? <p className={rowStyles.bio}>{f.bio}</p> : null}
          </div>
        </div>
      ))}
      <ListStatus list={list} waiting={user === undefined} empty={`"${q}"에 맞는 Dreamer 가 아직 없어요.`} />
      <div ref={sentinel} aria-hidden="true" />
    </div>
  );
}

type ListState = { error: string | null; loading: boolean; done: boolean; items: unknown[]; retry: () => unknown };

function ListStatus({ list, waiting, empty }: { list: ListState; waiting: boolean; empty: string }) {
  if (list.error) {
    return (
      <div className={feedStyles.status}>
        <p>{list.error}</p>
        <Button size="sm" variant="outline" onClick={() => void list.retry()}>
          다시 불러오기
        </Button>
      </div>
    );
  }
  if (list.loading || waiting) return <p className={feedStyles.status}>불러오는 중…</p>;
  if (list.done && list.items.length === 0) return <p className={feedStyles.status}>{empty}</p>;
  return null;
}
