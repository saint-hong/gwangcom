import { useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { FollowButton } from "../../components/social/FollowButton";
import { Avatar, Button, Tabs } from "../../design-system";
import { useAuth } from "../../hooks/useAuth";
import { usePaged } from "../../hooks/usePaged";
import type { FollowUser } from "../../types/api";
import feedStyles from "../home/HomePage.module.css";
import styles from "./FollowListPage.module.css";

export type FollowTab = "followers" | "following";
const TABS: { value: FollowTab; label: string }[] = [
  { value: "followers", label: "팔로워" },
  { value: "following", label: "팔로잉" },
];

/**
 * 팔로워 · 팔로잉 목록 — X 구조 (2026-11-10 사용자 캡처)
 *   [←] 닉네임 · @닉네임 / 탭 [팔로워 | 팔로잉]
 *   줄: 아바타 · 닉네임 · @닉네임 (나를 팔로우합니다) · 소개 …… [팔로잉] / [서로 팔로우하기] / [팔로우]
 * 팔로워 = 이 사람을 팔로우하는 계정, 팔로잉 = 이 사람이 팔로우하는 계정. 버튼은 보는 사람 기준.
 */
export function FollowListPage({ nickname, tab }: { nickname: string; tab: FollowTab }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const list = usePaged<FollowUser & { id: number }>(
    user === undefined ? null : `/api/users/${encodeURIComponent(nickname)}/${tab}`,
    user ? `u${user.id}` : "guest",
    "목록을 불러오지 못했어요.",
  );

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

  const isMe = user?.nickname === nickname;
  const emptyText =
    tab === "followers"
      ? isMe
        ? "아직 나를 팔로우하는 Dreamer 가 없어요."
        : "아직 이 Dreamer 를 팔로우하는 사람이 없어요."
      : isMe
        ? "아직 팔로우한 Dreamer 가 없어요. 오른쪽 추천 Dreamer 에서 시작해 보세요."
        : "아직 팔로우한 Dreamer 가 없어요.";

  return (
    <div>
      <PageHeader title={nickname} sub={`@${nickname}`} />
      <div className={styles.tabs}>
        <Tabs
          tabs={TABS}
          value={tab}
          onChange={(v) => navigate(`/@${nickname}/${v}`, { replace: true })}
          label="팔로우 목록"
        />
      </div>

      {list.items.map((f) => (
        <div key={f.author.id} className={styles.row}>
          <Link to={`/@${f.author.nickname}`} className={styles.avatar} aria-label={`${f.author.nickname} 프로필`}>
            <Avatar name={f.author.nickname} src={f.author.avatar_url} size={40} />
          </Link>
          <div className={styles.main}>
            <div className={styles.head}>
              <Link to={`/@${f.author.nickname}`} className={styles.names}>
                <span className={styles.name}>{f.author.nickname}</span>
                <span className={styles.handle}>
                  @{f.author.nickname}
                  {f.follows_me && f.author.id !== user?.id ? <span className={styles.followsMe}>나를 팔로우합니다</span> : null}
                </span>
              </Link>
              <FollowButton nickname={f.author.nickname} following={f.following} followsMe={f.follows_me} />
            </div>
            {f.bio ? <p className={styles.bio}>{f.bio}</p> : null}
          </div>
        </div>
      ))}

      {list.error ? (
        <div className={feedStyles.status}>
          <p>{list.error}</p>
          <Button size="sm" variant="outline" onClick={() => void list.retry()}>
            다시 불러오기
          </Button>
        </div>
      ) : list.loading || user === undefined ? (
        <p className={feedStyles.status}>불러오는 중…</p>
      ) : list.done && list.items.length === 0 ? (
        <p className={feedStyles.status}>{emptyText}</p>
      ) : null}
      <div ref={sentinel} aria-hidden="true" />
    </div>
  );
}
