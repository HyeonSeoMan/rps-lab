"use client";

import { useSyncExternalStore } from "react";
import GameBoard from "./GameBoard";
import type { QueuedBattleStore } from "@/lib/battle-store";
import styles from "./game/game.module.css";

const subscribeNoop = () => () => {};

type Props = {
  random?: () => number;
  store?: QueuedBattleStore;
  now?: () => number;
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
};

/**
 * 클라이언트 준비 게이트.
 * 서버 렌더와 하이드레이션 첫 렌더(ready=false)에는 선택 버튼·전적 없이 제목과 빈 영역만 렌더한다.
 */
export default function Game(props: Props) {
  const ready = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

  return (
    <main className={styles.game}>
      <h1 className={styles.title}>가위바위보</h1>
      <div className={styles.frame}>
        {ready ? <GameBoard {...props} /> : <div aria-busy="true" className={styles.skeleton} />}
      </div>
    </main>
  );
}
