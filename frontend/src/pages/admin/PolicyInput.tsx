import clsx from "clsx";
import { useEffect, useState, type KeyboardEvent } from "react";
import type { PolicyKey, PolicyValue } from "../../types/api";
import styles from "./Admin.module.css";

/**
 * 한도 · 권한 값 하나를 고치는 칸 (A5 · A6 공통, Sprint 6-B)
 *   숫자: 입력칸 + 단위. Enter 나 칸을 벗어나면 저장 (값이 바뀌었을 때만). Esc = 되돌리기
 *   켜기 · 끄기: 알약 토글 [켜짐 | 꺼짐] (A4 상태 토글과 같은 모양)
 *   allowEmpty(등급 · 개인 예외): 비우면 null = 위 단계 값을 따름. 토글에는 [따름]이 붙는다
 *   placeholder: 비었을 때 보여 줄 "따르는 값"
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
  useEffect(() => setText(value === null ? "" : String(value)), [value]);

  if (spec.kind === "bool") {
    const opts: { v: boolean | null; label: string }[] = [
      ...(allowEmpty ? [{ v: null, label: placeholder === undefined ? "따름" : `따름(${placeholder ? "켜짐" : "꺼짐"})` }] : []),
      { v: true, label: "켜짐" },
      { v: false, label: "꺼짐" },
    ];
    return (
      <div className={styles.stateToggle} role="group" aria-label={spec.label}>
        {opts.map((o) => (
          <button
            key={String(o.v)}
            type="button"
            aria-pressed={value === o.v}
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
      setText(value === null ? "" : String(value));
      e.currentTarget.blur();
    }
  };
  return (
    <span className={styles.numField}>
      <input
        className={clsx(styles.numInput, value === null && styles.numInherit)}
        type="number"
        inputMode="numeric"
        min={spec.min}
        max={spec.max}
        value={text}
        placeholder={placeholder === undefined ? "" : String(placeholder)}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={onKey}
        disabled={disabled}
        aria-label={spec.label}
      />
      <span className={styles.unit}>{spec.unit}</span>
    </span>
  );
}
