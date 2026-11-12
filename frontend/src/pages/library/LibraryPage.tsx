import { Bookmark, Clock, Zap } from "lucide-react";
import { ShakeIcon } from "../../components/actions/ShakeIcon";
import { WaveIcon } from "../../components/actions/WaveIcon";
import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { ImaginationCard } from "../../components/card/ImaginationCard";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button, Tabs } from "../../design-system";
import { useAuth } from "../../hooks/useAuth";
import { usePaged } from "../../hooks/usePaged";
import styles from "../home/HomePage.module.css";

type LibraryTab = "thunders" | "waves" | "shakes" | "bookmarks" | "recent";

// 순서: Thunder · Wave · Shake it · 북마크 · 최근 본 상상 (2026-11-10 사용자 지정)
const TABS: { value: LibraryTab; label: string }[] = [
  { value: "thunders", label: "Thunder" },
  { value: "waves", label: "Wave" },
  { value: "shakes", label: "Shake it" },
  { value: "bookmarks", label: "북마크" },
  { value: "recent", label: "최근 본 상상" },
];

const EMPTY = {
  bookmarks: { icon: Bookmark, title: "아직 북마크한 상상이 없어요", text: "다시 보고 싶은 상상과 댓글에서 북마크를 눌러 보세요." },
  thunders: { icon: Zap, title: "아직 Thunder 를 누른 상상이 없어요", text: "번뜩이는 상상을 만나면 번개를 눌러 보세요." },
  waves: {
    icon: WaveIcon,
    title: "아직 Wave 한 상상이 없어요",
    text: "퍼뜨리고 싶은 상상과 댓글에서 Wave 를 눌러 보세요. 내 팔로워에게 퍼져 나가요.",
  },
  shakes: {
    icon: ShakeIcon,
    title: "아직 Shake it 한 기록이 없어요",
    text: "다른 Dreamer 의 상상과 내 상상을 섞으면 여기에 모여요. Shake it 은 Sprint 5 에서 열려요.",
  },
  recent: { icon: Clock, title: "아직 열어 본 상상이 없어요", text: "상상을 열어 보면 여기에 최근 순으로 모여요 (최대 100개)." },
} as const;

/**
 * S12 내 서재 (하이젠버그 내 서재 구조, 기획안 v9 F7)
 *   [←] 서재 + 탭 [Thunder | Wave | Shake it | 북마크 | 최근 본 상상] (고른 폭)
 * Thunder = 상상만, Wave · 북마크 = 상상 + 댓글, Shake it = 내가 섞어 만든 혼합 글(Sprint 5 전에는 빈 목록). 본인만 볼 수 있다.
 */
export function LibraryPage() {
  const { user, openAuth } = useAuth();
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: LibraryTab = TABS.some((t) => t.value === raw) ? (raw as LibraryTab) : "thunders";
  const list = usePaged(user ? `/api/me/library?tab=${tab}` : null, user ? `u${user.id}` : "guest", "서재를 불러오지 못했어요.");

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && list.loadMore(), {
      rootMargin: "400px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [list.loadMore]);

  if (user === null) {
    return (
      <div>
        <PageHeader title="서재" />
        <section className={styles.empty}>
          <Bookmark className={styles.emptyIcon} aria-hidden="true" strokeWidth={1.6} />
          <h1 className={styles.emptyTitle}>로그인하면 서재를 쓸 수 있어요</h1>
          <p className={styles.emptyText}>Thunder · Wave 한 상상, Shake it 기록, 북마크, 최근 본 상상이 여기에 모여요.</p>
          <Button size="sm" onClick={() => openAuth("login")}>
            로그인
          </Button>
        </section>
      </div>
    );
  }

  const empty = EMPTY[tab];
  const EmptyIcon = empty.icon;
  return (
    <div>
      <PageHeader title="서재" />
      <div className={styles.tabBar}>
        <Tabs
          tabs={TABS}
          value={tab}
          onChange={(v) => setParams(v === "thunders" ? {} : { tab: v }, { replace: true })}
          label="서재"
          even
        />
      </div>

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
        <section className={styles.empty}>
          <EmptyIcon className={styles.emptyIcon} aria-hidden="true" strokeWidth={1.6} />
          <h1 className={styles.emptyTitle}>{empty.title}</h1>
          <p className={styles.emptyText}>{empty.text}</p>
        </section>
      ) : null}
      <div ref={sentinel} aria-hidden="true" />
    </div>
  );
}
