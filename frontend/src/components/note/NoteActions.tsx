import clsx from "clsx";
import { Bookmark, Share, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { api, ApiError } from "../../api/client";
import { IconButton } from "../../design-system";
import { useAuth } from "../../hooks/useAuth";
import type { NoteCard, NoteReaction } from "../../types/api";
import bar from "../actions/ActionBar.module.css";
import { WaveIcon } from "../actions/WaveIcon";
import { useToast } from "../feedback/Toast";

type Kind = "thunder" | "wave" | "bookmark";

/**
 * Observe Note 반응 줄 (2026-11-17 사용자 요청) — 상상 액션 바와 같은 아이콘 · 색 · 움직임
 *   [⚡ Thunder] [≈ Wave] …… [북마크] [공유]   (댓글 · Shake it · 인용은 노트에 없음)
 * - 쓸 수 있는지는 서버가 내려준 actions (로그인 전이면 로그인 창). 누르면 바로 바꿔 그리고, 실패하면 되돌린다
 * - Wave 하면 내 팔로워의 팔로잉 탭에 "○○님이 Wave함"으로 보인다 (2026-11-17)
 */
export function NoteActions({ note, extra, viaUserId }: { note: NoteCard; extra?: React.ReactNode; viaUserId?: number }) {
  const { openAuth } = useAuth();
  const toast = useToast();
  const [my, setMy] = useState(note.my);
  const [counts, setCounts] = useState(note.counts);
  const [burst, setBurst] = useState<Kind | null>(null);

  useEffect(() => {
    setMy(note.my);
    setCounts(note.counts);
  }, [note.id, note.my, note.counts]);

  const toggle = async (kind: Kind) => {
    const on = !my[kind];
    if (on && note.actions && !note.actions[kind].allowed) {
      openAuth("login");
      return;
    }
    const key = kind === "thunder" ? "thunders" : kind === "wave" ? "waves" : "bookmarks";
    const before = { my, counts };
    setMy({ ...my, [kind]: on });
    setCounts({ ...counts, [key]: Math.max(0, counts[key] + (on ? 1 : -1)) });
    if (on) setBurst(kind);
    try {
      // 팔로잉 탭에서 다른 사람의 Wave 를 보고 Wave 하면 그 사람을 확산 경로(via)로 남긴다
      const via = kind === "wave" && on && viaUserId ? { via_user_id: viaUserId } : undefined;
      const res = await api<NoteReaction>(`/api/notes/${note.id}/${kind}`, { method: on ? "POST" : "DELETE", json: via });
      setMy(res.my);
      setCounts(res.counts);
      if (kind === "wave" && on) toast.show("Wave 했어요.");
    } catch (e) {
      setMy(before.my);
      setCounts(before.counts);
      if (e instanceof ApiError && e.status === 401) openAuth("login");
      else toast.show(e instanceof ApiError ? e.message : "잠시 후 다시 시도해 주세요.");
    }
  };

  const share = async () => {
    const url = `${window.location.origin}/notes/${note.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.show("링크를 복사했어요.");
    } catch {
      toast.show(url);
    }
  };

  const blocked = (k: Kind) => (note.actions && !note.actions[k].allowed && !my[k] ? true : undefined);
  return (
    <div className={bar.bar} onClick={(e) => e.stopPropagation()}>
      <div className={bar.main}>
        <IconButton
          icon={Zap}
          label="Thunder"
          count={counts.thunders}
          size="sm"
          active={my.thunder}
          color="var(--color-thunder)"
          fillWhenActive
          className={bar.thunder}
          iconClassName={clsx(burst === "thunder" && bar.thunderOn)}
          onAnimationEnd={() => setBurst(null)}
          aria-disabled={blocked("thunder")}
          onClick={() => void toggle("thunder")}
        />
        <IconButton
          icon={WaveIcon}
          label="Wave"
          count={counts.waves}
          size="sm"
          active={my.wave}
          color="var(--color-wave)"
          className={bar.wave}
          iconClassName={clsx(burst === "wave" && bar.waveOn)}
          onAnimationEnd={() => setBurst(null)}
          aria-disabled={blocked("wave")}
          onClick={() => void toggle("wave")}
        />
        {extra}
      </div>
      <div className={bar.side}>
        <IconButton
          icon={Bookmark}
          label="북마크"
          size="sm"
          active={my.bookmark}
          color="var(--color-accent)"
          fillWhenActive
          className={bar.bookmark}
          aria-disabled={blocked("bookmark")}
          onClick={() => void toggle("bookmark")}
        />
        <IconButton icon={Share} label="공유" size="sm" className={bar.share} onClick={() => void share()} />
      </div>
    </div>
  );
}
