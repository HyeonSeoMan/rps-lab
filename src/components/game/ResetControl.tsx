"use client";

import { useEffect, useRef } from "react";
import ResetDialog from "./ResetDialog";
import styles from "./game.module.css";

type Props = {
  reset: "idle" | "confirming" | "resetting";
  running: boolean;
  retrying: boolean;
  failed: boolean;
  onRequest: () => void;
  onCancel: () => void;
  onConfirm: () => void;
};

/** 전적 초기화 버튼, 확인창, 진행·실패 안내. 포커스 복원(UC 4절 4번)도 여기서 맡는다. */
export default function ResetControl({ reset, running, retrying, failed, onRequest, onCancel, onConfirm }: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef<HTMLParagraphElement>(null);
  const prev = useRef(reset);

  useEffect(() => {
    const before = prev.current;
    prev.current = reset;
    if (before === reset) return;
    if (before === "confirming" && reset === "idle") buttonRef.current?.focus(); // 취소·Esc
    else if (before === "confirming" && reset === "resetting") busyRef.current?.focus(); // 버튼이 비활성이므로 진행 안내로
    else if (before === "resetting" && reset === "idle") buttonRef.current?.focus(); // 끝나면 복원
  }, [reset]);

  const disabled = running || reset !== "idle" || retrying;
  return (
    <div className={styles.resetWrap}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.reset}
        disabled={disabled}
        aria-busy={reset === "resetting" || undefined}
        onClick={onRequest}
      >
        전적 초기화
      </button>
      {running && <p className={styles.note}>자동 대결 중에는 초기화할 수 없어요. 먼저 중지하세요.</p>}
      {reset === "resetting" && (
        <p ref={busyRef} tabIndex={-1} className={styles.note}>
          <span className={styles.spin} aria-hidden="true" /> 초기화하는 중이에요. 잠시 기다려 주세요.
        </p>
      )}
      {failed && reset === "idle" && (
        <div className={`${styles.notice} ${styles.err}`} role="alert">
          <strong>초기화하지 못했어요</strong>
          <p>전적과 기록은 아무것도 지워지지 않았어요. 잠시 후 다시 시도해 주세요.</p>
        </div>
      )}
      {reset === "confirming" && <ResetDialog onCancel={onCancel} onConfirm={onConfirm} />}
    </div>
  );
}
