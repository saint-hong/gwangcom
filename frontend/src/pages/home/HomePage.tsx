import { PromptBanner } from "../../components/prompt/PromptBanner";
import { Sparkles, UsersRound } from "lucide-react";
import { useEffect, useRef } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { DOMAINS } from "../../brand";
import { ImaginationCard } from "../../components/card/ImaginationCard";
import { DomainChips } from "../../components/feed/DomainChips";
import { ImaginePrompt } from "../../components/feed/ImaginePrompt";
import { Button, ButtonLink, Tabs } from "../../design-system";
import { useAuth } from "../../hooks/useAuth";
import { useFeed, type FeedTab } from "../../hooks/useFeed";
import type { Imagination } from "../../types/api";
import styles from "./HomePage.module.css";

const GUEST_TABS = [{ value: "", label: "추천" }, ...DOMAINS.map((d) => ({ value: d.slug, label: d.name }))];
const MEMBER_TABS = [
  { value: "recommended", label: "추천" },
  { value: "following", label: "팔로잉" },
  { value: "latest", label: "최신" },
];

/**
 * S1 홈 피드 (하이젠버그 구조, 기획안 v9 F3)
 *   로그인 전: 분야 탭 한 줄 [추천|AI|Semiconductor|…]
 *   로그인 후: [추천|팔로잉|최신] + 분야 칩 줄 + 상상하기 유도 영역 (X)
 *   추천 = 최근 7일 인기 점수 순, 팔로잉 = 팔로우한 사람의 상상 + Wave (Sprint 3)
 * 탭·분야는 주소(?tab=&domain=)에 남겨서 오른쪽 "추천 주제"에서도 들어올 수 있게 한다.
 */
export function HomePage() {
  const { user, openAuth } = useAuth();
  const [params, setParams] = useSearchParams();
  const domain = params.get("domain");
  const tab = (user ? (params.get("tab") as FeedTab | null) : null) ?? "recommended";
  const feed = useFeed(tab, domain, user ? `u${user.id}` : "guest");
  // Shake it 으로 방금 올린 혼합 글 — 최신 탭 맨 위에 강조해서 보여 준다 (F8)
  const navigate = useNavigate();
  const shaken = (useLocation().state as { shaken?: Imagination } | null)?.shaken;
  const fresh = shaken && tab === "latest" && !domain ? shaken : null;
  const items = fresh ? feed.items.filter((i) => i.id !== fresh.id) : feed.items;

  const update = (next: { tab?: string | null; domain?: string | null }) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p, { replace: true });
  };

  // 목록 끝이 보이면 다음 20개
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && feed.loadMore(), {
      rootMargin: "400px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [feed.loadMore]);

  return (
    <div>
      <div className={styles.tabBar}>
        {user ? (
          <>
            <Tabs tabs={MEMBER_TABS} value={tab} onChange={(v) => update({ tab: v === "recommended" ? null : v })} label="피드" />
            <DomainChips value={domain} onChange={(d) => update({ domain: d })} />
          </>
        ) : (
          <Tabs tabs={GUEST_TABS} value={domain ?? ""} onChange={(v) => update({ domain: v || null })} label="분야" />
        )}
      </div>

      <PromptBanner />
      {user ? <ImaginePrompt user={user} /> : null}

      {tab === "following" && feed.done && feed.items.length === 0 && !feed.error ? (
        <section className={styles.empty}>
          <UsersRound className={styles.emptyIcon} aria-hidden="true" strokeWidth={1.6} />
          <h1 className={styles.emptyTitle}>아직 팔로우한 Dreamer 가 없어요</h1>
          <p className={styles.emptyText}>
            마음에 드는 Dreamer 를 팔로우하면 그 사람의 상상과 Wave 가 여기에 모여요. 오른쪽 "추천 Dreamer" 에서 시작해 보세요.
          </p>
        </section>
      ) : (
        <>
          {fresh ? <ImaginationCard
              key={`fresh-${fresh.id}`}
              data={fresh}
              fresh
              onDeleted={() => navigate("/?tab=latest", { replace: true, state: null })}
            /> : null}
          {items.map((item) => (
            <ImaginationCard key={item.id} data={item} onDeleted={feed.remove} />
          ))}

          {feed.error ? (
            <div className={styles.status}>
              <p>{feed.error}</p>
              <Button size="sm" variant="outline" onClick={() => void feed.retry()}>
                다시 불러오기
              </Button>
            </div>
          ) : feed.loading ? (
            <p className={styles.status}>불러오는 중…</p>
          ) : feed.done && feed.items.length === 0 ? (
            <section className={styles.empty}>
              <Sparkles className={styles.emptyIcon} aria-hidden="true" strokeWidth={1.6} />
              <h1 className={styles.emptyTitle}>아직 올라온 상상이 없어요</h1>
              <p className={styles.emptyText}>가까운 미래에 어떤 기술이 우리 삶을 바꿀까요? 첫 번째 상상을 올려 보세요.</p>
              {user ? (
                <ButtonLink to="/write" size="sm">
                  상상하기
                </ButtonLink>
              ) : (
                <Button size="sm" onClick={() => openAuth("signup")}>
                  가입하고 상상하기
                </Button>
              )}
            </section>
          ) : feed.done ? (
            <p className={styles.status}>모두 불러왔어요</p>
          ) : null}
          <div ref={sentinel} aria-hidden="true" />
        </>
      )}
    </div>
  );
}
