import { describe, expect, it } from "vitest";
import { runAutoBattles, type RunProgress } from "./auto-runner";
import { createQueuedStore } from "./save-queue";
import { createMemoryStore } from "@/test-utils/memory-store";
import type { AutoSettings } from "./auto-run";

// 시드 난수(LCG)로 재현 가능하게 한다.
function seeded(seed: number) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
}
const settings = (over: Partial<AutoSettings> = {}): AutoSettings => ({ pick: "random", hand: "rock", run: "instant", count: 10, ...over });
const noWait = () => Promise.resolve();

function setup(over: Partial<AutoSettings> = {}, extra: { wait?: (ms: number, s: AbortSignal) => Promise<void> } = {}) {
  const mem = createMemoryStore();
  const store = createQueuedStore(mem);
  const ac = new AbortController();
  const progress: RunProgress[] = [];
  const s = settings(over);
  const run = () =>
    runAutoBattles(s, {
      store,
      random: seeded(42),
      now: () => 1,
      wait: extra.wait ?? noWait,
      signal: ac.signal,
      onProgress: (p) => progress.push(p),
    });
  return { mem, store, ac, progress, run };
}

describe("runAutoBattles", () => {
  it.each([10, 100, 1000] as const)("즉시 %i회: 정확히 그 횟수가 저장되고 합계가 일치한다", async (count) => {
    const { mem, run, progress } = setup({ count });
    const r = await run();
    expect(r).toMatchObject({ kind: "completed", total: count, done: count });
    expect(mem.records()).toHaveLength(count);
    expect(r.tally.wins + r.tally.losses + r.tally.draws).toBe(count);
    expect(r.stats).toEqual(r.tally); // 빈 저장소에서 시작했으므로 저장소 통계 == 이번 실행 합
    // 즉시 실행은 100건 묶음
    expect(progress.map((p) => p.done)).toEqual(Array.from({ length: Math.ceil(count / 100) }, (_, i) => Math.min((i + 1) * 100, count)));
    // seq 연속
    expect(mem.records().map((x) => x.seq)).toEqual(Array.from({ length: count }, (_, i) => i + 1));
  });

  it("애니메이션 1000회는 10건씩 100번 저장하고 사이에 70ms 대기한다", async () => {
    const waits: number[] = [];
    const { mem, run, progress } = setup({ count: 1000, run: "animated" }, { wait: async (ms) => void waits.push(ms) });
    const r = await run();
    expect(r.kind).toBe("completed");
    expect(progress).toHaveLength(100);
    expect(waits).toHaveLength(99);
    expect(new Set(waits)).toEqual(new Set([70]));
    expect(mem.records()).toHaveLength(1000);
  });

  it("애니메이션 10회는 1건씩", async () => {
    const { progress, run } = setup({ count: 10, run: "animated" });
    await run();
    expect(progress.map((p) => p.done)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("고정 손은 모든 대결에서 같은 손이다", async () => {
    const { mem, run } = setup({ pick: "fixed", hand: "paper" });
    await run();
    expect(new Set(mem.records().map((r) => r.user))).toEqual(new Set(["paper"]));
  });

  it("중지는 묶음 사이에서만 반영되고, 확정된 대결만 남는다(AC2-016)", async () => {
    const { mem, ac, run } = setup({ count: 100, run: "animated" });
    const r = await runWithStop(run, ac, mem, 7);
    expect(r.kind).toBe("stopped");
    expect(r.done).toBe(7);
    expect(mem.records()).toHaveLength(7);
    expect(r.tally.wins + r.tally.losses + r.tally.draws).toBe(7);
    // 중지 이후 더 늘지 않는다
    await new Promise((res) => setTimeout(res, 10));
    expect(mem.records()).toHaveLength(7);
  });

  it("진행 중이던 묶음은 끝까지 저장된 뒤에 중지된다", async () => {
    const { mem, ac, run } = setup({ count: 1000, run: "animated" });
    const resume = mem.pauseWrites();
    const p = run();
    await Promise.resolve();
    ac.abort(); // 첫 묶음(10건)이 저장 중일 때 중지
    resume();
    const r = await p;
    expect(r).toMatchObject({ kind: "stopped", done: 10 });
    expect(mem.records()).toHaveLength(10);
  });

  it("시작 전에 이미 abort되면 아무것도 저장하지 않는다(이탈, G-9)", async () => {
    const { mem, ac, run } = setup({ count: 100 });
    ac.abort();
    expect(await run()).toMatchObject({ kind: "stopped", done: 0, stats: null });
    expect(mem.records()).toEqual([]);
  });

  it("즉시 실행도 묶음 사이에서 abort되면 커밋된 묶음까지만 남는다(G-9)", async () => {
    const { mem, ac, run } = setup({ count: 1000 });
    const p = run();
    ac.abort(); // 첫 묶음 저장이 끝나기 전에 이탈
    const r = await p;
    expect(r.kind).toBe("stopped");
    expect(r.done).toBe(mem.records().length);
    expect(r.done).toBeLessThan(1000);
    expect(r.done % 100).toBe(0);
  });

  it("마지막 묶음 확정과 중지가 겹치면 completed로 처리한다", async () => {
    const { ac, run, mem } = setup({ count: 10 });
    const resume = mem.pauseWrites();
    const p = run();
    await Promise.resolve();
    ac.abort();
    resume();
    expect(await p).toMatchObject({ kind: "completed", done: 10 });
  });

  it("저장 실패는 aborted이고 확정된 묶음까지만 반영된다(AC2-057)", async () => {
    const { mem, run } = setup({ count: 1000 });
    let n = 0;
    const original = mem.recordBattles;
    mem.recordBattles = async (items) => {
      if (++n === 3) mem.fail.write = 1;
      return original(items);
    };
    const r = await run();
    expect(r).toMatchObject({ kind: "aborted", total: 1000, done: 200 });
    expect(mem.records()).toHaveLength(200);
    expect(r.stats).toEqual(r.tally);
    expect(r.error).toMatchObject({ kind: "write" });
  });

  it("중지 요청 중에 저장 실패가 나면 stopped가 아니라 aborted가 우선한다(G-8)", async () => {
    const { mem, ac, run } = setup({ count: 1000, run: "animated" });
    mem.fail.write = 1;
    const resume = mem.pauseWrites();
    const p = run();
    await Promise.resolve();
    ac.abort();
    resume();
    expect(await p).toMatchObject({ kind: "aborted", done: 0 });
  });

  it("실패 게이트가 닫힌 큐에서는 시도 없이 aborted(skipped)", async () => {
    const { store, mem, run } = setup({ count: 100 });
    store.closeGate("write");
    const r = await run();
    expect(r).toMatchObject({ kind: "aborted", done: 0 });
    expect(r.error).toMatchObject({ kind: "skipped" });
    expect(mem.log).toEqual([]);
  });

  it("자동 실행은 큐를 거치므로 선행 수동 저장 뒤에 순서대로 seq를 받는다", async () => {
    const { store, mem, run } = setup({ count: 10 });
    const manual = store.recordBattles([{ user: "rock", computer: "paper", at: 0 }]);
    await run();
    await manual;
    expect(mem.records()[0]).toMatchObject({ seq: 1, user: "rock", computer: "paper" });
    expect(mem.records()).toHaveLength(11);
  });
});

async function runWithStop(run: () => ReturnType<typeof runAutoBattles>, ac: AbortController, mem: ReturnType<typeof createMemoryStore>, after: number) {
  const original = mem.recordBattles;
  let n = 0;
  mem.recordBattles = async (items) => {
    const r = await original(items);
    if (++n === after) ac.abort();
    return r;
  };
  return run();
}
