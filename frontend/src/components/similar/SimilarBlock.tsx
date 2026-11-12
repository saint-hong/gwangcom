import clsx from "clsx";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { Avatar } from "../../design-system";
import { useAuth } from "../../hooks/useAuth";
import type { SimilarResult } from "../../types/api";
import styles from "./SimilarBlock.module.css";

/**
 * 비슷한 상상 (기획안 v10 F23 · S4 오른쪽 컬럼, v11 반영목록 5장)
 *   서버가 미리 골라 둔 목록을 그대로 그린다 (벡터 후보 → AI 가 정말 비슷한 것만 골라 이유를 붙임).
 *   줄마다: 아바타 · 제목 2줄 / 작성자 · "왜 비슷한가" 한 줄
 * - 혼합 글 · 댓글(method=none)이면 블록을 그리지 않는다
 * - inline = 오른쪽 컬럼이 없는 좁은 화면에서 상세 글 아래에 보여 줄 때 (넓은 화면에서는 숨김)
 */
export function SimilarBlock({ id, inline = false }: { id: number; inline?: boolean }) {
  const { user } = useAuth();
  const [data, setData] = useState<SimilarResult | null>(null);

  useEffect(() => {
    setData(null);
    const ctrl = new AbortController();
    api<SimilarResult>(`/api/imaginations/${id}/similar`, { signal: ctrl.signal }).then(setData, () => {});
    return () => ctrl.abort();
  }, [id, user]);

  if (data?.method === "none") return null;
  return (
    <section className={clsx(styles.block, inline && styles.inline)} aria-label="비슷한 상상">
      <h2 className={styles.title}>비슷한 상상</h2>
      {data === null ? (
        <p className={styles.empty}>불러오는 중…</p>
      ) : data.items.length === 0 ? (
        <p className={styles.empty}>아직 비슷한 상상이 없어요. 다른 Dreamer 가 비슷한 상상을 올리면 여기에 보여요.</p>
      ) : (
        <ul className={styles.list}>
          {data.items.map(({ item, reason }) => (
            <li key={item.id}>
              <Link to={`/i/${item.id}`} className={styles.row}>
                <Avatar name={item.author.nickname} src={item.author.avatar_url} size={32} />
                <span className={styles.text}>
                  <span className={styles.itemTitle}>{item.kind === "quote" ? item.body : item.display_title}</span>
                  <span className={styles.meta}>{item.author.nickname}</span>
                  {reason ? <span className={styles.reason}>{reason}</span> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
