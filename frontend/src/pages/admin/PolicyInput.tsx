import clsx from "clsx";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { PolicyKey, PolicyValue } from "../../types/api";
import styles from "./Admin.module.css";

/**
 * 한도 · 권한 값 하나를 고치는 칸 (A5 · A6 공통, Sprint 6-B)
 *   숫자: 입력칸 + 단위. Enter 나 칸을 벗어나면 저장 (값이 바뀌었을 때만). Esc = 되돌리기
 *   켜기 · 끄기: 알약 토글 [켜짐 | 꺼짐] (A4 상태 토글과 같은 모양)
 *   allowEmpty(등급 · 개인 예외): 비우면 null = 위 단계 값을 따름.
 *   토글은 언제나 [켜짐 | 꺼짐] 두 개 (2026-11-13 사용자: "따름(켜짐)"은 알아보기 힘듦) — 따르는 중이면 따르는 값이 눌려 보이고,
 *   누르면 그 값으로 직접 정해진다. 따르기로 되돌리기는 칸 옆 [기본값 적용] · [해제] 버튼이 맡는다
 *   placeholder: 비었을 때 보여 줄 "따르는 값"
 *   (2026-11-13) 빈 칸을 누르면 따르는 값을 실제 글자로 채운다 → 바로 지우기 · 숫자 입력 · 마우스 블록 지정이 된다.
 *   그대로 두고 벗어나면 다시 비워 "따름"을 유지한다 (값을 바꿨을 때만 저장).
 */
export function PolicyInput({
  spec,
  value,
  onSave,
  allowEmpty = false,
  placeholder,
  disabled = false,
}: {
  spec: PolicyKey;
  value: PolicyValue | null;
  onSave: (v: PolicyValue | null) => void;
  allowEmpty?: boolean;
  placeholder?: PolicyValue;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  const prefilled = useRef<string | null>(null); // 포커스 때 채운 "따르는 값"
  const cancelled = useRef(false); // Esc 로 벗어날 때는 저장하지 않는다
  useEffect(() => setText(value === null ? "" : String(value)), [value]);

  if (spec.kind === "bool") {
    const shown = value ?? placeholder; // 따르는 중이면 따르는 값
    const opts: { v: boolean; label: string }[] = [
      { v: true, label: "켜짐" },
      { v: false, label: "꺼짐" },
    ];
    return (
      <div className={styles.stateToggle} role="group" aria-label={spec.label}>
        {opts.map((o) => (
          <button
            key={String(o.v)}
            type="button"
            aria-pressed={shown === o.v}
            className={clsx(o.v === false && styles.hideBtn)}
            disabled={disabled || value === o.v}
            onClick={() => onSave(o.v)}
          >
            {o.label}
          </button>
        ))}
      </div>
    );
  }

  const commit = () => {
    const t = text.trim();
    const filled = prefilled.current;
    prefilled.current = null;
    if (cancelled.current) {
      cancelled.current = false;
      setText(value === null ? "" : String(value));
      return;
    }
    if (filled !== null && value === null && t === filled) {
      setText(""); // 손대지 않았으면 계속 따른다
      return;
    }
    if (t === "") {
      if (allowEmpty && value !== null) onSave(null);
      else setText(value === null ? "" : String(value)); // 전체 기본값은 비울 수 없다
      return;
    }
    const n = Number(t);
    if (!Number.isInteger(n)) {
      setText(value === null ? "" : String(value));
      return;
    }
    if (n !== value) onSave(n);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
    if (e.key === "Escape") {
      cancelled.current = true;
      e.currentTarget.blur();
    }
  };
  return (
    <span className={styles.numField}>
      <input
        className={clsx(styles.numInput, value === null && styles.numInherit)}
        type="text"
        inputMode="numeric"
        value={text}
        placeholder={placeholder === undefined ? "" : String(placeholder)}
        onFocus={() => {
          if (text === "" && placeholder !== undefined && typeof placeholder === "number") {
            prefilled.current = String(placeholder);
            setText(String(placeholder));
          }
        }}
        onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ""))}
        onBlur={commit}
        onKeyDown={onKey}
        disabled={disabled}
        aria-label={spec.label}
      />
      <span className={styles.unit}>{spec.unit}</span>
    </span>
  );
}
