import { SERVICE_NAME } from "../../brand";
import styles from "./ImagineLogo.module.css";

/** 파비콘의 대문자 I (위·아래 가로획이 있는 I) — 32×32 파비콘 좌표 */
const CAPITAL_I_PATH = "M10 7h12v4h-3.5v10H22v4H10v-4h3.5V11H10z";

/**
 * 글자 로고용 I — 파비콘 I 와 같은 모양을 글꼴 단위(1000 = 1em)로 다시 그림.
 * 나눔스퀘어 네오 Heavy 의 대문자 높이(0.822em)·획 두께에 맞춰 비율을 조정했다.
 */
const WORD_I_PATH = "M0 0H520V150H347V672H520V822H0V672H173V150H0Z";

/**
 * 로고
 * - 기본: 글자 로고 "Imagine" — 첫 글자 I 는 파비콘과 같은 가로획 있는 대문자(SVG), 나머지는 Heavy 굵기
 * - 사이드바가 아이콘만 남기고 접혔을 때(700~900px): 마크만 (파비콘과 같은 보라 정사각형 + I)
 */
export function ImagineLogo() {
  return (
    <span className={styles.logo} aria-label={SERVICE_NAME} role="img">
      {/* 마크: 파비콘과 같은 보라 둥근 정사각형 + 흰 대문자 I */}
      <svg className={styles.mark} viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="7" style={{ fill: "var(--color-accent)" }} />
        <path fill="#ffffff" d={CAPITAL_I_PATH} />
      </svg>
      <span className={styles.word} aria-hidden="true">
        <svg className={styles.capI} viewBox="0 0 520 822">
          {/* 외곽선 36(=0.9px@25px)은 다른 글자의 -webkit-text-stroke 와 같은 두께 */}
          <path fill="currentColor" stroke="currentColor" strokeWidth={36} d={WORD_I_PATH} />
        </svg>
        {SERVICE_NAME.slice(1)}
      </span>
    </span>
  );
}
