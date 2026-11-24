import type { PeriodKey, Pin, PinIn, PinKind, XInspect, XItem, XTrend } from "../../../types/api";
import { DOMAIN_NAME, SIGNAL, pct } from "../dashboard/parts";
import { fmt } from "../../../components/charts/core";

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
  /** [제목, 값, 근거함 요약용 짧은 값(없으면 값)] */
  rows?: [string, string, string?][];
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

/** 기간 한 줄 — "전반 4개 → 후반 9개" (2026-11-24 사용자: 앞 절반 → 뒤 절반에서 이름 바꿈) */
export function periodText(t: XTrend): string {
  return `전반 ${t.earlier}개 → 후반 ${t.recent}개`;
}

/** 흐름 한 줄 — "떠오름 (+120%)" */
export function signalText(t: XTrend): string {
  return `${SIGNAL[t.signal].label}${t.growth === null ? "" : ` (${pct(t.growth)})`}`;
}

/** "기술 충돌 2개 (#A, #B)" — 0 이면 없음 */
const linkText = (k: string, n: number, names: string[]) => (n ? `${k} ${n}개${names.length ? ` (${names.join(", ")})` : ""}` : null);

/**
 * 근거함에 담을 글 — 상세 카드를 그대로 문장으로 옮길 뿐, 해석은 붙이지 않는다 (원칙 4).
 * 2026-11-24 사용자: 요약 = 모든 카드 한 줄, Markdown = 관측 · 지표 · 관계 세 항목 (ref.sections 에 따로 둠)
 */
export function pinFromInspect(sel: Selection, d: XInspect): PinIn {
  const L = d.links;
  const obs = [
    `상상 ${d.count}개에 사용`,
    `Dreamer ${d.dreamers}명이 사용`,
    `기간 ${periodText(d.trend)}`,
    d.domains.length ? `분야 ${d.domains.map((x) => `${domainName(x.name)} (${x.count}개)`).join(" / ")}` : null,
    d.members.length > 1 ? `묶음 안의 욕망 ${d.members.slice(0, 12).map((m) => `${m.label} (${m.count}개)`).join(" / ")}` : null,
  ];
  const metrics = [
    `평균 Thunder ${fmt(d.thunder_avg, 1)}개`,
    `평균 Wave ${fmt(d.wave_avg, 1)}개`,
    `흐름 신호 ${signalText(d.trend)}`,
    d.rank_pct !== null ? `같은 종류 연결 중 상위 ${Math.max(1, Math.round(d.rank_pct * 100))}%` : null,
    ...(sel.rows ?? []).map(([k, v]) => `${k} ${v}`),
  ];
  const relations = L
    ? [
        linkText("기술 충돌", L.collision, L.collision_with),
        linkText("기술x욕망", L.desire, L.desire_with),
        linkText("기술 조합", L.combo, L.combo_with),
        linkText("숨은 이웃", L.hidden, L.hidden_with),
      ]
    : [];
  const join = (xs: (string | null)[]) => xs.filter(Boolean).join(", ");
  // 근거함 카드의 요약은 "제목 (값)" 으로만 — 이름 목록은 Markdown 에만 (2026-11-24 사용자: 정보가 너무 많아 보기 힘듦)
  // 순서는 사용자가 정한 카드 순서: 상상 · Dreamer · Thunder · Wave · 흐름 · 관계 · 기간 · 분야
  const summary = join([
    `상상 (${d.count}개)`,
    `Dreamer (${d.dreamers}명)`,
    `평균 Thunder (${fmt(d.thunder_avg, 1)}개)`,
    `평균 Wave (${fmt(d.wave_avg, 1)}개)`,
    `흐름 신호 (${SIGNAL[d.trend.signal].label}${d.trend.growth === null ? "" : ` ${pct(d.trend.growth)}`})`,
    d.rank_pct !== null ? `같은 종류 연결 중 (상위 ${Math.max(1, Math.round(d.rank_pct * 100))}%)` : null,
    ...(sel.rows ?? []).map(([k, v, short]) => `${k} (${short ?? v})`),
    L?.collision ? `기술 충돌 (${L.collision}개)` : null,
    L?.desire ? `기술x욕망 (${L.desire}개)` : null,
    L?.combo ? `기술 조합 (${L.combo}개)` : null,
    L?.hidden ? `숨은 이웃 (${L.hidden}개)` : null,
    `기간 (${periodText(d.trend)})`,
    d.domains.length ? `분야 (${d.domains.length}개)` : null,
    d.members.length > 1 ? `묶음 안의 욕망 (${d.members.length}개)` : null,
  ]);
  return {
    kind: sel.kind,
    title: sel.heading,
    summary,
    stat: "",
    ref: {
      ...sel.ref,
      count: d.count,
      ids: d.items.slice(0, 10).map((i) => i.id),
      sections: { obs: join(obs), metrics: join(metrics), relations: join(relations) },
    },
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
  // 2026-11-24 이후 담은 것: 관측 · 지표 · 관계 세 항목 (관계는 있을 때만)
  const sec = p.ref.sections as { obs?: string; metrics?: string; relations?: string } | undefined;
  if (sec)
    return [head, `- 관측: ${sec.obs ?? ""}`, `- 지표: ${sec.metrics ?? ""}`, sec.relations ? `- 관계: ${sec.relations}` : null].filter(Boolean).join("\n");
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
