import type { PeriodKey, Pin, PinIn, PinKind, XInspect, XItem, XTrend } from "../../../types/api";
import { DOMAIN_NAME, SIGNAL, pct } from "../dashboard/parts";

export type GraphQuery = { period: PeriodKey; domain: string; blend: boolean };

export function queryString(q: GraphQuery, extra: Record<string, string | number | boolean | null | undefined> = {}): string {
  const p = new URLSearchParams({ period: q.period });
  if (q.domain) p.set("domain", q.domain);
  if (q.blend) p.set("blend", "true");
  for (const [k, v] of Object.entries(extra)) if (v !== null && v !== undefined && v !== "") p.set(k, String(v));
  return p.toString();
}

/** 오른쪽 상세에 띄울 것 — 보기마다 만든다. url 이 있으면 수치 · 원문을 불러온다 */
export type Selection = {
  /** 그림에서 고른 점 · 선 · 영역 id (강조용) */
  id: string;
  kind: PinKind;
  /** 종류 이름 (기술 충돌 · 욕망 묶음 …) */
  badge: string;
  heading: string;
  /** 한 줄 설명 (어떻게 계산했는지) */
  note?: string;
  url?: string;
  /** 불러온 수치 외에 더 보여 줄 줄 */
  rows?: [string, string][];
  /** 묶음 목록 카드 (찾기 결과가 든 압력장 등) — 줄을 누르면 그 묶음으로 */
  groups?: { title: string; items: { label: string; detail: string; onPick?: () => void }[] };
  /** 불러오지 않고 바로 보여 줄 원문 */
  items?: XItem[];
  /** 불러올 수치가 없을 때 담을 글 (확산 경로 등) */
  pin?: PinIn;
  ref: Record<string, unknown>;
};

export const PIN_KIND: Record<PinKind, string> = {
  quote: "원문 상상",
  fusion: "기술 × 욕망",
  collision: "기술 충돌",
  desire: "욕망 묶음",
  tech: "기술",
  zone: "압력장",
  lineage: "Shake it 계보",
  cascade: "확산 경로",
};

export const domainName = (d: string | null | undefined) => (d ? (DOMAIN_NAME[d] ?? d) : "—");

/** 흐름 한 줄 — "앞 절반 4개 → 뒤 절반 9개 · 떠오름 +120%" */
export function trendText(t: XTrend): string {
  const g = t.growth === null ? "" : ` ${pct(t.growth)}`;
  return `앞 절반 ${t.earlier}개 → 뒤 절반 ${t.recent}개 · ${SIGNAL[t.signal].label}${g}`;
}

/** 근거함에 담을 글 — 수치를 문장으로 옮길 뿐, 해석은 붙이지 않는다 (원칙 4) */
export function pinFromInspect(sel: Selection, d: XInspect): PinIn {
  const doms = d.domains
    .slice(0, 3)
    .map((x) => domainName(x.name))
    .join(" · ");
  const lead: Record<PinKind, string> = {
    collision: `대표 분야가 다른 두 기술이 상상 ${d.count}개에 함께 나왔어요 (${doms}).`,
    fusion: `기술과 욕망이 상상 ${d.count}개에서 함께 나왔어요 (${doms}).`,
    tech: `상상 ${d.count}개에 쓰인 기술이에요 (${doms}).`,
    desire: `상상 ${d.count}개에 나온 욕망 묶음이에요${d.members.length ? ` — ${d.members.slice(0, 4).map((m) => m.label).join(" · ")}` : ""}.`,
    zone: `서로 다른 Dreamer ${d.dreamers}명이 쓴, 뜻이 비슷한 상상 ${d.count}개가 모였어요 (${doms}).`,
    lineage: `Shake it 계보 — 상상 ${d.count}개가 재료와 혼합으로 이어졌어요 (${doms}).`,
    quote: "",
    cascade: "",
  };
  const extra = (sel.rows ?? []).map(([k, v]) => `${k} ${v}`).join(" · ");
  return {
    kind: sel.kind,
    title: sel.heading,
    summary: `${lead[sel.kind]} ${trendText(d.trend)}.${extra ? ` ${extra}.` : ""}`.trim(),
    stat: [
      `상상 ${d.count}`,
      `Dreamer ${d.dreamers}`,
      `평균 Thunder ${d.thunder_avg}`,
      `평균 Wave ${d.wave_avg}`,
      d.rank_pct !== null ? `같은 종류 상위 ${Math.max(1, Math.round(d.rank_pct * 100))}%` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    ref: { ...sel.ref, count: d.count, ids: d.items.slice(0, 10).map((i) => i.id) },
  };
}

export function pinFromItem(i: XItem, ref: Record<string, unknown> = {}): PinIn {
  return {
    kind: "quote",
    title: `「${i.title}」 (@${i.author})`,
    summary: `${i.excerpt}${i.desire ? `\n왜 원하나요: ${i.desire}` : ""}`,
    stat: [`Thunder ${i.thunders}`, `Wave ${i.waves}`, domainName(i.domain), ...i.techs.slice(0, 3).map((t) => `#${t}`)].join(" · "),
    ref: { ...ref, count: 1, ids: [i.id], id: i.id },
  };
}

/** 근거 한 개 → Markdown (노트 본문에 넣는 모양) */
export function pinMarkdown(p: Pin | PinIn, n?: number): string {
  const head = `### ${n ? `${n}. ` : ""}[${PIN_KIND[p.kind]}] ${p.title}`;
  const id = typeof p.ref.id === "number" ? p.ref.id : null;
  if (p.kind === "quote") {
    const quote = p.summary
      .split("\n")
      .map((l) => `> ${l}`)
      .join("\n");
    return `${head}\n${quote}\n- 수치: ${p.stat}${id ? `\n- 원문: [상상 보기](/i/${id})` : ""}`;
  }
  return `${head}\n- 관측: ${p.summary}\n- 수치: ${p.stat}`;
}

/** 근거함 전체 → Markdown. 끝에 "몇 개의 상상 · 교차 신호에서 관측됐는지" 한 줄 (사업 기획 통합 문서의 신뢰 장치) */
export function boardMarkdown(pins: Pin[], scope: string): string {
  const items = pins.reduce((s, p) => s + (typeof p.ref.count === "number" ? p.ref.count : 0), 0);
  const cross = pins.filter((p) => p.kind === "collision" || p.kind === "fusion").length;
  return [
    `## Observe Note 근거 자료 (${scope})`,
    "",
    ...pins.map((p, i) => pinMarkdown(p, i + 1) + "\n"),
    `> 이 관점은 상상 데이터 ${items}개, 기술 교차 신호 ${cross}개에서 관측되었다 (Imagine 상상 네트워크 탐색기).`,
  ].join("\n");
}
