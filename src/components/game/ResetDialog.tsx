"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./game.module.css";

type Props = { onCancel: () => void; onConfirm: () => void };

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 전적 초기화 확인창(커스텀 alertdialog). 네이티브 <dialog>는 jsdom 미지원이라 쓰지 않는다.
 * 요건: ① 열릴 때 포커스를 취소 버튼으로 ② 열려 있는 동안 배경(inert + Tab 순환) ③ Esc로 닫기
 * ④ 닫힌 뒤 포커스 복원은 호출한 ResetControl이 맡는다.
 */
export default function ResetDialog({ onCancel, onConfirm }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // 포털 호스트: 클라이언트에서만 만든다(이 컴포넌트는 클릭 뒤에만 렌더되어 서버 렌더에 나오지 않는다).
  const [host] = useState<HTMLDivElement | null>(() => (typeof document === "undefined" ? null : document.createElement("div")));

  useEffect(() => {
    if (!host) return;
    document.body.append(host);
    // 배경 inert: 포털 호스트를 제외한 body의 모든 자식. 이미 inert인 것은 건드리지 않는다.
    const inerted: Element[] = [];
    for (const el of Array.from(document.body.children)) {
      if (el === host || el.tagName === "SCRIPT" || el.hasAttribute("inert")) continue;
      el.setAttribute("inert", "");
      inerted.push(el);
    }
    cancelRef.current?.focus();
    return () => {
      for (const el of inerted) el.removeAttribute("inert");
      host.remove();
    };
  }, [host]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
      return;
    }
    if (e.key !== "Tab") return;
    // inert 미지원 환경 보강: 대화상자 안에서 Tab/Shift+Tab 순환
    const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !dialogRef.current?.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  }

  if (!host) return null;
  return createPortal(
    <div className={styles.overlay} onKeyDown={onKeyDown}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="reset-title"
        aria-describedby="reset-desc"
      >
        <h2 id="reset-title">전적을 초기화할까요?</h2>
        <p id="reset-desc">전체 전적과 모든 대결 기록이 삭제되며 되돌릴 수 없어요. 마지막 대결 결과도 함께 지워져요.</p>
        <div className={styles.dlgBtns}>
          <button ref={cancelRef} type="button" onClick={onCancel}>
            취소
          </button>
          <button type="button" className={styles.danger} onClick={onConfirm}>
            전체 삭제
          </button>
        </div>
      </div>
    </div>,
    host,
  );
}
