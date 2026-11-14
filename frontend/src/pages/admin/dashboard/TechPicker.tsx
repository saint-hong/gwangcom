import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Button } from "../../../design-system";
import type { TechSignal } from "../../../types/api";
import dashStyles from "./Dashboard.module.css";
import styles from "./TechPicker.module.css";
import { Row } from "./settings";
import { SIGNAL, SIGNAL_COLOR, SignalBadge } from "./parts";

type Group = "all" | TechSignal["signal"];
const GROUPS: Group[] = ["all", "new", "rising", "steady", "cooling"];
const GROUP_LABEL = (g: Group) => (g === "all" ? "전체" : SIGNAL[g].label);

/**
 * 기술 고르기 (2026-11-14 사용자 요청) — 설정 영역 안에서 아래로 펼쳐짐 (처음엔 팝업 창이었음)
 *   왼쪽 신호 그룹 → 오른쪽 그 그룹의 기술 목록(설정 폭만큼 여러 칸, 맨 끝 "모두"), 길면 상하 스크롤
 *   고른 것은 그룹을 옮겨도 남아서, 여러 그룹의 기술을 섞어 고를 수 있다. [적용]을 눌러야 그래프에 반영된다.
 */
export function TechPicker({ techs, initial, onApply, onClose }: { techs: TechSignal[]; initial: string[]; onApply: (ids: string[]) => void; onClose: () => void }) {
  const [group, setGroup] = useState<Group>("all");
  const [sel, setSel] = useState<Set<string>>(new Set(initial));

  const inGroup = (g: Group) => techs.filter((t) => g === "all" || t.signal === g);
  const list = inGroup(group);
  const ids = list.map((t) => String(t.tag_id));
  const allOn = ids.length > 0 && ids.every((id) => sel.has(id));
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
      <p className={styles.help}>신호 그룹을 고른 뒤 기술을 고르세요. 다른 그룹으로 옮겨도 고른 것은 남아요.</p>
      <div className={styles.body}>
        <ul className={styles.groups} role="listbox" aria-label="신호 그룹">
          {GROUPS.map((g) => {
            const gi = inGroup(g).map((t) => String(t.tag_id));
            const picked = gi.filter((id) => sel.has(id)).length;
            return (
              <li key={g}>
                <button type="button" className={styles.group} aria-selected={group === g} onClick={() => setGroup(g)}>
                  <span className={styles.groupName}>
                    {g === "all" ? null : <span className={styles.groupSwatch} style={{ background: SIGNAL_COLOR[g] }} aria-hidden="true" />}
                    {GROUP_LABEL(g)}
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
        <ul className={styles.techs} aria-label={`${GROUP_LABEL(group)} 기술`}>
          {list.length === 0 ? <li className={styles.empty}>이 그룹에 기술이 없어요.</li> : null}
          {list.map((t) => {
            const id = String(t.tag_id);
            return (
              <li key={id}>
                <label className={styles.tech}>
                  <input type="checkbox" checked={sel.has(id)} onChange={() => toggle(id)} />
                  <span className={styles.techName}>#{t.label}</span>
                  {group === "all" ? <SignalBadge signal={t.signal} /> : null}
                  <span className={styles.techCount}>상상 {t.count}</span>
                </label>
              </li>
            );
          })}
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

/**
 * 설정 한 줄 "기술 고르기 [기술 고르기 ▾] N개 직접 고름 · 해제" + 아래로 펼쳐지는 TechPicker (2026-11-14)
 *   기술 빈도 시계열 · 기술 활동 테이블이 같은 방식으로 쓴다. picked 가 비면 그래프는 fallback(기본 목록)을 보여 준다
 */
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
  const [open, setOpen] = useState(false);
  return (
    <>
      <Row label="기술 고르기">
        <div className={dashStyles.pickLine}>
          <button type="button" className={dashStyles.pick} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            기술 고르기 {open ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
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
      {/* 아래로 펼쳐지는 기술 고르기 — 설정 폭 전체 */}
      {open ? <TechPicker techs={techs} initial={picked.length ? picked : fallback} onApply={onChange} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
