import type { ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./NoteBody.module.css";

/**
 * Observe Note 본문 (Sprint 6-E, 2026-11-17 사용자 요청: 제목 · 소제목 · 단락이 깔끔하게 나뉘고 이미지 + 캡션이 잘 보이게)
 *   Markdown — ## 소제목(목차에 들어감) · ### 작은 소제목 · 단락 · 목록 · 인용 · 표 · 링크
 *   이미지 ![캡션](주소) → 그림 + 아래 캡션 (캡션은 alt 글자)
 *   원본 HTML 은 그리지 않는다 (react-markdown 기본, 안전)
 */

/** 소제목 → 주소 조각(#id). 목차와 본문이 같은 규칙을 쓴다 */
export const slug = (text: string) =>
  "h-" +
  text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");

const textOf = (node: ReactNode): string =>
  typeof node === "string" || typeof node === "number" ? String(node) : Array.isArray(node) ? node.map(textOf).join("") : "";

export type TocItem = { id: string; text: string; level: 2 | 3 };

/** 목차: 본문의 ## 소제목 · ### 작은 소제목 (코드 블록 안은 뺌). 본문 # 은 ## 로 그리므로 2단계로 넣는다 */
export function noteToc(md: string): TocItem[] {
  const out: TocItem[] = [];
  let fence = false;
  for (const line of md.split("\n")) {
    if (/^\s*```/.test(line)) fence = !fence;
    const m = !fence && /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) {
      const text = m[2].replace(/[*_`~]/g, "");
      out.push({ id: slug(text), text, level: m[1].length === 3 ? 3 : 2 });
    }
  }
  return out;
}

const components: Components = {
  h1: ({ children }) => <h2 id={slug(textOf(children))}>{children}</h2>, // 본문 # 은 소제목으로 (제목은 위에 따로)
  h2: ({ children }) => <h2 id={slug(textOf(children))}>{children}</h2>,
  h3: ({ children }) => <h3 id={slug(textOf(children))}>{children}</h3>,
  // 이미지만 있는 단락은 <p> 로 감싸지 않는다 (figure 가 p 안에 들어가지 않게)
  p: ({ node, children }) => {
    const only = node?.children.length === 1 && node.children[0].type === "element" && node.children[0].tagName === "img";
    return only ? <>{children}</> : <p>{children}</p>;
  },
  img: ({ src, alt }) => (
    <figure className={styles.figure}>
      <img src={src} alt={alt ?? ""} loading="lazy" />
      {alt ? <figcaption>{alt}</figcaption> : null}
    </figure>
  ),
  a: ({ href, children }) => {
    const external = !!href && /^https?:\/\//.test(href);
    return (
      <a href={href} {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}>
        {children}
      </a>
    );
  },
  table: ({ children }) => (
    <div className={styles.tableWrap}>
      <table>{children}</table>
    </div>
  ),
};

export function NoteBody({ md }: { md: string }) {
  return (
    <div className={styles.body}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {md}
      </ReactMarkdown>
    </div>
  );
}
