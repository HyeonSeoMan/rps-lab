"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { createInitialSession, sessionReducer, type SessionAction, type SessionState } from "@/lib/game-session";
import { pickComputerChoice, judge, type Choice } from "@/lib/rps";
import type { Round } from "@/lib/game-state";
import type { AutoSettings } from "@/lib/auto-run";
import { runAutoBattles, defaultWait } from "@/lib/auto-runner";
import type { QueuedBattleStore } from "@/lib/battle-store";

export type SessionDeps = {
  store: QueuedBattleStore;
  random: () => number;
  now: () => number;
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
};

/**
 * 게임 페이지 세션. reducer 상태에 저장소·난수·타이머를 연결한다.
 * 상태의 최신값은 dispatch 시점에 같은 순수 reducer로 ref에도 동기 반영한다.
 * 저장 완료 직후 자동 실행 시작 같은 비동기 경계에서 렌더 반영을 기다리지 않고 최신 상태로 가드하기 위해서다.
 */
export function useGameSession({ store, random, now, wait = defaultWait }: SessionDeps) {
  const [state, rawDispatch] = useReducer(sessionReducer, undefined, createInitialSession);
  const latest = useRef<SessionState>(null as unknown as SessionState);
  latest.current ??= createInitialSession();
  const abortRef = useRef<AbortController | null>(null);
  const starting = useRef(false);
  const mounted = useRef(true);

  const dispatch = useCallback((action: SessionAction) => {
    latest.current = sessionReducer(latest.current, action);
    rawDispatch(action);
  }, []);

  // 마운트 때 저장소에서 전적을 읽는다. 이미 수락된 쓰기(예: 수동 대결 직후 이동)가 반영된 뒤 읽는다.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const gate = store.gate();
      if (gate.closed && gate.cause === "read") {
        dispatch({ type: "LOADED_UNAVAILABLE", cause: "read", stats: null });
        return;
      }
      try {
        await store.whenIdle();
        const stats = await store.loadStats();
        if (cancelled) return;
        const after = store.gate();
        dispatch(after.closed ? { type: "LOADED_UNAVAILABLE", cause: after.cause, stats } : { type: "LOADED", stats });
      } catch {
        if (cancelled) return;
        store.closeGate("read");
        dispatch({ type: "LOAD_FAILED" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store, dispatch]);

  // 앱 내 이동(언마운트)과 pagehide에서 같은 AbortController로 자동 실행을 중단한다(G-9).
  useEffect(() => {
    mounted.current = true;
    const abort = () => abortRef.current?.abort();
    window.addEventListener("pagehide", abort);
    return () => {
      mounted.current = false;
      window.removeEventListener("pagehide", abort);
      abort();
    };
  }, []);

  const play = useCallback(
    (user: Choice) => {
      const computer = pickComputerChoice(random);
      const round: Round = { user, computer, outcome: judge(user, computer) };
      const s = latest.current;
      if (s.run.phase !== "idle" || s.reset === "resetting") return;
      if (s.storage.phase === "unavailable") {
        // P-14: 저장 불가 상태에서는 연습 대결로 처리하고 자동으로 다시 시도하지 않는다.
        dispatch({ type: "PRACTICED", round });
        return;
      }
      if (s.storage.phase !== "ready") return;
      store
        .recordBattles([{ user, computer, at: now() }])
        .then((stats) => dispatch({ type: "COMMITTED", round, stats }))
        .catch(() => dispatch({ type: "SAVE_FAILED", round }));
    },
    [store, random, now, dispatch],
  );

  const setMode = useCallback((mode: "manual" | "auto") => dispatch({ type: "MODE_SET", mode }), [dispatch]);
  const setSettings = useCallback((patch: Partial<AutoSettings>) => dispatch({ type: "SETTINGS_SET", patch }), [dispatch]);

  const start = useCallback(async () => {
    if (starting.current) return; // 중복 시작 요청 무시(G-3)
    starting.current = true;
    try {
      // 큐에 남은 수동 저장의 결과가 모두 reducer에 도달한 뒤 수락한다.
      await store.whenIdle();
      if (!mounted.current) return;
      const settings = latest.current.settings;
      const before = latest.current;
      const next = sessionReducer(before, { type: "RUN_STARTED", settings });
      if (next === before) return;
      const ac = new AbortController();
      abortRef.current = ac;
      dispatch({ type: "RUN_STARTED", settings });
      const result = await runAutoBattles(settings, {
        store,
        random,
        now,
        wait,
        signal: ac.signal,
        onProgress: (p) => dispatch({ type: "RUN_PROGRESS", done: p.done, last: p.last, stats: p.stats }),
      });
      abortRef.current = null;
      dispatch({
        type: "RUN_FINISHED",
        result: { kind: result.kind, total: result.total, done: result.done, tally: result.tally, stats: result.stats },
      });
    } finally {
      starting.current = false;
    }
  }, [store, random, now, wait, dispatch]);

  const stop = useCallback(() => {
    dispatch({ type: "RUN_STOP_REQUESTED" });
    abortRef.current?.abort();
  }, [dispatch]);

  const requestReset = useCallback(() => dispatch({ type: "RESET_REQUESTED" }), [dispatch]);
  const cancelReset = useCallback(() => dispatch({ type: "RESET_CANCELLED" }), [dispatch]);

  /** 확인 후에만 호출된다. 큐의 FIFO 안에서 실행되어 앞선 저장이 끝난 뒤 초기화된다. 실패하면 성공으로 표시하지 않는다. */
  const confirmReset = useCallback(async () => {
    const before = latest.current;
    if (sessionReducer(before, { type: "RESET_CONFIRMED" }) === before) return;
    dispatch({ type: "RESET_CONFIRMED" });
    try {
      await store.clearAll();
      dispatch({ type: "RESET_SUCCEEDED" });
    } catch {
      dispatch({ type: "RESET_FAILED" });
    }
  }, [store, dispatch]);

  /** 저장 다시 시도: 큐가 비면 연결을 새로 열어 검증·쓰기 프로브를 하고, 성공해야만 게이트가 열린다. */
  const retry = useCallback(async () => {
    const before = latest.current;
    if (sessionReducer(before, { type: "RETRY_STARTED" }) === before) return;
    dispatch({ type: "RETRY_STARTED" });
    try {
      const stats = await store.recover();
      dispatch({ type: "RETRY_SUCCEEDED", stats });
    } catch {
      dispatch({ type: "RETRY_FAILED" });
    }
  }, [store, dispatch]);

  return { state, play, setMode, setSettings, start, stop, requestReset, cancelReset, confirmReset, retry };
}
