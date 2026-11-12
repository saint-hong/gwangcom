import { Link2, MoreHorizontal, Trash2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { api, ApiError } from "../../api/client";
import { IconButton } from "../../design-system";
import { useDismiss } from "../../hooks/useDismiss";
import { itemPath } from "../../lib/actions";
import type { Imagination } from "../../types/api";
import { useToast } from "../feedback/Toast";
import styles from "./ItemMenu.module.css";

type Props = {
  item: Pick<Imagination, "id" | "kind" | "root_id" | "actions">;
  onDeleted?: (id: number) => void;
  className?: string;
};

/**
 * 카드·상세·댓글의 ⋯ 메뉴 — 링크 복사 · (내 글이면) 삭제. 상상은 수정할 수 없다 (기획안 F2).
 * [뱃지 보기]는 없앴다 — 분야는 태그 줄 맨 앞 회색 알약으로 보인다 (2026-11-12 사용자 결정, v10 의 "분야 뱃지 제거"를 되돌림).
 * X 의 옵션 메뉴는 아직 없음.
 */
export function ItemMenu({ item, onDeleted, className }: Props) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, ref, close);

  const copy = async () => {
    close();
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${itemPath(item)}`);
      toast.show("링크를 복사했어요.");
    } catch {
      toast.show("링크를 복사하지 못했어요.");
    }
  };

  const remove = async () => {
    close();
    const what = item.kind === "comment" ? "댓글" : "상상";
    if (!window.confirm(`이 ${what}을 삭제할까요? 삭제하면 되돌릴 수 없어요.`)) return;
    try {
      await api(`/api/imaginations/${item.id}`, { method: "DELETE" });
      toast.show(`${what}을 삭제했어요.`);
      onDeleted?.(item.id);
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "삭제하지 못했어요.");
    }
  };

  return (
    <div className={`${styles.wrap} ${className ?? ""}`} ref={ref}>
      <IconButton
        icon={MoreHorizontal}
        label="더보기"
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      />
      {open ? (
        <div className={styles.menu} role="menu">
          <button type="button" role="menuitem" className={styles.item} onClick={() => void copy()}>
            <Link2 aria-hidden="true" /> 링크 복사
          </button>
          {item.actions.delete.allowed ? (
            <button type="button" role="menuitem" className={`${styles.item} ${styles.danger}`} onClick={() => void remove()}>
              <Trash2 aria-hidden="true" /> 삭제
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
