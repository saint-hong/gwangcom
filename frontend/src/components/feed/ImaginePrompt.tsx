import { Link } from "react-router-dom";
import { Avatar, ButtonLink } from "../../design-system";
import type { Me } from "../../types/api";
import styles from "./ImaginePrompt.module.css";

/**
 * 홈 탭 줄 바로 아래 "상상하기" 유도 영역 (v10 반영목록 7장 — X 의 "무슨 일이 일어나고 있나요?" 자리)
 *   (프로필 이미지) 오늘 상상한 미래의 모습을 사람들과 공유해보세요! …… [상상하기]
 * 우리 글쓰기는 제목 · 본문 · 왜 원하나요를 따로 받으므로 여기서 쓰지 않고 상상하기 화면으로 보낸다.
 */
export function ImaginePrompt({ user }: { user: Me }) {
  return (
    <section className={styles.prompt} aria-label="상상하기">
      <Link to="/write" className={styles.row}>
        <Avatar name={user.nickname} src={user.avatar_url} size={40} />
        <span className={styles.spark}>오늘 상상한 미래의 모습을 사람들과 공유해보세요!</span>
      </Link>
      <ButtonLink to="/write" size="sm">
        상상하기
      </ButtonLink>
    </section>
  );
}
