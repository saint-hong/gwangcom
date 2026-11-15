import { ChevronDown, ChevronUp } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "../../../design-system";
import type { TechSignal } from "../../../types/api";
import dashStyles from "./Dashboard.module.css";
import styles from "./TechPicker.module.css";
import { Row } from "./settings";
import { SIGNAL, SIGNAL_COLOR, SignalBadge } from "./parts";

type Group = "all" | TechSignal["signal"];
const GROUPS: Group[] = ["all", "new", "rising", "steady", "cooling"];
const GROUP_LABEL = (g: Group) => (g === "all" ? "전체" : SIGNAL[g].label);

/** 고르기 왼쪽 묶음 (신호 그룹 · 군집 등) */
export type PickGroup = { key: string; label: string; color?: string };
/** 고르기 오른쪽 항목. badge 는 "전체" 묶음을 볼 때만 보인다 (어느 묶음인지 알 수 있게) */
export type PickItem = { id: string; label: string; group: string; count: number; badge?: ReactNode };
const ALL = "__all";

/**
 * 묶음 → 항목 고르기 (2026-11-14 기술 고르기로 만들고, 2026-11-15 군집 고르기에도 쓰도록 넓힘)
 *   설정 영역 안에서 아래로 펼쳐짐. 왼쪽 묶음(맨 위 "전체") → 오른쪽 그 묶음의 항목(설정 폭만큼 여러 칸, 맨 끝 "모두"), 길면 상하 스크롤
 *   고른 것은 묶음을 옮겨도 남아서, 여러 묶음의 항목을 섞어 고를 수 있다. [적용]을 눌러야 그래프에 반영된다.
 */
export function GroupPicker({
  groups,
  items,
  initial,
  help,
  groupAria,
  onApply,
  onClose,
}: {
  groups: PickGroup[];
  items: PickItem[];
  initial: string[];
  help: string;
  groupAria: string;
  onApply: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [group, setGroup] = useState<string>(ALL);
  const [sel, setSel] = useState<Set<string>>(new Set(initial));
  const all: PickGroup = { key: ALL, label: "전체" };

  const inGroup = (g: string) => items.filter((t) => g === ALL || t.group === g);
  const list = inGroup(group);
  const ids = list.map((t) => t.id);
  const allOn = ids.length > 0 && ids.every((id) => sel.has(id));
  const label = (g: string) => (g === ALL ? "전체" : (groups.find((x) => x.key === g)?.label ?? g));
  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = () =>
    setSel((s) => {
      const n = new Set(s);
      ids.forEach((id) => (allOn ? n.delete(id) : n.add(id)));
      return n;
    });

  return (
    <div className={styles.picker}>
      <p className={styles.help}>{help}</p>
      <div className={styles.body}>
        <ul className={styles.groups} role="listbox" aria-label={groupAria}>
          {[all, ...groups].map((g) => {
            const gi = inGroup(g.key).map((t) => t.id);
            const picked = gi.filter((id) => sel.has(id)).length;
            return (
              <li key={g.key}>
                <button type="button" className={styles.group} aria-selected={group === g.key} onClick={() => setGroup(g.key)}>
                  <span className={styles.groupName}>
                    {g.color ? <span className={styles.groupSwatch} style={{ background: g.color }} aria-hidden="true" /> : null}
                    {g.label}
                  </span>
                  <span className={styles.groupCount}>
                    {picked ? `${picked} / ` : ""}
                    {gi.length}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <ul className={styles.techs} aria-label={`${label(group)} 항목`}>
          {list.length === 0 ? <li className={styles.empty}>이 묶음에 항목이 없어요.</li> : null}
          {list.map((t) => (
            <li key={t.id}>
              <label className={styles.tech}>
                <input type="checkbox" checked={sel.has(t.id)} onChange={() => toggle(t.id)} />
                <span className={styles.techName}>{t.label}</span>
                {group === ALL ? t.badge : null}
                <span className={styles.techCount}>상상 {t.count}</span>
              </label>
            </li>
          ))}
          {list.length ? (
            <li className={styles.allRow}>
              <label className={styles.tech}>
                <input type="checkbox" checked={allOn} onChange={toggleAll} />
                <span className={styles.techName}>모두</span>
              </label>
            </li>
          ) : null}
        </ul>
      </div>
      <div className={styles.foot}>
        <span className={styles.footCount}>{sel.size}개 고름</span>
        <Button size="sm" variant="outline" onClick={() => setSel(new Set())} disabled={sel.size === 0}>
          선택 해제
        </Button>
        <Button size="sm" variant="outline" onClick={onClose}>
          접기
        </Button>
        <Button size="sm" onClick={() => (onApply([...sel]), onClose())}>
          적용
        </Button>
      </div>
    </div>
  );
}

/** 기술 고르기 — 왼쪽 = 신호 그룹 (기술 흐름 탭 · 생키) */
export function TechPicker({ techs, initial, onApply, onClose }: { techs: TechSignal[]; initial: string[]; onApply: (ids: string[]) => void; onClose: () => void }) {
  return (
    <GroupPicker
      groups={GROUPS.filter((g) => g !== "all").map((g) => ({ key: g, label: GROUP_LABEL(g), color: SIGNAL_COLOR[g as TechSignal["signal"]] }))}
      items={techs.map((t) => ({ id: String(t.tag_id), label: `#${t.label}`, group: t.signal, count: t.count, badge: <SignalBadge signal={t.signal} /> }))}
      initial={initial}
      help="신호 그룹을 고른 뒤 기술을 고르세요. 다른 그룹으로 옮겨도 고른 것은 남아요."
      groupAria="신호 그룹"
      onApply={onApply}
      onClose={onClose}
    />
  );
}

/**
 * 설정 한 줄 "{label} [{label} ▾] N개 직접 고름 · 해제" + 아래로 펼쳐지는 고르기 (2026-11-14, 2026-11-15 공용으로)
 *   picked 가 비면 그래프는 fallback(기본 목록)을 보여 준다
 */
export function PickSetting({
  label,
  picked,
  emptyNote,
  onChange,
  picker,
}: {
  label: string;
  picked: string[];
  emptyNote: string;
  onChange: (ids: string[]) => void;
  picker: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Row label={label}>
        <div className={dashStyles.pickLine}>
          <button type="button" className={dashStyles.pick} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {label} {open ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
          </button>
          {picked.length ? (
            <>
              <span className={dashStyles.pickNote}>{picked.length}개 직접 고름</span>
              <button type="button" className={dashStyles.csvBtn} onClick={() => onChange([])}>
                해제
              </button>
            </>
          ) : (
            <span className={dashStyles.pickNote}>{emptyNote}</span>
          )}
        </div>
      </Row>
      {/* 아래로 펼쳐지는 고르기 — 설정 폭 전체 */}
      {open ? picker(() => setOpen(false)) : null}
    </>
  );
}

/** 기술 고르기 설정 줄 — 기술 빈도 시계열 · 기술 활동 테이블 · 사분면 · 기술 × 분야 · 생키가 같이 쓴다 */
export function TechPickSetting({
  techs,
  picked,
  fallback,
  emptyNote,
  onChange,
}: {
  techs: TechSignal[];
  picked: string[];
  fallback: string[];
  emptyNote: string;
  onChange: (ids: string[]) => void;
}) {
  return (
    <PickSetting
      label="기술 고르기"
      picked={picked}
      emptyNote={emptyNote}
      onChange={onChange}
      picker={(close) => <TechPicker techs={techs} initial={picked.length ? picked : fallback} onApply={onChange} onClose={close} />}
    />
  );
}
