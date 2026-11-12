import clsx from "clsx";
import { useEffect, useState } from "react";
import { api, ApiError } from "../../api/client";
import { useAuth } from "../../hooks/useAuth";
import type { FollowResult } from "../../types/api";
import { useToast } from "../feedback/Toast";
import styles from "./FollowButton.module.css";

type Props = {
  nickname: string;
  following: boolean;
  size?: "sm" | "md";
  /** 이 사람이 나를 팔로우하는데 나는 안 하면 [서로 팔로우하기] (X 팔로워 목록) */
  followsMe?: boolean;
  onChange?: (result: FollowResult) => void;
};

/**
 * [팔로우] ↔ [팔로잉] (X 방식: 팔로잉 상태에서 마우스를 올리면 [언팔로우]).
 * 누르면 바로 바꾸고 실패하면 되돌린다. 로그인 전이면 로그인 모달. 내 자신에게는 쓰지 않는다.
 */
export function FollowButton({ nickname, following: initial, size = "sm", followsMe = false, onChange }: Props) {
  const { user, openAuth } = useAuth();
  const toast = useToast();
  const [following, setFollowing] = useState(initial);
  const [busy, setBusy] = useState(false);

  useEffect(() => setFollowing(initial), [initial]);

  if (user && user.nickname === nickname) return null;

  const click = async () => {
    if (!user) {
      openAuth("login");
      return;
    }
    const next = !following;
    setFollowing(next);
    setBusy(true);
    try {
      const res = await api<FollowResult>(`/api/users/${encodeURIComponent(nickname)}/follow`, {
        method: next ? "POST" : "DELETE",
      });
      setFollowing(res.following);
      onChange?.(res);
    } catch (e) {
      setFollowing(!next);
      toast.show(e instanceof ApiError ? e.message : "잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={clsx(styles.button, styles[size], following ? styles.following : styles.follow)}
      aria-pressed={following}
      disabled={busy}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void click();
      }}
    >
      <span className={styles.idle}>{following ? "팔로잉" : followsMe ? "서로 팔로우하기" : "팔로우"}</span>
      {following ? <span className={styles.hover}>언팔로우</span> : null}
    </button>
  );
}
