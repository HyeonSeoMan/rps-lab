import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createIdbBattleStore } from "./idb-battle-store";
import { createQueuedStore } from "./save-queue";
import { runAutoBattles } from "./auto-runner";
import { createInitialSession, sessionReducer, type SessionState } from "./game-session";
import { StoreError, type BattleStore, type ReopenableStore } from "./battle-store";
import { judge, pickComputerChoice, type Choice } from "./rps";
import type { AutoSettings } from "./auto-run";

// SC2-002: 수동·자동·중지·저장 실패·복구·초기화를 무작위 순서로 섞어도
// 승 + 패 + 무 = 전체 대결 횟수 = 저장된 기록 수, seq 유일·연속, 화면 전적 = 저장소 값.

afterEach(() => vi.restoreAllMocks());

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** 실제 저장소를 감싸 다음 호출을 실패시키는 장치(변경 전에 실패 → 부분 저장 없음). */
function faulty(inner: ReopenableStore) {
  const fail = { record: 0, clear: 0, probe: 0, load: 0 };
  const take = (k: keyof typeof fail) => (fail[k] > 0 ? (fail[k]--, true) : false);
  const store: ReopenableStore = {
    loadStats: async () => {
      if (take("load")) throw new StoreError("read");
      return inner.loadStats();
    },
    listBattles: (q) => inner.listBattles(q),
    recordBattles: async (items) => {
      if (take("record")) throw new StoreError("write");
      return inner.recordBattles(items);
    },
    clearAll: async () => {
      if (take("clear")) throw new StoreError("write");
      return inner.clearAll();
    },
    probeWrite: async () => {
      if (take("probe")) throw new StoreError("write");
      return inner.probeWrite();
    },
    reopen: () => inner.reopen?.(),
  };
  return { store, fail };
}

async function truth(factory: IDBFactory) {
  const fresh: BattleStore = createIdbBattleStore(() => factory); // 독립된 연결에서 읽는다
  const stats = await fresh.loadStats();
  const { items } = await fresh.listBattles({ limit: 100000 });
  return { stats, items };
}

async function runSequence(seed: number, steps: number) {
  const rnd = seeded(seed);
  const factory = new IDBFactory();
  const f = faulty(createIdbBattleStore(() => factory));
  const store = createQueuedStore(f.store);
  let s: SessionState = createInitialSession();
  const dispatch = (a: Parameters<typeof sessionReducer>[1]) => (s = sessionReducer(s, a));
  dispatch({ type: "LOADED", stats: await store.loadStats() });
  const pick = (): Choice => pickComputerChoice(rnd);

  for (let i = 0; i < steps; i++) {
    const op = Math.floor(rnd() * 8);
    if (op <= 2) {
      // 수동 대결(저장 불가면 연습)
      const user = pick();
      const computer = pick();
      const round = { user, computer, outcome: judge(user, computer) };
      if (s.storage.phase === "unavailable") dispatch({ type: "PRACTICED", round });
      else if (s.storage.phase === "ready") {
        try {
          dispatch({ type: "COMMITTED", round, stats: await store.recordBattles([{ user, computer, at: i }]) });
        } catch {
          dispatch({ type: "SAVE_FAILED", round });
        }
      }
    } else if (op === 3 || op === 4) {
      // 자동 대결(즉시/애니메이션), 무작위로 중지
      const settings: AutoSettings = {
        pick: rnd() < 0.5 ? "fixed" : "random",
        hand: pick(),
        run: rnd() < 0.5 ? "instant" : "animated",
        count: ([10, 100, 1000] as const)[Math.floor(rnd() * 3)],
      };
      await store.whenIdle();
      const next = sessionReducer(s, { type: "RUN_STARTED", settings });
      if (next === s) continue; // 저장 불가 등에서는 시작되지 않는다
      s = next;
      const ac = new AbortController();
      const stopAfter = rnd() < 0.4 ? Math.floor(rnd() * 5) + 1 : Infinity;
      let chunks = 0;
      const result = await runAutoBattles(settings, {
        store,
        random: rnd,
        now: () => i,
        wait: async () => {},
        signal: ac.signal,
        onProgress: (p) => {
          dispatch({ type: "RUN_PROGRESS", done: p.done, last: p.last, stats: p.stats });
          if (++chunks >= stopAfter) ac.abort();
        },
      });
      dispatch({ type: "RUN_FINISHED", result });
    } else if (op === 5) {
      // 초기화(확인 후), 가끔 실패
      dispatch({ type: "RESET_REQUESTED" });
      if (rnd() < 0.3) f.fail.clear = 1;
      const before = s;
      dispatch({ type: "RESET_CONFIRMED" });
      if (s !== before) {
        try {
          await store.clearAll();
          dispatch({ type: "RESET_SUCCEEDED" });
        } catch {
          dispatch({ type: "RESET_FAILED" });
        }
      }
    } else if (op === 6) {
      // 쓰기 실패 주입(다음 저장이 실패)
      f.fail.record = rnd() < 0.5 ? 1 : 0;
    } else if (s.storage.phase === "unavailable") {
      // 저장 다시 시도(가끔 실패)
      if (rnd() < 0.4) f.fail.probe = 1;
      const before = s;
      dispatch({ type: "RETRY_STARTED" });
      if (s !== before) {
        try {
          dispatch({ type: "RETRY_SUCCEEDED", stats: await store.recover() });
        } catch {
          dispatch({ type: "RETRY_FAILED" });
        }
      }
    }

    // ── 불변식 ──
    const t = await truth(factory);
    const sum = t.stats.wins + t.stats.losses + t.stats.draws;
    expect(sum, `seed ${seed} step ${i}: 합계 == 기록 수`).toBe(t.items.length);
    const seqs = t.items.map((r) => r.seq); // 최신순(내림차순)
    expect(seqs, `seed ${seed} step ${i}: seq 연속·유일`).toEqual(Array.from({ length: seqs.length }, (_, k) => seqs.length - k));
    const byJudge = { wins: 0, losses: 0, draws: 0 };
    for (const r of t.items) byJudge[({ win: "wins", lose: "losses", draw: "draws" } as const)[judge(r.user, r.computer)]]++;
    expect(t.stats, `seed ${seed} step ${i}: 카운터 == judge()로 센 값`).toEqual(byJudge);
    if (s.stats !== null) expect(s.stats, `seed ${seed} step ${i}: 화면 전적 == 저장소`).toEqual(t.stats);
    if (s.run.phase !== "idle") throw new Error("실행이 끝나지 않았다");
  }
}

describe("SC2-002: 불변식 속성 테스트", () => {
  it("무작위 연산열 60개(각 25단계)에서 화면 전적 = 카운터 = 기록 수가 항상 성립한다", async () => {
    for (let seed = 1; seed <= 60; seed++) await runSequence(seed, 25);
  }, 120_000);

  it("묶음 저장 도중 예외(부분 저장 시도)가 섞여도 전부/전무와 불변식이 유지된다", async () => {
    const factory = new IDBFactory();
    const store = createQueuedStore(createIdbBattleStore(() => factory));
    const real = IDBObjectStore.prototype.add;
    let calls = 0;
    let armed = false;
    vi.spyOn(IDBObjectStore.prototype, "add").mockImplementation(function (this: IDBObjectStore, ...a) {
      if (armed && ++calls === 37) throw new DOMException("boom", "QuotaExceededError");
      return real.apply(this, a as Parameters<typeof real>);
    });
    const settings: AutoSettings = { pick: "random", hand: "rock", run: "instant", count: 1000 };
    armed = true;
    const r = await runAutoBattles(settings, { store, random: seeded(9), now: () => 1, wait: async () => {}, signal: new AbortController().signal });
    armed = false;
    expect(r.kind).toBe("aborted");
    const t = await truth(factory);
    expect(t.items).toHaveLength(r.done); // 확정된 묶음까지만
    expect(r.done % 100).toBe(0);
    expect(t.stats.wins + t.stats.losses + t.stats.draws).toBe(t.items.length);
  });
});
