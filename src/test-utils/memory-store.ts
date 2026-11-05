// 테스트 전용. 앱 번들에 포함되지 않는다(앱 코드에서 import 금지).
import { judge } from "@/lib/rps";
import type { Score } from "@/lib/game-state";
import type { BattleDraft, BattleRecord } from "@/lib/battle";
import { StoreError, type ReopenableStore } from "@/lib/battle-store";

export type MemoryStore = ReopenableStore & {
  /** 저장된 기록(복사본) */
  records(): BattleRecord[];
  /** 다음 N번의 해당 호출을 실패시킨다(Infinity = 계속). 쓰기는 아무것도 저장하지 않고 실패한다. */
  fail: { write: number; read: number; clear: number; probe: number };
  /** 쓰기를 보류한다. 반환한 함수를 호출하면 재개된다. */
  pauseWrites(): () => void;
  /** 호출 로그(순서 검증용) */
  log: string[];
  reopenCount: number;
};

export function createMemoryStore(seed: BattleDraft[] = []): MemoryStore {
  let rows: BattleRecord[] = seed.map((d, i) => ({ ...d, seq: i + 1 }));
  let pause: Promise<void> | null = null;
  const fail = { write: 0, read: 0, clear: 0, probe: 0 };
  const log: string[] = [];

  const take = (key: keyof typeof fail) => {
    if (fail[key] > 0) {
      fail[key]--;
      return true;
    }
    return false;
  };
  const stats = (): Score => {
    const s = { wins: 0, losses: 0, draws: 0 };
    for (const r of rows) s[({ win: "wins", lose: "losses", draw: "draws" } as const)[judge(r.user, r.computer)]]++;
    return s;
  };

  const store: MemoryStore = {
    records: () => rows.map((r) => ({ ...r })),
    fail,
    log,
    reopenCount: 0,
    pauseWrites() {
      let release!: () => void;
      pause = new Promise<void>((r) => (release = r));
      return () => {
        pause = null;
        release();
      };
    },
    async loadStats() {
      log.push("loadStats");
      if (take("read")) throw new StoreError("read");
      return stats();
    },
    async recordBattles(items) {
      log.push(`recordBattles:${items.length}`);
      if (pause) await pause;
      if (take("write")) throw new StoreError("write");
      const start = rows.length;
      rows = [...rows, ...items.map((d, i) => ({ ...d, seq: start + i + 1 }))];
      return stats();
    },
    async listBattles({ before, limit }) {
      log.push("listBattles");
      if (take("read")) throw new StoreError("read");
      const all = rows.filter((r) => before === undefined || r.seq < before).reverse();
      return { items: all.slice(0, limit), hasMore: all.length > limit };
    },
    async clearAll() {
      log.push("clearAll");
      if (pause) await pause;
      if (take("clear")) throw new StoreError("write");
      rows = [];
    },
    async probeWrite() {
      log.push("probeWrite");
      if (take("probe")) throw new StoreError("write");
    },
    reopen() {
      store.reopenCount++;
    },
  };
  return store;
}
