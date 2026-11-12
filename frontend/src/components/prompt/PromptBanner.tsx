import { MessageCircleQuestion } from "lucide-react";
import { Button, ButtonLink } from "../../design-system";
import { useAuth } from "../../hooks/useAuth";
import { leftLabel, useCurrentPrompt } from "./useCurrentPrompt";
import styles from "./Prompt.module.css";

/**
 * 좁은 화면(오른쪽 컬럼이 숨는 1100px 미만)의 홈 피드 위 이번 주 질문 배너 (기획안 4장 모바일, 6-C).
 * 넓은 화면에서는 오른쪽 컬럼 블록이 같은 역할을 하므로 숨긴다 (CSS).
 */
export function PromptBanner() {
  const prompt = useCurrentPrompt();
  const { user, openAuth } = useAuth();
  if (!prompt) return null;
  const left = leftLabel(prompt.ends_at);
  return (
    <section className={styles.banner} aria-label="이번 주 질문">
      <MessageCircleQuestion className={styles.bannerIcon} aria-hidden="true" />
      <div className={styles.bannerText}>
        <span className={styles.eyebrow}>이번 주 질문{left ? ` · ${left}` : ""}</span>
        <strong className={styles.question}>{prompt.title}</strong>
      </div>
      {user ? (
        <ButtonLink to={`/write?prompt=${prompt.id}`} size="sm">
          상상하기
        </ButtonLink>
      ) : (
        <Button size="sm" onClick={() => openAuth("login")}>
          상상하기
        </Button>
      )}
    </section>
  );
}
