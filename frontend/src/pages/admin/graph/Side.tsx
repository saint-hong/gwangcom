import clsx from "clsx";
import {
  Check,
  Copy,
  ExternalLink,
  Pin as PinIcon,
  Trash2,
  Waves,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../../api/client";
import { useToast } from "../../../components/feedback/Toast";
import { fmt } from "../../../components/charts/core";
import type { Pin, PinIn, XInspect, XItem } from "../../../types/api";
import { shortDate } from "../adminFormat";
import { SignalBadge } from "../dashboard/parts";
import {
  PIN_KIND,
  boardMarkdown,
  domainName,
  pinFromInspect,
  pinFromItem,
  trendText,
  type Selection,
} from "./explorer";
import styles from "./Graph.module.css";

/** 근거함 상태 (페이지에 하나) — 담기 · 빼기 · 비우기 */
export function usePins() {
  const toast = useToast();
  const [pins, setPins] = useState<Pin[]>([]);
  const load = useCallback(
    () => api<Pin[]>("/api/admin/graph/pins").then(setPins, () => undefined),
    [],
  );
  useEffect(() => void load(), [load]);
  const add = async (p: PinIn) => {
    try {
      const saved = await api<Pin>("/api/admin/graph/pins", {
        method: "POST",
        json: p,
      });
      setPins((prev) => [saved, ...prev.filter((x) => x.id !== saved.id)]);
      toast.show("근거함에 담았어요.");
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "담지 못했어요.");
    }
  };
  const remove = async (id: number) => {
    await api(`/api/admin/graph/pins/${id}`, { method: "DELETE" }).catch(
      () => undefined,
    );
    setPins((prev) => prev.filter((p) => p.id !== id));
  };
  const clear = async () => {
    await api("/api/admin/graph/pins", { method: "DELETE" }).catch(
      () => undefined,
    );
    setPins([]);
  };
  const has = (kind: string, title: string) =>
    pins.some((p) => p.kind === kind && p.title === title);
  return { pins, add, remove, clear, has };
}
export type Pins = ReturnType<typeof usePins>;

/** 그림 아래 "상세" 칸 (2026-11-20 사용자: 오른쪽 → 아래, 근거함은 탭 줄 버튼으로 옮기고 여기는 제목 "상세") */
export function DetailPanel({ sel, pins }: { sel: Selection | null; pins: Pins }) {
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!sel) return;
    // 그림 아래에 있으므로, 화면 밖이면 윗부분이 보이도록 조금만 내린다 (그림은 계속 보이게)
    const top = box.current?.getBoundingClientRect().top;
    if (top !== undefined && top > window.innerHeight - 160) window.scrollBy({ top: top - window.innerHeight + 280, behavior: "smooth" });
  }, [sel]);
  return (
    <section ref={box} className={styles.side} aria-labelledby="xDetailTitle">
      <h2 id="xDetailTitle" className={styles.sideHead}>
        상세
      </h2>
      <Inspector sel={sel} pins={pins} />
    </section>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

/** 탭 줄 오른쪽 끝 [Observe Note 근거함 (n)] — 누르면 아래로 펼쳐지는 근거함 (바깥을 누르거나 Esc 로 닫음) */
export function PinboardButton({ pins, scope }: { pins: Pins; scope: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={box} className={styles.boardWrap}>
      <button type="button" className={clsx(styles.boardBtn, open && styles.boardBtnOn)} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <PinIcon aria-hidden="true" />
        Observe Note 근거함{pins.pins.length ? ` (${pins.pins.length})` : ""}
      </button>
      {open ? (
        <div className={styles.boardPop} role="dialog" aria-label="Observe Note 근거함">
          <div className={styles.boardPopHead}>
            <b>Observe Note 근거함</b>
            <button type="button" className={styles.iconBtn} onClick={() => setOpen(false)} aria-label="닫기" title="닫기">
              <X aria-hidden="true" />
            </button>
          </div>
          <Pinboard pins={pins} scope={scope} />
        </div>
      ) : null}
    </div>
  );
}

function Inspector({ sel, pins }: { sel: Selection | null; pins: Pins }) {
  const [data, setData] = useState<XInspect | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [already, setAlready] = useState(false); // 이미 담은 것을 다시 누름 → 안내 문구
  useEffect(() => {
    setData(null);
    setError(null);
    setAlready(false);
    if (!sel?.url) return;
    let alive = true;
    api<XInspect>(sel.url).then(
      (d) => alive && setData(d),
      (e) =>
        alive &&
        setError(e instanceof ApiError ? e.message : "불러오지 못했어요."),
    );
    return () => {
      alive = false;
    };
  }, [sel]);

  if (!sel)
    return (
      <div className={styles.sideEmpty}>
        <b>위 그림에서 점 · 선 · 영역을 눌러 보세요</b>
        <p>
          여기에 수치(상상 수 · 반응 · 흐름)와 실제 원문이 나와요. 마음에 드는
          신호와 문장은 [근거함에 담기]로 모아 두었다가 Observe Note 를 쓸 때
          꺼내 써요.
        </p>
      </div>
    );
  const pinned =
    data || sel.pin ? pins.has(sel.kind, sel.pin?.title ?? sel.heading) : false;
  const items = sel.items ?? data?.items ?? [];
  const pinIn = data ? pinFromInspect(sel, data) : (sel.pin ?? null);
  return (
    <div className={styles.inspect}>
      <div className={styles.inspectInfo}>
        <span className={styles.kindBadge}>{sel.badge}</span>
        {/* 제목 옆 [근거함에 담기] (2026-11-20 사용자) */}
        <div className={styles.titleRow}>
          <h3 className={styles.sideTitle}>{sel.heading}</h3>
          {pinIn ? (
            <>
              {/* 이미 담았어도 같은 버튼 — 누르면 옆에 안내 (2026-11-20 사용자) */}
              <button type="button" className={styles.pinBtn} onClick={() => (pinned ? setAlready(true) : void pins.add(pinIn))}>
                <PinIcon aria-hidden="true" />
                근거함에 담기
              </button>
              {already && pinned ? (
                <span className={styles.pinNotice} role="status">
                  <Check aria-hidden="true" />
                  근거함에 담겨 있어요.
                </span>
              ) : null}
            </>
          ) : null}
        </div>
        {sel.note ? <p className={styles.sideNote}>{sel.note}</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}
        {sel.url && !data && !error ? <p className={styles.sideNote}>수치를 계산하는 중…</p> : null}
        {/* 요약 카드 (2026-11-20 사용자: 정보가 흩어져 알아보기 어려움 → 작은 숫자 카드 한 줄 + 흐름 · 분야 · 욕망 카드) */}
        {sel.rows?.length || data ? (
          <dl className={styles.facts}>
            {data ? (
              <>
                <Fact k="상상" v={`${data.count}개`} />
                <Fact k="Dreamer" v={`${data.dreamers}명`} />
                <Fact k="평균 Thunder" v={fmt(data.thunder_avg, 1)} />
                <Fact k="평균 Wave" v={fmt(data.wave_avg, 1)} />
                {data.rank_pct !== null ? <Fact k="같은 종류 연결 중" v={`상위 ${Math.max(1, Math.round(data.rank_pct * 100))}%`} /> : null}
              </>
            ) : null}
            {(sel.rows ?? []).map(([k, v]) => (
              <Fact key={k} k={k} v={v} />
            ))}
          </dl>
        ) : null}
        {sel.groups?.items.length ? (
          <div className={styles.card}>
            <span className={styles.cardLabel}>{sel.groups.title}</span>
            <ul className={styles.groupList}>
              {sel.groups.items.map((g) => (
                <li key={g.label}>
                  {g.onPick ? (
                    <button type="button" onClick={g.onPick}>
                      <b>{g.label}</b>
                      <span>{g.detail}</span>
                    </button>
                  ) : (
                    <span className={styles.groupStatic}>
                      <b>{g.label}</b>
                      <span>{g.detail}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {data ? (
          <div className={styles.cards}>
            <div className={styles.card}>
              <span className={styles.cardLabel}>흐름 (기간 앞 절반 → 뒤 절반)</span>
              <div className={styles.trendRow}>
                <SignalBadge signal={data.trend.signal} colored />
                <span>{trendText(data.trend)}</span>
              </div>
              <span className={styles.cardSub}>
                {data.first_at && data.last_at ? `${shortDate(data.first_at).slice(0, 10)} ~ ${shortDate(data.last_at).slice(0, 10)}` : "—"}
              </span>
            </div>
            {data.domains.length ? (
              <div className={styles.card}>
                <span className={styles.cardLabel}>분야</span>
                <div className={styles.chips}>
                  {data.domains.map((d) => (
                    <span key={d.name} className={styles.domainChip}>
                      {domainName(d.name)} {d.count}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {data.members.length ? (
              <div className={styles.card}>
                <span className={styles.cardLabel}>묶음 안의 욕망</span>
                <div className={styles.chips}>
                  {data.members.slice(0, 12).map((m) => (
                    <span key={m.label} className={styles.desireChip}>
                      {m.label} {m.count}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {items.length ? (
        <section className={styles.itemList}>
          <h4>
            원문 상상{" "}
            {data && data.count > items.length
              ? `(Thunder 많은 ${items.length}개 / ${data.count}개)`
              : `${items.length}개`}
          </h4>
          <ul>
            {items.map((i) => (
              <ItemRow key={i.id} item={i} pins={pins} refBase={sel.ref} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function ItemRow({
  item,
  pins,
  refBase,
}: {
  item: XItem;
  pins: Pins;
  refBase: Record<string, unknown>;
}) {
  const p = pinFromItem(item, refBase);
  const pinned = pins.has(p.kind, p.title);
  return (
    <li className={styles.item}>
      <div className={styles.itemHead}>
        <a
          href={`/i/${item.id}`}
          target="_blank"
          rel="noreferrer"
          className={styles.itemTitle}
        >
          {item.kind === "blend" ? (
            <span className={styles.blendMark}>Shake it</span>
          ) : null}
          {item.title}
          <ExternalLink aria-hidden="true" />
        </a>
        <button
          type="button"
          className={clsx(styles.iconBtn, pinned && styles.iconBtnOn)}
          disabled={pinned}
          onClick={() => void pins.add(p)}
          aria-label="이 원문을 근거함에 담기"
          title={pinned ? "근거함에 있어요" : "이 원문을 근거함에 담기"}
        >
          {pinned ? (
            <Check aria-hidden="true" />
          ) : (
            <PinIcon aria-hidden="true" />
          )}
        </button>
      </div>
      <p className={styles.itemText}>{item.excerpt}</p>
      {item.desire ? (
        <p className={styles.itemDesire}>왜 원하나요 · {item.desire}</p>
      ) : null}
      <div className={styles.itemMeta}>
        <span>@{item.author}</span>
        <span>{domainName(item.domain)}</span>
        <span title="Thunder">
          <Zap aria-hidden="true" /> {item.thunders}
        </span>
        <span title="Wave">
          <Waves aria-hidden="true" /> {item.waves}
        </span>
        {item.techs.slice(0, 3).map((t) => (
          <span key={t} className={styles.techTag}>
            #{t}
          </span>
        ))}
      </div>
    </li>
  );
}

/** 근거함 — 담은 신호 · 원문, [Markdown 복사] → 노트 쓰기 화면에 붙여 넣거나 노트 쓰기의 근거함에서 바로 넣기 */
function Pinboard({ pins, scope }: { pins: Pins; scope: string }) {
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(boardMarkdown(pins.pins, scope));
      toast.show(
        "근거 자료를 Markdown 으로 복사했어요. 노트 본문에 붙여 넣어 보세요.",
      );
    } catch {
      toast.show(
        "복사하지 못했어요. 노트 쓰기 화면의 [탐색기 근거함]에서 바로 넣을 수 있어요.",
      );
    }
  };
  if (!pins.pins.length)
    return (
      <div className={styles.sideEmpty}>
        <b>근거함이 비어 있어요</b>
        <p>
          상세의 [근거함에 담기]나 원문 옆 핀을 누르면 여기에
          모여요. AI 는 노트를 쓰지 않아요 — 모은 근거를 보고 직접 쓰세요.
        </p>
      </div>
    );
  return (
    <div className={styles.sideBody}>
      <div className={styles.boardActions}>
        <button
          type="button"
          className={styles.pinBtn}
          onClick={() => void copy()}
        >
          <Copy aria-hidden="true" /> Markdown 복사
        </button>
        <a href="/admin/notes/new" className={styles.textLink}>
          새 노트 쓰기
        </a>
        {confirm ? (
          <span className={styles.confirm}>
            모두 비울까요?
            <button
              type="button"
              onClick={() => (void pins.clear(), setConfirm(false))}
            >
              비우기
            </button>
            <button type="button" onClick={() => setConfirm(false)}>
              그대로
            </button>
          </span>
        ) : (
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => setConfirm(true)}
            aria-label="근거함 모두 비우기"
            title="근거함 모두 비우기"
          >
            <Trash2 aria-hidden="true" />
          </button>
        )}
      </div>
      <ul className={styles.pinList}>
        {pins.pins.map((p) => (
          <li key={p.id} className={styles.pin}>
            <div className={styles.itemHead}>
              <span className={styles.kindBadge}>{PIN_KIND[p.kind]}</span>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => void pins.remove(p.id)}
                aria-label="근거함에서 빼기"
                title="근거함에서 빼기"
              >
                <X aria-hidden="true" />
              </button>
            </div>
            <b className={styles.pinTitle}>{p.title}</b>
            <p className={styles.itemText}>{p.summary}</p>
            {p.stat ? <p className={styles.pinStat}>{p.stat}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
