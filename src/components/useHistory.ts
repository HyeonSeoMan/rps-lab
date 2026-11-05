"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import type { BattleRecord } from "@/lib/battle";
import type { QueuedBattleStore } from "@/lib/battle-store";
import type { Score } from "@/lib/game-state";
import { PAGE_SIZE } from "@/lib/stats";

export type HistoryState =
  | { phase: "loading" }
  | { phase: "error"; retrying: boolean }
  | { phase: "ready"; stats: Score; rows: BattleRecord[]; pageIndex: number; anchors: number[]; hasNext: boolean };

type Action =
  | { type: "LOADING" }
  | { type: "LOADED"; stats: Score; rows: BattleRecord[]; pageIndex: number; anchors: number[]; hasNext: boolean }
  | { type: "FAILED" }
  | { type: "RETRYING" };

export function historyReducer(state: HistoryState, action: Action): HistoryState {
  switch (action.type) {
    case "LOADING":
      return { phase: "loading" };
    case "LOADED":
      return { phase: "ready", stats: action.stats, rows: action.rows, pageIndex: action.pageIndex, anchors: action.anchors, hasNext: action.hasNext };
    case "FAILED":
      return { phase: "error", retrying: false };
    case "RETRYING":
      return { phase: "error", retrying: true };
  }
}

/**
 * 기록·통계 페이지 상태. 키셋 페이지네이션(마지막 행의 seq 앵커)과 요청 번호(오래된 응답 무시)를 쓴다.
 * 첫 읽기 전에 whenIdle()을 기다려 이미 수락된 쓰기가 반영된 뒤 읽는다.
 */
export function useHistory(store: QueuedBattleStore) {
  const [state, dispatch] = useReducer(historyReducer, { phase: "loading" } as HistoryState);
  const requestNo = useRef(0);
  const bump = useCallback(() => ++requestNo.current, []);
  const stateRef = useRef<HistoryState>(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const load = useCallback(
    async (anchors: number[], pageIndex: number, waitIdle: boolean) => {
      const no = bump();
      try {
        if (waitIdle) await store.whenIdle();
        const before = anchors.length ? anchors[anchors.length - 1] : undefined;
        const [statsResult, pageResult] = await Promise.allSettled([
          store.loadStats(),
          store.listBattles({ before, limit: PAGE_SIZE }),
        ]);
        if (no !== requestNo.current) return; // 더 최신 요청이 있음
        // 저장소 계약 3.2절: 게이트는 통계(loadStats) 읽기 실패에서만 닫는다. 목록 조회 실패는
        // 기록 오류 상태로만 보이고 저장(쓰기)을 막지 않는다(불필요한 차단 방지).
        if (statsResult.status === "rejected") store.closeGate("read");
        if (statsResult.status === "rejected" || pageResult.status === "rejected") {
          dispatch({ type: "FAILED" });
          return;
        }
        dispatch({ type: "LOADED", stats: statsResult.value, rows: pageResult.value.items, pageIndex, anchors, hasNext: pageResult.value.hasMore });
      } catch {
        if (no !== requestNo.current) return;
        dispatch({ type: "FAILED" }); // whenIdle 등 예기치 않은 실패(게이트는 건드리지 않는다)
      }
    },
    [store, bump],
  );

  useEffect(() => {
    dispatch({ type: "LOADING" });
    void load([], 0, true);
    return () => {
      bump(); // 언마운트 후 응답 무시
    };
  }, [load, bump]);

  const next = useCallback(() => {
    const s = stateRef.current;
    if (s.phase !== "ready" || !s.hasNext || s.rows.length === 0) return;
    void load([...s.anchors, s.rows[s.rows.length - 1].seq], s.pageIndex + 1, false);
  }, [load]);

  const prev = useCallback(() => {
    const s = stateRef.current;
    if (s.phase !== "ready" || s.pageIndex === 0) return;
    void load(s.anchors.slice(0, -1), s.pageIndex - 1, false);
  }, [load]);

  /** 조회 오류의 "저장 다시 시도": 연결을 새로 열어 확인하고 성공하면 첫 페이지부터 다시 읽는다. */
  const retry = useCallback(async () => {
    if (stateRef.current.phase !== "error" || stateRef.current.retrying) return;
    dispatch({ type: "RETRYING" });
    try {
      await store.recover();
    } catch {
      dispatch({ type: "FAILED" });
      return;
    }
    dispatch({ type: "LOADING" });
    await load([], 0, false);
  }, [store, load]);

  return { state, next, prev, retry };
}
