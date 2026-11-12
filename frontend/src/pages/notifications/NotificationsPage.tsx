import clsx from "clsx";
import { Bell, UserPlus, Zap } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import { ShakeIcon } from "../../components/actions/ShakeIcon";
import { WaveIcon } from "../../components/actions/WaveIcon";
import { ImaginationCard } from "../../components/card/ImaginationCard";
import { PageHeader } from "../../components/layout/PageHeader";
import { Avatar, Button, Tabs } from "../../design-system";
import { useAuth } from "../../hooks/useAuth";
import { usePaged } from "../../hooks/usePaged";
import { useUnread } from "../../hooks/useUnread";
import { dateLabel, itemPath } from "../../lib/actions";
import type { Notification } from "../../types/api";
import feedStyles from "../home/HomePage.module.css";
import styles from "./NotificationsPage.module.css";

type Tab = "all" | "comments";
const TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "comments", label: "댓글" },
];

/**
 * S13 알림 — X 알림 구조 (v10 반영목록 7장, etc_datas/x_로그인_알림상세_1)
 *   제목 "알림" + 탭 [전체 | 댓글] (X 의 [멘션] 자리. 멘션은 추후)
 *   Thunder · Wave · 팔로우 = 아이콘 줄 (누가 · 무엇을 · 글 앞부분)
 *   댓글 · 답글 · 인용 = 그 글 전체 + 액션 바 (바로 Thunder · 답글을 달 수 있게)
 * 화면을 열면 모두 읽음으로 바꾼다.
 */
export function NotificationsPage() {
  const { user, openAuth } = useAuth();
  const unread = useUnread();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "comments" ? "comments" : "all";
  const list = usePaged<Notification>(
    user ? `/api/notifications?tab=${tab}` : null,
    user ? `u${user.id}` : "guest",
    "알림을 불러오지 못했어요.",
  );

  // 첫 목록을 받은 뒤 모두 읽음 처리 (목록의 안 읽음 표시는 이번 화면에서는 그대로 보인다)
  const marked = useRef(false);
  useEffect(() => {
    if (!user || marked.current || list.loading || list.items.length === 0) return;
    marked.current = true;
    api("/api/notifications/read", { method: "POST" }).then(unread.clear, () => {});
  }, [user, list.loading, list.items.length, unread.clear]);

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
        <PageHeader title="알림" />
        <section className={feedStyles.empty}>
          <Bell className={feedStyles.emptyIcon} aria-hidden="true" strokeWidth={1.6} />
          <h1 className={feedStyles.emptyTitle}>로그인하면 알림을 받을 수 있어요</h1>
          <Button size="sm" onClick={() => openAuth("login")}>
            로그인
          </Button>
        </section>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="알림" />
      <div className={styles.tabs}>
        <Tabs tabs={TABS} value={tab} onChange={(v) => setParams(v === "all" ? {} : { tab: v }, { replace: true })} label="알림" />
      </div>

      {list.items.map((n) =>
        n.item && (n.type === "comment" || n.type === "reply" || n.type === "quote") ? (
          <div key={n.id} className={clsx(!n.read && styles.unread)}>
            <ImaginationCard data={n.item} onDeleted={list.remove} />
          </div>
        ) : (
          <NotificationRow key={n.id} n={n} />
        ),
      )}

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
        <section className={feedStyles.empty}>
          <Bell className={feedStyles.emptyIcon} aria-hidden="true" strokeWidth={1.6} />
          <h1 className={feedStyles.emptyTitle}>{tab === "comments" ? "아직 받은 댓글이 없어요" : "아직 알림이 없어요"}</h1>
          <p className={feedStyles.emptyText}>
            누군가 내 상상에 Thunder · Wave · 댓글을 남기거나 나를 팔로우하면 여기에 알려 드려요.
          </p>
        </section>
      ) : null}
      <div ref={sentinel} aria-hidden="true" />
    </div>
  );
}

const ICONS = {
  thunder: { icon: Zap, className: styles.thunder },
  wave: { icon: WaveIcon, className: styles.wave },
  follow: { icon: UserPlus, className: styles.follow },
  shaken: { icon: ShakeIcon, className: styles.shaken },
} as const;

/** Thunder · Wave · 팔로우 · Shake it — 아이콘 줄 (X 의 "님이 마음에 들어 합니다" 줄) */
function NotificationRow({ n }: { n: Notification }) {
  const actor = n.actor;
  if (!actor) return null;
  const kind =
    n.type === "thunder" || n.type === "wave" || n.type === "follow" || n.type === "shaken" ? n.type : null;
  if (!kind) return null;
  const { icon: Icon, className } = ICONS[kind];
  const target = n.item?.kind === "comment" ? "내 댓글" : "내 상상";
  const text =
    kind === "follow"
      ? "님이 나를 팔로우했어요"
      : kind === "shaken"
        ? "님의 상상과 내 상상이 섞였어요" // F8 "내 상상이 ○○님의 상상과 섞였어요"
      : kind === "thunder"
        ? `님이 ${target}에 Thunder 를 보냈어요`
        : `님이 ${target}을 Wave 했어요`;
  const href = n.item ? itemPath(n.item) : `/@${actor.nickname}`;
  return (
    <Link to={href} className={clsx(styles.row, !n.read && styles.unread)}>
      <span className={clsx(styles.typeIcon, className)}>
        <Icon aria-hidden="true" fill={kind === "thunder" ? "currentColor" : undefined} />
      </span>
      <span className={styles.content}>
        <Avatar name={actor.nickname} src={actor.avatar_url} size={32} />
        <span className={styles.line}>
          <b>{actor.nickname}</b>
          {text}
          <span className={styles.date}> · {dateLabel(n.created_at)}</span>
        </span>
        {n.item ? <span className={styles.snippet}>{n.item.kind === "comment" || n.item.kind === "quote" ? n.item.body : n.item.display_title}</span> : null}
      </span>
    </Link>
  );
}
