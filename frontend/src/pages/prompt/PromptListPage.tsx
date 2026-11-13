import { ChevronRight, MessageCircleQuestion } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { PageHeader } from "../../components/layout/PageHeader";
import { leftLabel } from "../../components/prompt/useCurrentPrompt";
import { Button, ButtonLink } from "../../design-system";
import { useAuth } from "../../hooks/useAuth";
import type { Prompt, PromptList } from "../../types/api";
import styles from "./PromptPage.module.css";

/**
 * 이번 주 질문 목록 (/prompts, 2026-11-13 사용자 요청: 질문이 둘 이상이면 모두 볼 수 있어야 함)
 *   [←] 이번 주 질문 · 진행 중 N개 · 종료됨 N개
 *   진행 중: 질문 카드(물음표 · 남은 기간 · 질문 · 설명 2줄 · 답한 상상 · 참여 수 …… [상상하기]) — 늦게 시작한 순
 *   끝난 질문: 같은 카드(흐린 머리 · [상상하기] 없음) — 최근 끝난 순 20개
 *   카드를 누르면 질문 상세 /prompts/:id
 */
export function PromptListPage() {
  const [data, setData] = useState<PromptList | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<PromptList>("/api/prompts").then(setData, (e) => setError(e instanceof ApiError ? e.message : "질문을 불러오지 못했어요."));
  }, []);

  return (
    <div>
      <PageHeader title="이번 주 질문" sub={data ? `진행 중 ${data.open.length}개 · 종료됨 ${data.ended_total}개` : undefined} />
      {error ? (
        <p className={styles.status}>{error}</p>
      ) : !data ? (
        <p className={styles.status}>불러오는 중…</p>
      ) : (
        <>
          <h3 className={styles.listTitle}>진행 중</h3>
          {data.open.length === 0 ? (
            <p className={styles.status}>지금 진행 중인 질문이 없어요. 운영자가 질문을 올리면 여기에 보여요.</p>
          ) : (
            data.open.map((p) => <PromptCard key={p.id} prompt={p} />)
          )}
          {data.ended.length > 0 ? (
            <>
              <h3 className={styles.listTitle}>끝난 질문</h3>
              {data.ended.map((p) => (
                <PromptCard key={p.id} prompt={p} />
              ))}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

function PromptCard({ prompt }: { prompt: Prompt }) {
  const { user, openAuth } = useAuth();
  const left = leftLabel(prompt.ends_at);
  return (
    <article className={styles.card}>
      <Link to={`/prompts/${prompt.id}`} className={styles.cardMain}>
        <span className={prompt.open ? styles.eyebrow : styles.eyebrowMuted}>
          <MessageCircleQuestion aria-hidden="true" />
          {prompt.open ? (left ?? "진행 중") : "끝난 질문"}
        </span>
        <strong className={styles.cardTitle}>{prompt.title}</strong>
        {prompt.body ? <p className={styles.cardBody}>{prompt.body}</p> : null}
        <span className={styles.meta}>
          답한 상상 {prompt.answer_count}개 · {prompt.answerer_count}명 참여
          <ChevronRight aria-hidden="true" className={styles.cardChevron} />
        </span>
      </Link>
      {prompt.open ? (
        <div className={styles.cardAction}>
          {user ? (
            <ButtonLink to={`/write?prompt=${prompt.id}`} size="sm">
              상상하기
            </ButtonLink>
          ) : (
            <Button size="sm" onClick={() => openAuth("login")}>
              상상하기
            </Button>
          )}
        </div>
      ) : null}
    </article>
  );
}
