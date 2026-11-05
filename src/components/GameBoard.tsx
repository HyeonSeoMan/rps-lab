"use client";

import { useMemo } from "react";
import { getBrowserBattleStore } from "@/lib/browser-store";
import type { QueuedBattleStore } from "@/lib/battle-store";
import AutoPanel from "./game/AutoPanel";
import BattleArena from "./game/BattleArena";
import ManualPanel from "./game/ManualPanel";
import ModeToggle from "./game/ModeToggle";
import ScoreCards from "./game/ScoreCards";
import { useGameSession } from "./useGameSession";
import styles from "./game/game.module.css";

type Props = {
  random?: () => number;
  /** 저장소 주입(기본: 앱 수준 단일 QueuedBattleStore). 테스트는 큐로 감싼 메모리 저장소를 넘긴다. */
  store?: QueuedBattleStore;
  now?: () => number;
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
};

export default function GameBoard({ random = Math.random, store, now = Date.now, wait }: Props) {
  const resolvedStore = useMemo(() => store ?? getBrowserBattleStore(), [store]);
  const { state, play, setMode, setSettings, start, stop } = useGameSession({ store: resolvedStore, random, now, wait });

  // 최초 읽기가 끝나기 전에는 전적 값·선택 버튼 없이 빈 영역만 보인다(잘못된 0/0/0 방지).
  if (state.storage.phase === "loading") return <div aria-busy="true" className={styles.skeleton} />;

  const running = state.run.phase !== "idle";
  const showManual = state.mode === "manual" && !running;
  return (
    <div className={styles.card}>
      <ModeToggle mode={running ? "auto" : state.mode} disabled={running || state.reset === "resetting"} onChange={setMode} />
      <BattleArena mode={state.mode} last={state.last} announcement={state.announcement} />
      {showManual ? (
        <ManualPanel onPlay={play} />
      ) : (
        <AutoPanel
          settings={state.settings}
          run={state.run}
          storage={state.storage}
          hasStats={state.stats !== null}
          summary={state.summary}
          onSettings={setSettings}
          onStart={start}
          onStop={stop}
        />
      )}
      <ScoreCards stats={state.stats} />
    </div>
  );
}
