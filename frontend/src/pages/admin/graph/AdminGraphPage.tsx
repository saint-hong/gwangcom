import { RefreshCw, Search } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../../api/client";
import { useToast } from "../../../components/feedback/Toast";
import { Button } from "../../../design-system";
import type { GraphHit, GraphStatus, PeriodKey } from "../../../types/api";
import adminStyles from "../Admin.module.css";
import { PeriodPicker, isPeriodKey, periodLabel } from "../dashboard/settings";
import { CascadeView } from "./CascadeView";
import { queryString, type Selection } from "./explorer";
import { FusionView } from "./FusionView";
import styles from "./Graph.module.css";
import { LineageView } from "./LineageView";
import { MapView } from "./MapView";
import { DetailPanel, PinboardButton, usePins } from "./Side";
import { GraphStatusContext, useGraphStatus } from "./Status";

const VIEWS = [
  { value: "fusion", label: "융합과 충돌" },
  { value: "map", label: "집단 압력 지도" },
  { value: "lineage", label: "변이와 진화" },
  { value: "cascade", label: "전파와 공명" },
] as const;
type View = (typeof VIEWS)[number]["value"];
/** 탭마다 찾기 결과를 다르게 보여 준다 (2026-11-20 사용자) */
const PLACEHOLDER: Record<View, string> = {
  fusion: "시작점 찾기 (기술 · 욕망 · 상상)",
  map: "지도에서 찾기 (기술 · 욕망 · 상상)",
  lineage: "계보에서 찾기 (기술 · 욕망 · 상상)",
  cascade: "확산 경로 찾기 (상상 · 기술 · 욕망)",
};
const isView = (v: string | null): v is View =>
  VIEWS.some((x) => x.value === v);

/**
 * A7 상상 네트워크 탐색기 (2026-11-20 사용자 결정으로 다시 짬 — 설계안 + 프로토타입, v13 5장)
 *   목적(사업 기획 통합): 모인 상상에서 욕망의 벡터 · 범용 기술의 충돌 · 형태 붕괴 신호를 운영자가 직접 찾아 Observe Note 근거로 쓴다
 *   대시보드 = "무슨 신호가 떴나"(숫자), 탐색기 = "그 신호가 어떤 상상 · 사람 · 변형 · 확산으로 이뤄졌나"(원문까지)
 *   [융합과 충돌 | 집단 압력 지도 | 변이와 진화 | 전파와 공명] …… [기간] [그래프 재생성]
 *   (아래 줄) [시작점 찾기] 상태 줄 — 분야 · 혼합 글 · 그래프별 기간은 각 그래프 [설정] (2026-11-20 사용자)
 *   그림 아래: 상세 (수치 요약 → 원문 카드), 근거함은 탭 줄 버튼을 누르면 펼쳐짐 (2026-11-20 사용자) — 수치(계산 규칙) + 원문, 담아 두었다가 노트 쓰기에서 꺼내 씀 (AI 는 노트를 쓰지 않음)
 *   보기 · 기간 · 시작점은 주소(?view= &period= &focus=)에 남는다 (대시보드에서 바로 들어올 수 있게)
 */
export function AdminGraphPage() {
  const [params, setParams] = useSearchParams();
  const rawView = params.get("view");
  const view: View = isView(rawView) ? rawView : "fusion";
  const raw = params.get("period");
  // 위 기간 버튼 = 모든 그래프의 기본 기간. 분야 · 혼합 글 · 그래프별 기간은 각 그래프 [설정]에서 (2026-11-20 사용자)
  const page: PeriodKey = isPeriodKey(raw) ? raw : "all";
  const focus = params.get("focus");
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };
  const [sel, setSel] = useState<Selection | null>(null);
  // 시작점 찾기 결과 — 지금 탭이 받아서 자기 그래프에 보여 준다 (융합과 충돌은 주소 focus 로, 2026-11-20 사용자)
  const [hit, setHit] = useState<GraphHit | null>(null);
  // 검색 창 옆 결과 안내 — "○○ 적용 결과 | …" (모든 탭, 2026-11-20 사용자)
  const [picked, setPicked] = useState<GraphHit | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const pins = usePins();
  const status = useGraphStatus();
  // 찾기 창 폭 = 보기 탭 4개 폭 (2026-11-20 사용자)
  const tabs = useRef<HTMLDivElement>(null);
  const [tabsWidth, setTabsWidth] = useState<number | undefined>(undefined);
  useEffect(() => {
    const el = tabs.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTabsWidth(el.offsetWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 보기 · 기간이 바뀌면 상세를 비운다 (다른 그림의 점이라서)
  const key = `${view}|${page}|${version}`;
  useEffect(() => setSel(null), [key]);
  useEffect(() => {
    setHit(null);
    setPicked(null);
    setNote(null);
  }, [view]);

  const props = { page, onSelect: setSel, selected: sel?.id ?? null };
  const hitProps = { hit, onHitNote: setNote };
  const clearSearch = () => {
    setHit(null);
    setPicked(null);
    setNote(null);
    if (focus) set({ focus: null });
  };
  return (
    <GraphStatusContext.Provider value={status.st}>
      <div className={styles.page}>
        <div className={adminStyles.toolbar}>
          <div
            ref={tabs}
            className={adminStyles.seg}
            role="group"
            aria-label="탐색기 보기"
          >
            {VIEWS.map((v) => (
              <button
                key={v.value}
                type="button"
                aria-pressed={view === v.value}
                onClick={() => set({ view: v.value, focus: null })}
              >
                {v.label}
              </button>
            ))}
          </div>
          <div className={styles.filters}>
            <PeriodPicker
              value={page}
              onChange={(v) => set({ period: v })}
              floating
            />
            <RebuildButton
              status={status}
              onRebuilt={() => setVersion((v) => v + 1)}
            />
            <PinboardButton pins={pins} scope={periodLabel(page)} />
          </div>
        </div>
        <div className={styles.subBar}>
          <StartSearch
            width={tabsWidth}
            placeholder={PLACEHOLDER[view]}
            onClear={clearSearch}
            onPick={(h) => {
              setPicked(h);
              setNote(null);
              if (view !== "fusion") return setHit(h);
              setNote(h.kind === "imagination" ? "아래 상세에 원문 표시" : "그 점과 이웃을 펼쳐 그래프에 표시");
              if (h.kind === "imagination") {
                const id = Number(h.id.slice(2));
                setSel({
                  id: h.id,
                  kind: "quote",
                  badge: "상상",
                  heading: h.label,
                  url: `/api/admin/graph/items/inspect?${queryString({ period: page, domain: "", blend: true }, { ids: id, kind: "quote", title: h.label })}`,
                  ref: { id },
                });
              } else set({ view: "fusion", focus: h.id });
            }}
          />
          {picked ? (
            <span className={styles.hitResult} role="status">
              <b>{picked.kind === "tech" ? `#${picked.label}` : picked.kind === "imagination" ? `「${picked.label}」` : picked.label} 적용 결과</b>
              <span className={styles.hitSep} aria-hidden="true">—</span>
              {note ?? "찾는 중…"}
            </span>
          ) : null}
        </div>
        <div className={styles.body}>
          <div className={styles.main} key={`${view}|${version}`}>
            {view === "fusion" ? <FusionView {...props} focus={focus} /> : null}
            {view === "map" ? <MapView {...props} {...hitProps} /> : null}
            {view === "lineage" ? (
              <LineageView {...props} {...hitProps} />
            ) : null}
            {view === "cascade" ? (
              <CascadeView {...props} {...hitProps} />
            ) : null}
          </div>
          <DetailPanel sel={sel} pins={pins} />
        </div>
      </div>
    </GraphStatusContext.Provider>
  );
}

/** 시작점 찾기 — 융합과 충돌: 기술 · 욕망 → 그 점부터(이웃까지), 상상 → 아래 상세. 다른 탭: 결과를 그 탭 그래프에 (hit) */
function StartSearch({
  onPick,
  onClear,
  placeholder,
  width,
}: {
  onPick: (h: GraphHit) => void;
  onClear: () => void;
  placeholder: string;
  width?: number;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<GraphHit[] | null>(null);
  const box = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setHits(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    setHits(
      await api<GraphHit[]>(
        `/api/admin/graph/search?q=${encodeURIComponent(q.trim())}`,
      ).catch(() => []),
    );
  };
  const KIND = { tech: "기술", desire: "욕망", imagination: "상상" } as const;
  return (
    <form
      ref={box}
      className={styles.start}
      style={width ? { width } : undefined}
      onSubmit={(e) => void submit(e)}
      role="search"
    >
      <Search aria-hidden="true" />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          if (!e.target.value) onClear(); // 검색 창을 비우면 찾기가 풀린다 (거름 [×] 대신, 2026-11-20 사용자)
        }}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {hits ? (
        <ul className={styles.hits}>
          {hits.length ? (
            hits.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(h);
                    setHits(null);
                  }}
                >
                  <span className={styles[`hit_${h.kind}`]}>
                    {KIND[h.kind]}
                  </span>
                  <b>{h.kind === "tech" ? `#${h.label}` : h.label}</b>
                  {h.sub ? <small>{h.sub}</small> : null}
                </button>
              </li>
            ))
          ) : (
            <li className={styles.hitEmpty}>찾은 것이 없어요.</li>
          )}
        </ul>
      ) : null}
    </form>
  );
}

/** [그래프 재생성] — 탭 줄 오른쪽 끝 (2026-11-20 사용자: "그래프 다시 만들기" → "그래프 재생성") */
function RebuildButton({
  status,
  onRebuilt,
}: {
  status: ReturnType<typeof useGraphStatus>;
  onRebuilt: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const rebuild = async () => {
    setBusy(true);
    try {
      const next = await api<GraphStatus>("/api/admin/graph/rebuild", {
        method: "POST",
      });
      status.setSt(next);
      onRebuilt();
      toast.show(
        `그래프를 재생성했어요 (점 ${next.nodes?.toLocaleString()} · 선 ${next.edges?.toLocaleString()}, 의미 지도 좌표 포함).`,
      );
    } catch (e) {
      toast.show(
        e instanceof ApiError ? e.message : "그래프를 만들지 못했어요.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busy || !status.st?.enabled}
      onClick={() => void rebuild()}
      title="PostgreSQL 에서 Memgraph 그래프 · 의미 지도 좌표 · 욕망 묶음을 다시 계산해요 (1분쯤)"
    >
      <RefreshCw className={adminStyles.btnIcon} aria-hidden="true" />
      {busy ? "재생성 중… (1분쯤)" : "그래프 재생성"}
    </Button>
  );
}
