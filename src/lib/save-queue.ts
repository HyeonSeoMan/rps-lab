import type { Score } from "./game-state";
import type { BattleDraft } from "./battle";
import { StoreError, toStoreError, type GateState, type QueuedBattleStore, type ReopenableStore } from "./battle-store";

/**
 * 앱 수준 FIFO 저장 큐 + 실패 게이트 + 복구를 BattleStore 위에 얹는 데코레이터.
 * - 쓰기(recordBattles/clearAll/probe 제외)는 모두 입력 순서대로 실행된다.
 * - recordBattles가 실패하면 게이트가 닫히고, 아직 시작하지 않은 recordBattles는
 *   저장을 시도하지 않고 StoreError("skipped")로 거절된다. 게이트는 recover() 성공으로만 열린다.
 * - clearAll은 FIFO 순서를 따르지만 게이트에 막히지 않는다(손상·저장 불가 상태에서도 사용자가
 *   전적 초기화로 탈출할 수 있어야 한다, FR2-019). 실패해도 게이트를 닫지 않는다.
 */
export function createQueuedStore(inner: ReopenableStore): QueuedBattleStore {
  let tail: Promise<unknown> = Promise.resolve();
  let pending = 0;
  let gate: GateState = { closed: false };
  let recovering: Promise<Score> | null = null;

  function enqueue<T>(op: () => Promise<T>): Promise<T> {
    pending++;
    const run = tail.then(op);
    tail = run
      .then(
        () => undefined,
        () => undefined,
      )
      .then(() => {
        pending--;
      });
    return run;
  }

  async function whenIdle(): Promise<void> {
    while (pending > 0) await tail;
    // 호출 측이 결과를 받아 처리할 수 있도록 마이크로태스크 몇 턴을 양보한다.
    for (let i = 0; i < 3; i++) await Promise.resolve();
    if (pending > 0) return whenIdle();
  }

  return {
    loadStats: () => inner.loadStats(),
    listBattles: (q) => inner.listBattles(q),
    probeWrite: () => inner.probeWrite(),

    recordBattles(items: BattleDraft[]) {
      return enqueue(async () => {
        if (gate.closed) throw new StoreError("skipped", "failure gate is closed");
        try {
          return await inner.recordBattles(items);
        } catch (e) {
          const err = toStoreError(e, "write");
          // 쓰기를 시도하다 생긴 모든 저장소 오류(write/unavailable/corrupt…)는 저장 실패로 취급한다.
          gate = { closed: true, cause: "write" };
          throw err;
        }
      });
    },

    clearAll() {
      return enqueue(async () => {
        try {
          await inner.clearAll();
        } catch (e) {
          throw toStoreError(e, "write");
        }
      });
    },

    whenIdle,
    gate: () => gate,
    closeGate(cause) {
      // 이미 write 원인으로 닫혀 있으면 그대로 둔다.
      if (!gate.closed) gate = { closed: true, cause };
    },

    recover() {
      if (recovering) return recovering;
      const p = (async () => {
        await whenIdle();
        try {
          inner.reopen?.();
          const stats = await inner.loadStats(); // 검증·자가 복구 포함
          await inner.probeWrite();
          gate = { closed: false };
          return stats;
        } catch (e) {
          throw toStoreError(e, "unavailable");
        }
      })();
      recovering = p;
      const clear = () => {
        if (recovering === p) recovering = null;
      };
      p.then(clear, clear);
      return p;
    },
  };
}
