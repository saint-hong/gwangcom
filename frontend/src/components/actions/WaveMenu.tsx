import clsx from "clsx";
import { Quote, Undo2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { IconButton } from "../../design-system";
import { useDismiss } from "../../hooks/useDismiss";
import menu from "../card/ItemMenu.module.css";
import styles from "./ActionBar.module.css";
import { WaveIcon } from "./WaveIcon";

type Props = {
  waved: boolean;
  count: number;
  burst: boolean;
  onBurstEnd: () => void;
  /** Wave · 인용 둘 다 쓸 수 없으면 흐리게 (누르면 안내) */
  blocked: boolean;
  onWave: () => void;
  onQuote: () => void;
  onBlocked: () => void;
};

/** Wave 버튼 → 메뉴 [Wave / Wave 취소] [인용하기] (기획안 v9 F6) */
export function WaveMenu({ waved, count, burst, onBurstEnd, blocked, onWave, onQuote, onBlocked }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, ref, close);

  return (
    <div className={menu.wrap} ref={ref}>
      <IconButton
        icon={WaveIcon}
        label="Wave"
        count={count}
        size="sm"
        active={waved}
        color="var(--color-wave)"
        className={styles.wave}
        iconClassName={clsx(burst && styles.waveOn)}
        onAnimationEnd={onBurstEnd}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-disabled={blocked && !waved ? true : undefined}
        onClick={() => (blocked && !waved ? onBlocked() : setOpen((v) => !v))}
      />
      {open ? (
        <div className={clsx(menu.menu, styles.waveMenu)} role="menu">
          <button
            type="button"
            role="menuitem"
            className={menu.item}
            onClick={() => {
              close();
              onWave();
            }}
          >
            {waved ? <Undo2 aria-hidden="true" /> : <WaveIcon aria-hidden="true" />}
            {waved ? "Wave 취소" : "Wave"}
          </button>
          <button
            type="button"
            role="menuitem"
            className={menu.item}
            onClick={() => {
              close();
              onQuote();
            }}
          >
            <Quote aria-hidden="true" /> 인용하기
          </button>
        </div>
      ) : null}
    </div>
  );
}
