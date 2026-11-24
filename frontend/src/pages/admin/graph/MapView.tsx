import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "../../../api/client";
import { DOMAIN_COLORS, Legend, TipRow, fmt } from "../../../components/charts/core";
import type { GraphHit, MapOut, MapZone, PeriodKey } from "../../../types/api";
import { DOMAIN_NAME, Panel, SignalBadge, pct } from "../dashboard/parts";
import { ChoiceSetting } from "../dashboard/settings";
import { domainName, queryString, type Selection } from "./explorer";
import { ScopeSettings, useScope } from "./Scope";
import styles from "./Graph.module.css";
import { StatusNote } from "./Status";
import { XCanvas, convexHull, type XArea, type XNode } from "./XCanvas";

type Method = "tsne" | "umap";
type ColorBy = "domain" | "zone";
const DEFAULTS = { method: "tsne" as Method, color: "domain" as ColorBy, areas: true, zones: 12, tight: true };
/**
 * 압력장 색 (2026-11-20 사용자: 분야 색 · 다른 압력장 색과 겹침)
 *   점 색 = 분야 → 압력장 영역은 무채색(회색), 마우스를 올리거나 고른 것만 강조색 보라 (분야 8색에 없는 색)
 *   점 색 = 압력장 → 분야 색이 화면에 없으므로 8색을 쓰되, 가까운 압력장끼리는 다른 색 (zonePalette)
 */
const ZONE_COLORS = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)", "var(--viz-5)", "var(--viz-6)", "var(--viz-7)", "var(--viz-8)"];
const ZONE_NEUTRAL = "var(--color-text-tertiary)";
const ZONE_ACTIVE = "var(--color-accent)";
const NEIGHBORS = ZONE_COLORS.length - 1; // 가장 가까운 7개와는 색이 겹치지 않게
const METHOD_LABEL: Record<Method, string> = { tsne: "t-SNE", umap: "UMAP" };
const cut = (s: string, n = 18) => (s.length > n ? `${s.slice(0, n)}…` : s);

/**
 * ② 집단 압력 지도 — 뜻이 가까운 상상이 가까이 놓이는 평면 지도 (2026-11-20 사용자 결정, 설계안 ②)
 *   점 = 상상 (크기 Thunder · 진하기 최근 · 색 분야/압력장), 영역 = 압력장(서로 다른 Dreamer 의 비슷한 상상 덩어리)
 *   "이름 없는 경향" = 주제 태그는 제각각인데 뜻이 한곳에 모인 압력장 (1위 주제가 절반 미만)
 *   좌표 계산 방법은 [설정]에서 t-SNE · UMAP 중 고른다 (graph-build 때 둘 다 계산해 둠)
 */
export function MapView({
  page,
  onSelect,
  selected,
  hit,
  onHitNote,
}: {
  page: PeriodKey;
  onSelect: (s: Selection | null) => void;
  selected: string | null;
  hit: GraphHit | null;
  /** 찾기 결과 안내 (검색 창 옆에 보임, 2026-11-20 사용자) */
  onHitNote: (note: string | null) => void;
}) {
  // 기간 · 분야 · 혼합 글은 이 그래프의 [설정]에서 (2026-11-20 사용자)
  const sc = useScope(page);
  const query = sc.query;
  const [set, setSet] = useState(DEFAULTS);
  const [data, setData] = useState<MapOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const qs = queryString(query);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api<MapOut>(`/api/admin/graph/map?${queryString(query, { method: set.method })}`).then(
      (d) => alive && (setData(d), setLoading(false)),
      (e) => alive && (setError(e instanceof ApiError ? e.message : "불러오지 못했어요."), setLoading(false)),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qs, set.method]);

  const zones = useMemo(() => (data?.zones ?? []).slice(0, set.zones === 0 ? undefined : set.zones), [data, set.zones]);
  const byZone = set.color === "zone";
  // [◇ 이름 없는 경향만] 거르기는 없앰 (2026-11-20 사용자: 샘플 데이터에 0개라 그림이 모두 흐려지기만 함). ◇ 표시는 있을 때만 보임
  const shownZones = zones;
  const pos = new Map((data?.points ?? []).map((p) => [p.id, p]));
  // 화면 좌표 — 군집 사이 빈 곳을 좁힌다 (2026-11-20 사용자: 군집 간격이 넓어 확대해도 작게 보임). 군집 모양 · 방향은 그대로
  const coords = useMemo(() => (set.tight && data ? tighten(data.points) : new Map<number, [number, number]>()), [data, set.tight]);
  const palette = useMemo(() => zonePalette(zones, pos, coords), [zones, data, coords]); // eslint-disable-line react-hooks/exhaustive-deps

  // 시작점 찾기 (2026-11-20): 기술 · 욕망 → 그 태그가 붙은 점만 진하게 + 상세, 상상 → 그 점을 고르고 확대
  const [hitIds, setHitIds] = useState<Set<number> | null>(null);
  const [hitNote, setHitNote] = useState<string | null>(null);
  const autoBlend = useRef(false); // 찾기 결과 때문에 Shake it 글을 저절로 넣었는가
  useEffect(() => {
    autoBlend.current = false; // 새로 찾을 때마다 처음부터
  }, [hit?.id]);
  useEffect(() => {
    setHitIds(null);
    setHitNote(null);
    if (!hit) return;
    if (hit.kind === "imagination") {
      setHitIds(new Set([Number(hit.id.slice(2))]));
      return;
    }
    let alive = true;
    api<number[]>(`/api/admin/graph/find?${queryString(query, { hit: hit.id })}`).then(async (ids) => {
      if (!alive) return;
      // 결과가 Shake it 글에만 있으면 Shake it 글을 넣고 다시 (2026-11-20 사용자: 골라도 아무것도 안 보였음)
      if (!ids.length && !query.blend) {
        const withBlend = await api<number[]>(`/api/admin/graph/find?${queryString({ ...query, blend: true }, { hit: hit.id })}`).catch(() => []);
        if (alive && withBlend.length) {
          autoBlend.current = true;
          sc.setScope({ ...sc.scope, blend: true });
          return;
        }
      }
      setHitIds(new Set(ids));
      if (!ids.length) setHitNote("상상 0개 (이 기간 · 분야에는 이 태그가 붙은 상상이 없어요)");
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hit?.id, qs]);
  // 기술 · 욕망 찾기 → 상세: 그 태그의 수치 · 원문 + "찾은 상상이 든 압력장" 목록 (2026-11-20 사용자: 압력장 둘이면 둘 다)
  useEffect(() => {
    if (!hit || hit.kind === "imagination" || !hitIds || !hitIds.size || !data) return;
    const ids = [...hitIds];
    const inZones = data.zones.map((z) => ({ z, n: z.item_ids.filter((i) => hitIds.has(i)).length })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
    const outside = ids.length - inZones.reduce((a, x) => a + x.n, 0);
    onSelect({
      id: `hit:${hit.id}`,
      kind: hit.kind === "tech" ? "tech" : "desire",
      badge: hit.kind === "tech" ? "기술" : "욕망",
      heading: hit.kind === "tech" ? `#${hit.label}` : hit.label,
      note: inZones.length ? `이 태그가 붙은 상상이 압력장 ${inZones.length}개에 들어 있어요. 압력장 이름은 그 압력장에서 가장 많이 붙은 주제 · 욕망이라, 이 태그와 다를 수 있어요.` : undefined,
      groups: {
        title: "찾은 상상이 든 압력장 (누르면 그 압력장 상세)",
        items: [
          ...inZones.map(({ z, n }) => ({
            label: `${z.key} · ${z.name}`,
            detail: `찾은 상상 ${n}개 / 압력장 ${z.size}개 · Dreamer ${z.dreamers}명`,
            onPick: () => onSelect(zoneSel(z)),
          })),
          ...(outside > 0 ? [{ label: "압력장 밖", detail: `${outside}개` }] : []),
        ],
      },
      url: `/api/admin/graph/items/inspect?${queryString(query, { ids: ids.slice(0, 500).join(","), kind: hit.kind, title: hit.label })}`,
      ref: { view: "map", hit: hit.id, ...query },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hitIds, data]);
  const hitPoint = hit?.kind === "imagination" ? Number(hit.id.slice(2)) : null;
  useEffect(() => {
    if (hitPoint === null || !data) return;
    const p = pos.get(hitPoint);
    if (p) {
      pointSelect(`i:${p.id}`);
    } else if (!query.blend) {
      autoBlend.current = true;
      sc.setScope({ ...sc.scope, blend: true }); // Shake it 글일 수 있으니 넣고 다시 본다
    } else setHitNote("지도에 없는 상상 (기간 · 분야 밖이거나 임베딩 전)");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hitPoint, data]);
  const pointSelect = (id: string) => {
    const p = pos.get(Number(id.slice(2)));
    if (!p) return;
    onSelect({
      id,
      kind: "quote",
      badge: p.kind === "blend" ? "상상 · Shake it" : "상상",
      heading: p.title,
      groups: (() => {
        const z = p.zone ? data?.zones.find((x) => x.key === p.zone) : undefined;
        return z
          ? { title: "이 상상이 든 압력장 (누르면 그 압력장 상세)", items: [{ label: `${z.key} · ${z.name}`, detail: `상상 ${z.size}개 · Dreamer ${z.dreamers}명`, onPick: () => onSelect(zoneSel(z)) }] }
          : { title: "이 상상이 든 압력장", items: [{ label: "압력장 밖", detail: "다른 Dreamer 의 비슷한 상상(0.92 이상)과 덩어리를 이루지 않았어요" }] };
      })(),
      url: `/api/admin/graph/items/inspect?${queryString(query, { ids: p.id, kind: "quote", title: p.title })}`,
      ref: { view: "map", id: p.id, ...query },
    });
  };
  const hitCount = (z: MapZone) => (hitIds ? z.item_ids.filter((i) => hitIds.has(i)).length : 0);
  // 검색 창 옆 결과 안내 — "○○ 적용 결과 | 상상 24개 · 압력장 4개" (2026-11-20 사용자)
  const blendNote = autoBlend.current ? " (Shake it 글에만 있어 [설정]의 Shake it 글 넣기로 변경)" : "";
  const resultNote = !hit
    ? null
    : (hitNote ??
      (!hitIds || !data
        ? null
        : hit.kind === "imagination"
          ? pos.has(hitPoint ?? -1)
            ? `지도에 표시 · ${pos.get(hitPoint!)?.zone ? `압력장 ${pos.get(hitPoint!)!.zone}` : "압력장 밖"}${autoBlend.current ? " (Shake it 글이라 [설정]의 Shake it 글 넣기로 변경)" : ""}`
            : null
          : `상상 ${hitIds.size}개 · 압력장 ${data.zones.filter((z) => hitCount(z) > 0).length}개${blendNote}`));
  useEffect(() => onHitNote(resultNote), [resultNote]); // eslint-disable-line react-hooks/exhaustive-deps
  // 찾기 결과가 든 압력장은 [압력장 수] 밖이어도 영역 · 표에 넣는다
  const areaZones = hitIds ? [...shownZones, ...(data?.zones ?? []).filter((z) => !shownZones.includes(z) && hitCount(z) > 0)] : shownZones;

  const zoneSel = (z: MapZone): Selection => ({
    id: `zone:${z.key}`,
    kind: "zone",
    badge: z.unnamed ? "압력장 · 이름 없는 경향" : "압력장",
    heading: `${z.key} · ${z.name}`,
    note: z.unnamed
      ? "주제 태그는 제각각인데 뜻이 한곳에 모였어요 — 아직 이름이 붙지 않은 경향일 수 있어요. 이름(핵심 주제 × 핵심 욕망)은 계산으로 붙였어요."
      : "서로 다른 Dreamer 의 비슷한 상상(AI 가 고른 연결 점수 0.92 이상) 덩어리예요. 이름(핵심 주제 × 핵심 욕망)은 계산으로 붙였어요.",
    rows: [
      ["결집도", fmt(z.cohesion, 3)],
      ["주제 다양성", fmt(z.diversity, 2)],
      ["핵심 주제", z.techs.slice(0, 3).map((t) => `#${t.label} (${t.count}개)`).join(" · ") || "—", `${z.techs.slice(0, 3).length}개`],
      ["핵심 욕망", z.desires.map((t) => `${t.label} (${t.count}개)`).join(" · ") || "—", `${z.desires.length}개`],
    ],
    url: `/api/admin/graph/items/inspect?${queryString(query, { ids: z.item_ids.join(","), kind: "zone", title: z.name })}`,
    ref: { view: "map", zone: z.key, method: set.method, ...query },
  });

  const xNodes: XNode[] = (data?.points ?? []).map((p) => {
    const zc = p.zone ? palette.get(p.zone) : undefined;
    const fill = !byZone ? (p.domain ? DOMAIN_COLORS[p.domain] : "var(--viz-axis)") : (zc ?? "var(--viz-axis)");
    return {
      id: `i:${p.id}`,
      x: (coords.get(p.id)?.[0] ?? p.x) * 1000,
      y: (coords.get(p.id)?.[1] ?? p.y) * 1000,
      r: Math.min(12, 2.5 + Math.sqrt(p.thunders) * 0.9),
      fill,
      opacity: hitIds ? (hitIds.has(p.id) ? 0.95 : 0.06) : 0.25 + 0.7 * p.recency,
      // 찾은 점 = 보라 테두리 (압력장 강조와 같은 색, 2026-11-20 사용자)
      strokeWidth: hitIds?.has(p.id) ? 2.5 : p.kind === "blend" ? 2 : 0.6,
      stroke: hitIds?.has(p.id) ? ZONE_ACTIVE : p.kind === "blend" ? "var(--color-shake-from)" : undefined,
      label: p.title,
      tip: (
        <>
          <b>{cut(p.title, 30)}</b>
          <TipRow label="작성자" value={`@${p.author}`} />
          <TipRow label="분야" value={domainName(p.domain)} />
          {p.tech ? <TipRow label="주제" value={`#${p.tech}`} /> : null}
          <TipRow label="Thunder" value={p.thunders} />
          {p.zone ? <TipRow label="압력장" value={p.zone} /> : null}
          {p.kind === "blend" ? <TipRow label="" value="Shake it 혼합 글 (재료 가운데)" /> : null}
        </>
      ),
    };
  });
  const areas: XArea[] = set.areas
    ? areaZones.flatMap((z) => {
        const pts = z.item_ids.map((i) => pos.get(i)).filter((p): p is NonNullable<typeof p> => !!p).map((p) => [(coords.get(p.id)?.[0] ?? p.x) * 1000, (coords.get(p.id)?.[1] ?? p.y) * 1000] as [number, number]);
        if (pts.length < 3) return [];
        return [
          {
            id: `zone:${z.key}`,
            points: convexHull(pts),
            // 찾기 결과가 든 압력장은 보라로 강조 (2026-11-20 사용자)
            color: hitCount(z) > 0 ? ZONE_ACTIVE : byZone ? (palette.get(z.key) ?? ZONE_NEUTRAL) : ZONE_NEUTRAL,
            activeColor: byZone && !(hitCount(z) > 0) ? undefined : ZONE_ACTIVE,
            strong: hitCount(z) > 0,
            label: `${z.key}${z.unnamed ? " ◇" : ""} ${cut(z.name, 14)}`,
            tip: (
              <>
                <b>
                  {z.key} · {z.name}
                </b>
                <TipRow label="상상 · Dreamer" value={`${z.size}개 · ${z.dreamers}명`} />
                <TipRow label="결집도 · 주제 다양성" value={`${fmt(z.cohesion, 3)} · ${fmt(z.diversity, 2)}`} />
                {z.unnamed ? <TipRow label="" value="◇ 이름 없는 경향 (주제는 제각각, 뜻은 모임)" /> : null}
              </>
            ),
          },
        ];
      })
    : [];

  const methods = (data?.available ?? []) as Method[];
  return (
    <Panel
      wide
      title={`집단 압력 지도 — 의미 지도 (${METHOD_LABEL[set.method]})`}
      hint={
        <>
          서로 모르는 사람들이 비슷한 상상을 반복하는 곳(욕망의 벡터)을 봐요. 가까운 점 = 뜻이 비슷한 상상. 점 크기 = Thunder, 진할수록 최근. 영역 = 압력장(서로 다른 Dreamer 의 비슷한 상상 덩어리). 좌표 방법은 [설정]에서 바꿔요.
          <StatusNote />
        </>
      }
      loading={loading}
      changed={sc.changed || set.method !== DEFAULTS.method || set.color !== DEFAULTS.color || set.areas !== DEFAULTS.areas || set.zones !== DEFAULTS.zones || set.tight !== DEFAULTS.tight}
      onReset={() => (setSet(DEFAULTS), sc.reset())}
      settings={
        <>
          <ScopeSettings s={sc} page={page} />
          <ChoiceSetting
            label="좌표 계산"
            options={(["tsne", "umap"] as Method[]).map((m) => ({ key: m, label: `${METHOD_LABEL[m]}${data && !methods.includes(m) ? " (계산 전)" : ""}` }))}
            value={set.method}
            onChange={(v) => setSet({ ...set, method: v })}
          />
          <ChoiceSetting
            label="점 색"
            options={[
              { key: "domain" as ColorBy, label: "분야" },
              { key: "zone" as ColorBy, label: "압력장" },
            ]}
            value={set.color}
            onChange={(v) => setSet({ ...set, color: v })}
          />
          <ChoiceSetting
            label="압력장 영역"
            options={[
              { key: 1, label: "보이기" },
              { key: 0, label: "숨기기" },
            ]}
            value={set.areas ? 1 : 0}
            onChange={(v) => setSet({ ...set, areas: v === 1 })}
          />
          <ChoiceSetting
            label="군집 간격"
            options={[
              { key: 1, label: "좁게 (기본)" },
              { key: 0, label: "계산 좌표 그대로" },
            ]}
            value={set.tight ? 1 : 0}
            onChange={(v) => setSet({ ...set, tight: v === 1 })}
          />
          <ChoiceSetting label="압력장 수" options={[6, 12, 20, 0].map((k) => ({ key: k, label: k ? `${k}개` : "모두" }))} value={set.zones} onChange={(v) => setSet({ ...set, zones: v })} />
        </>
      }
    >
      {error ? <p className={styles.error}>{error}</p> : null}
      {data && !data.points.length ? (
        <p className={styles.emptyLine}>
          {data.available.length ? "이 기간 · 분야에는 지도에 놓을 상상이 없어요." : "아직 지도 좌표가 없어요. 위의 [그래프 재생성]을 누르면 t-SNE · UMAP 좌표를 계산해요 (1분쯤)."}
        </p>
      ) : null}
      {data && data.points.length ? (
        <>
          <Legend
            items={
              set.color === "domain"
                ? Object.entries(DOMAIN_NAME).map(([k, v]) => ({ label: v, color: DOMAIN_COLORS[k] }))
                : zones.slice(0, 8).map((z) => ({ label: `${z.key} ${cut(z.name, 12)}`, color: palette.get(z.key) ?? ZONE_NEUTRAL }))
            }
          />
          <XCanvas
            nodes={xNodes}
            edges={[]}
            areas={areas}
            height={700}
            onBackground={() => onSelect(null)}
            zoomTo={hitPoint !== null && pos.has(hitPoint) ? `i:${hitPoint}` : null}
            keepRatio
            zoomLabels={false}
            selected={selected}
            onNode={pointSelect}
            onArea={(id) => {
              const z = zones.find((x) => `zone:${x.key}` === id);
              if (z) onSelect(zoneSel(z));
            }}
            ariaLabel="상상 의미 지도"
            pad={30}
          />
          <p className={styles.caption}>
            상상 {data.points.length.toLocaleString()}개{data.unplaced ? ` · 좌표 없는 상상 ${data.unplaced}개 (임베딩 전이거나 재생성 전에 올라온 글)` : ""} · 압력장 {data.zones.length}개 (이름 없는 경향{" "}
            {data.zones.filter((z) => z.unnamed).length})
          </p>
          <ZoneTable
            zones={hitIds ? [...areaZones].sort((a, b) => hitCount(b) - hitCount(a)) : shownZones}
            selected={selected}
            onPick={(z) => onSelect(zoneSel(z))}
            colorOf={(k) => (byZone ? (palette.get(k) ?? ZONE_NEUTRAL) : null)}
            hitCount={hitIds ? hitCount : null}
          />
        </>
      ) : null}
    </Panel>
  );
}

function ZoneTable({
  zones,
  selected,
  onPick,
  colorOf,
  hitCount,
}: {
  zones: MapZone[];
  selected: string | null;
  onPick: (z: MapZone) => void;
  /** 압력장 칸 색 (점 색 = 압력장일 때만, 아니면 null = 회색 칸) */
  colorOf: (k: string) => string | null;
  /** 찾기로 거른 상상이 압력장마다 몇 개 들었나 — 있으면 칸을 더하고 많은 순, 든 줄 강조 */
  hitCount: ((z: MapZone) => number) | null;
}) {
  if (!zones.length) return <p className={styles.emptyLine}>조건에 맞는 압력장이 없어요.</p>;
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>압력장</th>
            <th>이름 (핵심 주제 × 핵심 욕망)</th>
            <th>상상</th>
            <th>Dreamer</th>
            <th title="안쪽 비슷한 상상 연결 점수 평균">결집도</th>
            <th title="1 − 1위 주제가 붙은 비율 (높을수록 주제가 제각각)">주제 다양성</th>
            <th>흐름</th>
            {hitCount ? <th>찾은 상상</th> : null}
          </tr>
        </thead>
        <tbody>
          {zones.map((z) => (
            <tr key={z.key} className={clsx(styles.row, selected === `zone:${z.key}` && styles.rowOn, hitCount && hitCount(z) > 0 && styles.rowHit)} onClick={() => onPick(z)}>
              <td>
                <span className={styles.zoneKey} style={colorOf(z.key) ? { background: colorOf(z.key)!, color: "var(--color-text-inverse)" } : undefined}>
                  {z.key}
                </span>
              </td>
              <td className={styles.nameCell}>
                {z.unnamed ? <span className={styles.unnamed}>◇ 이름 없는 경향</span> : null}
                {z.name}
              </td>
              <td>{z.size}</td>
              <td>{z.dreamers}</td>
              <td>{fmt(z.cohesion, 3)}</td>
              <td>{fmt(z.diversity, 2)}</td>
              <td>
                <SignalBadge signal={z.trend.signal} /> {z.trend.growth !== null ? pct(z.trend.growth) : ""}
              </td>
              {hitCount ? <td>{hitCount(z) || "—"}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const GROUP_EPS = 0.03; // 이보다 가까운 점은 같은 군집 (좌표 0~1 기준)
const PULL = 0.5; // 군집 가운데를 전체 가운데 쪽으로 절반만큼 당긴다
const GAP = 0.012; // 군집 사이 최소 여백

/**
 * 군집 간격 좁히기 (2026-11-20) — 화면에서만 바꾸고 계산 좌표(t-SNE · UMAP)는 그대로 둔다
 *   1) 가까운 점끼리(GROUP_EPS) 이어 군집을 만든다
 *   2) 군집마다 가운데를 전체 가운데 쪽으로 PULL 만큼 당긴다 (방향은 그대로, 군집 안 모양도 그대로)
 *   3) 겹치는 군집은 서로 밀어낸다 (원 두 개가 닿지 않을 때까지). 실측: 방향 평균 3~4° 바뀜, 그림 폭 약 58%
 */
function tighten(points: MapOut["points"]): Map<number, [number, number]> {
  const n = points.length;
  const parent = points.map((_, i) => i);
  const find = (a: number): number => {
    while (parent[a] !== a) a = parent[a] = parent[parent[a]];
    return a;
  };
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) if (Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) < GROUP_EPS) parent[find(i)] = find(j);
  const groups = new Map<number, number[]>();
  points.forEach((_, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), i]));
  const cx = points.reduce((a, p) => a + p.x, 0) / Math.max(1, n);
  const cy = points.reduce((a, p) => a + p.y, 0) / Math.max(1, n);
  const gs = [...groups.values()].map((idx) => {
    const gx = idx.reduce((a, i) => a + points[i].x, 0) / idx.length;
    const gy = idx.reduce((a, i) => a + points[i].y, 0) / idx.length;
    const r = Math.max(...idx.map((i) => Math.hypot(points[i].x - gx, points[i].y - gy))) + GAP;
    return { idx, gx, gy, r, x: cx + (gx - cx) * PULL, y: cy + (gy - cy) * PULL };
  });
  for (let it = 0; it < 400; it++) {
    let moved = false;
    for (let a = 0; a < gs.length; a++)
      for (let b = a + 1; b < gs.length; b++) {
        const A = gs[a];
        const B = gs[b];
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const d = Math.hypot(dx, dy) || 1e-6;
        const need = A.r + B.r;
        if (d < need) {
          const push = (need - d) / 2;
          A.x -= (dx / d) * push;
          A.y -= (dy / d) * push;
          B.x += (dx / d) * push;
          B.y += (dy / d) * push;
          moved = true;
        }
      }
    if (!moved) break;
  }
  const out = new Map<number, [number, number]>();
  for (const g of gs) for (const i of g.idx) out.set(points[i].id, [g.x + points[i].x - g.gx, g.y + points[i].y - g.gy]);
  return out;
}

/**
 * 압력장마다 색 — 가까운 압력장끼리 다른 색 (2026-11-20 사용자: 압력장끼리 색이 겹침)
 *   A → B → C 순서로, 이미 색을 받은 압력장 중 가장 가까운 7개가 쓰지 않은 색을 고른다 (8색이라 늘 하나는 남음).
 *   가까운지 = 지금 화면 좌표에서 압력장 가운데 사이 거리
 */
function zonePalette(zones: MapZone[], pos: Map<number, MapOut["points"][number]>, coords: Map<number, [number, number]>): Map<string, string> {
  const center = new Map<string, [number, number]>();
  for (const z of zones) {
    const pts = z.item_ids.map((i) => coords.get(i) ?? (pos.get(i) ? [pos.get(i)!.x, pos.get(i)!.y] : null)).filter((p): p is [number, number] => !!p);
    if (pts.length) center.set(z.key, [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length]);
  }
  const out = new Map<string, string>();
  const done: string[] = [];
  for (const z of zones) {
    const c = center.get(z.key);
    if (!c) continue;
    const near = done
      .map((k) => ({ k, d: Math.hypot(center.get(k)![0] - c[0], center.get(k)![1] - c[1]) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, NEIGHBORS)
      .map((x) => out.get(x.k));
    out.set(z.key, ZONE_COLORS.find((col) => !near.includes(col)) ?? ZONE_COLORS[done.length % ZONE_COLORS.length]);
    done.push(z.key);
  }
  return out;
}
