import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { ImaginationCard } from "../../components/card/ImaginationCard";
import { PageHeader } from "../../components/layout/PageHeader";
import { FollowButton } from "../../components/social/FollowButton";
import { Avatar, Button, Tabs } from "../../design-system";
import { useAuth } from "../../hooks/useAuth";
import { usePaged } from "../../hooks/usePaged";
import type { Profile } from "../../types/api";
import feedStyles from "../home/HomePage.module.css";
import { EditProfileModal } from "./EditProfileModal";
import styles from "./ProfilePage.module.css";

type ProfileTab = "posts" | "comments" | "quotes";
const TABS: { value: ProfileTab; label: string }[] = [
  { value: "posts", label: "상상" },
  { value: "comments", label: "댓글" },
  { value: "quotes", label: "인용" },
];

const EMPTY: Record<ProfileTab, { title: string; text: string }> = {
  posts: { title: "아직 올린 상상이 없어요", text: "오늘 상상한 미래의 모습을 사람들과 공유해 보세요." },
  comments: { title: "아직 단 댓글이 없어요", text: "다른 Dreamer 의 상상에 생각을 남겨 보세요." },
  quotes: { title: "아직 인용한 상상이 없어요", text: "다른 Dreamer 의 상상에 내 생각을 더하려면 Wave > 인용하기를 눌러 보세요." },
};

/**
 * S11 프로필 — X 프로필 구조 (v10 반영목록 7장, etc_datas/x_로그인_프로필상세_*)
 *   [←] 닉네임 · 상상 N개 → 커버 → 큰 아바타 · [프로필 수정] / [팔로우]
 *   → 닉네임 · (운영자) · @닉네임 → 소개 → 팔로잉 N · 팔로워 N → 탭 [상상 | 댓글 | 인용] (Wave 는 서재에서)
 *   위치 · 가입일 · 인증 배지 · 미디어 탭은 없다.
 */
export function ProfilePage({ nickname }: { nickname: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const raw = params.get("tab");
  const tab: ProfileTab = raw === "comments" || raw === "quotes" ? raw : "posts";
  const authKey = user ? `u${user.id}` : "guest";
  const list = usePaged(
    user === undefined ? null : `/api/users/${encodeURIComponent(nickname)}/imaginations?tab=${tab}`,
    authKey,
  );

  useEffect(() => {
    if (user === undefined) return;
    setError(null);
    api<Profile>(`/api/users/${encodeURIComponent(nickname)}`).then(setProfile, (e) => {
      setProfile(null);
      setError(e instanceof ApiError ? e.message : "불러오지 못했어요.");
    });
  }, [nickname, user]);

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

  if (!profile) {
    return (
      <div>
        <PageHeader title={nickname} />
        <p className={styles.status}>{error ?? "불러오는 중…"}</p>
      </div>
    );
  }

  const empty = EMPTY[tab];
  return (
    <div>
      <PageHeader title={profile.nickname} sub={`상상 ${profile.counts.posts}개`} />

      <div className={styles.cover}>{profile.cover_url ? <img src={profile.cover_url} alt="" /> : null}</div>
      <div className={styles.head}>
        <div className={styles.avatarRow}>
          <span className={styles.avatar}>
            <Avatar name={profile.nickname} src={profile.avatar_url} size={120} />
          </span>
          {profile.is_me ? (
            <button type="button" className={styles.editButton} onClick={() => setEditing(true)}>
              프로필 수정
            </button>
          ) : (
            <FollowButton
              nickname={profile.nickname}
              following={profile.following}
              size="md"
              onChange={(r) =>
                setProfile((p) => (p ? { ...p, following: r.following, counts: { ...p.counts, followers: r.followers } } : p))
              }
            />
          )}
        </div>
        <h2 className={styles.name}>
          {profile.nickname}
          {profile.is_operator ? <span className={styles.operator}>운영자</span> : null}
        </h2>
        <p className={styles.handle}>@{profile.nickname}</p>
        {profile.bio ? <p className={styles.bio}>{profile.bio}</p> : null}
        <p className={styles.counts}>
          <Link to={`/@${profile.nickname}/following`}>
            <b>{profile.counts.following}</b> 팔로잉
          </Link>
          <Link to={`/@${profile.nickname}/followers`}>
            <b>{profile.counts.followers}</b> 팔로워
          </Link>
        </p>
      </div>

      <div className={styles.tabs}>
        <Tabs
          tabs={TABS}
          value={tab}
          onChange={(v) => setParams(v === "posts" ? {} : { tab: v }, { replace: true })}
          label="프로필"
        />
      </div>

      {list.items.map((item) => (
        <ImaginationCard key={`${tab}-${item.id}`} data={item} onDeleted={list.remove} />
      ))}
      {list.error ? (
        <div className={feedStyles.status}>
          <p>{list.error}</p>
          <Button size="sm" variant="outline" onClick={() => void list.retry()}>
            다시 불러오기
          </Button>
        </div>
      ) : list.loading ? (
        <p className={feedStyles.status}>불러오는 중…</p>
      ) : list.done && list.items.length === 0 ? (
        <section className={feedStyles.empty}>
          <h1 className={feedStyles.emptyTitle}>{empty.title}</h1>
          <p className={feedStyles.emptyText}>{empty.text}</p>
        </section>
      ) : null}
      <div ref={sentinel} aria-hidden="true" />

      {editing && user ? (
        <EditProfileModal
          me={user}
          onClose={() => setEditing(false)}
          onSaved={(me) => {
            setEditing(false);
            if (me.nickname !== profile.nickname) navigate(`/@${me.nickname}`, { replace: true });
            else setProfile({ ...profile, bio: me.bio, avatar_url: me.avatar_url, cover_url: me.cover_url });
          }}
        />
      ) : null}
    </div>
  );
}
