import { ChevronLeft, Link2, MoreHorizontal, Tags, Trash2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { api, ApiError } from "../../api/client";
import { IconButton, TagPill } from "../../design-system";
import { useDismiss } from "../../hooks/useDismiss";
import { itemPath } from "../../lib/actions";
import type { Imagination } from "../../types/api";
import { useToast } from "../feedback/Toast";
import styles from "./ItemMenu.module.css";

type Props = {
  item: Pick<Imagination, "id" | "kind" | "root_id" | "actions" | "domain" | "secondary_domain">;
  onDeleted?: (id: number) => void;
  className?: string;
};

/**
 * 카드·상세·댓글의 ⋯ 메뉴 — 링크 복사 · 뱃지 보기 · (내 글이면) 삭제. 상상은 수정할 수 없다 (기획안 F2).
 * 분야 뱃지는 카드·상세에 늘어놓지 않고 [뱃지 보기]에서 본다 — 한 상상이 여러 분야에 속할 수 있어서 (2026-11-10).
 * X 의 옵션 메뉴는 아직 없음.
 */
export function ItemMenu({ item, onDeleted, className }: Props) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [badges, setBadges] = useState(false); // 메뉴 안에서 뱃지 목록으로 바뀜
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    setBadges(false);
  }, []);
  const domains = [item.domain, item.secondary_domain].filter((d): d is NonNullable<typeof d> => !!d);
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
      {open && badges ? (
        <div className={styles.menu} role="dialog" aria-label="뱃지">
          <button type="button" className={`${styles.item} ${styles.back}`} onClick={() => setBadges(false)}>
            <ChevronLeft aria-hidden="true" /> 뱃지
          </button>
          <div className={styles.badges}>
            {domains.map((d) => (
              <TagPill key={d.slug} variant="neutral" to={`/?domain=${d.slug}`}>
                {d.name}
              </TagPill>
            ))}
          </div>
        </div>
      ) : open ? (
        <div className={styles.menu} role="menu">
          <button type="button" role="menuitem" className={styles.item} onClick={() => void copy()}>
            <Link2 aria-hidden="true" /> 링크 복사
          </button>
          {domains.length ? (
            <button type="button" role="menuitem" className={styles.item} onClick={() => setBadges(true)}>
              <Tags aria-hidden="true" /> 뱃지 보기
            </button>
          ) : null}
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
