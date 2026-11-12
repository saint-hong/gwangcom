import clsx from "clsx";
import { Bookmark, MessageCircle, Share, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { IconButton } from "../../design-system";
import { useAuth } from "../../hooks/useAuth";
import { itemPath, reasonMessage } from "../../lib/actions";
import type { ActionKey, Actions, Imagination, ReactionResult } from "../../types/api";
import { useToast } from "../feedback/Toast";
import styles from "./ActionBar.module.css";
import { QuoteModal } from "./QuoteModal";
import { ShakeButton } from "./ShakeButton";
import { ShakeModal } from "./ShakeModal";
import { WaveMenu } from "./WaveMenu";

type Reaction = "thunder" | "wave" | "bookmark";

type Props = {
  item: Imagination;
  /** 댓글 버튼을 눌렀을 때 (상세: 입력창으로 이동 · 댓글: 답글 입력창). 없으면 상세의 댓글 위치로 간다 */
  onComment?: () => void;
};

/**
 * 게시물 액션 바 (기획안 v9 5장) — 상상과 댓글에 똑같이 붙는다 (v10 반영목록 3-3)
 *   [⚡ Thunder] [≈ Wave] [💬 댓글] [Shake it]   ……   [북마크] [공유]
 * - 모두 배경 없는 선 아이콘 + 숫자. 글자·툴팁 없음 (스크린리더용 이름만)
 * - 마우스를 올려도 색·배경은 바뀌지 않고 각자 움직이기만 한다. 켜졌을 때만 색: Thunder 노랑 · Wave 파랑 · 북마크 보라
 * - 쓸 수 있는지는 서버가 내려준 actions, 이미 눌렀는지는 my 로 정한다. 화면은 다시 계산하지 않는다.
 * - 누르면 바로 바꿔 그리고(서버 응답을 기다리지 않음), 실패하면 되돌린다.
 */
export function ActionBar({ item, onComment }: Props) {
  const { openAuth } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { actions } = item;
  const [my, setMy] = useState(item.my);
  const [counts, setCounts] = useState(item.counts);
  const [burst, setBurst] = useState<Reaction | null>(null); // 켜질 때 한 번 움직임
  const [quoting, setQuoting] = useState(false);
  const [shaking, setShaking] = useState(false);

  // 새로 불러온 글이면 전부 맞추고, 부모가 댓글 수만 바꾸면(댓글을 달거나 지움) 댓글 수만 맞춘다.
  // (댓글 수 때문에 내가 방금 누른 Thunder 등이 옛 값으로 돌아가지 않게)
  useEffect(() => {
    setMy(item.my);
    setCounts(item.counts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.my]);
  useEffect(() => {
    setCounts((c) => ({ ...c, comments: item.counts.comments }));
  }, [item.counts.comments]);

  /** 쓸 수 없으면 안내(로그인 전이면 로그인 모달)하고 false */
  const allowed = (key: ActionKey) => {
    const state = actions[key];
    if (state.allowed) return true;
    if (state.reason === "login_required") openAuth("login");
    else toast.show(reasonMessage(key, state));
    return false;
  };

  const toggle = async (kind: Reaction) => {
    const on = !my[kind];
    if (on && !allowed(kind)) return;
    const countKey = kind === "thunder" ? "thunders" : kind === "wave" ? "waves" : null;
    const before = { my, counts };
    setMy({ ...my, [kind]: on });
    if (countKey) setCounts({ ...counts, [countKey]: Math.max(0, counts[countKey] + (on ? 1 : -1)) });
    if (on) setBurst(kind);
    try {
      // 팔로잉 탭에서 다른 사람의 Wave 를 보고 Wave 하면 그 사람을 확산 경로(via)로 남긴다 (F6)
      const via = kind === "wave" && on && item.waved_by ? { via_user_id: item.waved_by.id } : undefined;
      const res = await api<ReactionResult>(`/api/imaginations/${item.id}/${kind}`, {
        method: on ? "POST" : "DELETE",
        json: via,
      });
      setMy(res.my);
      setCounts(res.counts);
      // 북마크는 켜고 꺼도 안내 메시지를 띄우지 않는다 (2026-11-10 사용자 지정) — 보라색으로 채워지는 것만으로 충분
    } catch (e) {
      setMy(before.my);
      setCounts(before.counts);
      if (e instanceof ApiError && e.status === 401) openAuth("login");
      else toast.show(e instanceof ApiError ? e.message : "잠시 후 다시 시도해 주세요.");
    }
  };

  const comment = () => {
    if (onComment) onComment();
    else navigate(`${itemPath(item)}${item.kind === "comment" ? "" : "#comments"}`);
  };

  const share = async () => {
    const url = `${window.location.origin}${itemPath(item)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.show("링크를 복사했어요.");
    } catch {
      toast.show(url);
    }
  };

  const blocked = (key: keyof Actions) => (actions[key].allowed ? undefined : true);

  return (
    <div className={styles.bar}>
      <div className={styles.main}>
        <IconButton
          icon={Zap}
          label="Thunder"
          count={counts.thunders}
          size="sm"
          active={my.thunder}
          color="var(--color-thunder)"
          fillWhenActive
          className={styles.thunder}
          iconClassName={clsx(burst === "thunder" && styles.thunderOn)}
          onAnimationEnd={() => setBurst(null)}
          aria-disabled={my.thunder ? undefined : blocked("thunder")}
          onClick={() => void toggle("thunder")}
        />
        <WaveMenu
          waved={my.wave}
          count={counts.waves}
          burst={burst === "wave"}
          onBurstEnd={() => setBurst(null)}
          blocked={!actions.wave.allowed && !actions.quote.allowed}
          onWave={() => void toggle("wave")}
          onQuote={() => allowed("quote") && setQuoting(true)}
          onBlocked={() => allowed("wave")}
        />
        <IconButton
          icon={MessageCircle}
          label={item.kind === "comment" ? "답글" : "댓글"}
          count={counts.comments}
          size="sm"
          className={styles.comment}
          aria-disabled={blocked("comment")}
          onClick={() => allowed("comment") && comment()}
        />
        <ShakeButton count={counts.shakes} aria-disabled={blocked("shake")} onClick={() => allowed("shake") && setShaking(true)} />
      </div>
      <div className={styles.side}>
        <IconButton
          icon={Bookmark}
          label="북마크"
          size="sm"
          active={my.bookmark}
          color="var(--color-accent)"
          fillWhenActive
          className={styles.bookmark}
          aria-disabled={blocked("bookmark")}
          onClick={() => void toggle("bookmark")}
        />
        <IconButton icon={Share} label="공유" size="sm" className={styles.share} onClick={() => void share()} />
      </div>
      {quoting ? <QuoteModal item={item} onClose={() => setQuoting(false)} /> : null}
      {shaking ? <ShakeModal target={item} onClose={() => setShaking(false)} /> : null}
    </div>
  );
}
