import type { SVGProps } from "react";

/**
 * Shake it 아이콘 — 비빔밥 그릇 + 왼쪽 숟가락 + 오른쪽 젓가락 + 반짝이는 별 5개
 * (참고 이미지: etc_datas/shake_it_imoji.png). 하트·Wave·댓글처럼 배경 없는 선 아이콘.
 * 움직이는 부분에 class 를 붙였다: shake-spoon · shake-chopsticks · shake-star(-1~5)
 * → ShakeButton 에서 hover 시 숟가락·젓가락이 들썩이고 별이 깜빡인다.
 */
export function ShakeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* 그릇: 테두리 · 몸통 · 받침 */}
      <path d="M4.6 14H19.6" />
      <path d="M5.2 14C5.2 17.4 8.2 19.4 12.1 19.4C16 19.4 19 17.4 19 14" />
      <path d="M10 19.4L10.4 20.6H13.8L14.2 19.4" />
      {/* 소복이 담긴 밥 */}
      <path d="M8.9 14C8.7 12.7 9.5 11.7 10.6 11.7C11.1 10.7 12.3 10.3 13.3 10.8C14.3 10.6 15.2 11.3 15.3 12.3C15.9 12.7 16.1 13.3 16 14" />
      {/* 숟가락 (왼쪽) */}
      <g className="shake-spoon">
        <path d="M6.8 11.1L3.8 6.3" />
        <ellipse cx="7.6" cy="12.5" rx="1.15" ry="1.6" transform="rotate(-32 7.6 12.5)" />
      </g>
      {/* 젓가락 (오른쪽) */}
      <g className="shake-chopsticks">
        <path d="M14.6 13.4L20.6 6.6" />
        <path d="M16.4 13.7L22.2 7.6" />
      </g>
      {/* AI 반짝이 별 */}
      <path className="shake-star shake-star-1" d="M9.4 3.1Q9.86 4.94 11.7 5.4Q9.86 5.86 9.4 7.7Q8.94 5.86 7.1 5.4Q8.94 4.94 9.4 3.1Z" strokeWidth={1.2} />
      <path className="shake-star shake-star-2" d="M13.4 1.8Q13.64 2.76 14.6 3Q13.64 3.24 13.4 4.2Q13.16 3.24 12.2 3Q13.16 2.76 13.4 1.8Z" strokeWidth={1.2} />
      <path className="shake-star shake-star-3" d="M15.4 5.1Q15.7 6.3 16.9 6.6Q15.7 6.9 15.4 8.1Q15.1 6.9 13.9 6.6Q15.1 6.3 15.4 5.1Z" strokeWidth={1.2} />
      <path className="shake-star shake-star-4" d="M3.6 10.5Q3.82 11.38 4.7 11.6Q3.82 11.82 3.6 12.7Q3.38 11.82 2.5 11.6Q3.38 11.38 3.6 10.5Z" strokeWidth={1.2} />
      <path className="shake-star shake-star-5" d="M21.2 11.5Q21.42 12.38 22.3 12.6Q21.42 12.82 21.2 13.7Q20.98 12.82 20.1 12.6Q20.98 12.38 21.2 11.5Z" strokeWidth={1.2} />
    </svg>
  );
}
