import { describe, expect, it } from "vitest";
import { createQueuedStore } from "./save-queue";
import { createMemoryStore } from "@/test-utils/memory-store";
import { describeStoreContract, draft } from "@/test-utils/store-contract";
import { getBrowserBattleStore, resetBrowserBattleStoreForTests } from "./browser-store";

describeStoreContract("큐 저장소(메모리 위)", () => createQueuedStore(createMemoryStore()));

describe("FIFO 저장 큐", () => {
  it("빠른 연속 쓰기는 입력 순서대로 seq를 받고 유실·중복이 없다(AC2-055)", async () => {
    const mem = createMemoryStore();
    const q = createQueuedStore(mem);
    const hands = ["rock", "paper", "scissors", "rock", "paper"] as const;
    await Promise.all(hands.map((h, i) => q.recordBattles([draft(h, "rock", i)])));
    expect(mem.records().map((r) => [r.seq, r.user])).toEqual(hands.map((h, i) => [i + 1, h]));
  });

  it("수동·자동 묶음·초기화가 큐 순서대로 처리된다", async () => {
    const mem = createMemoryStore();
    const q = createQueuedStore(mem);
    const resume = mem.pauseWrites();
    const p = [
      q.recordBattles([draft("rock", "rock")]),
      q.recordBattles([draft("rock", "rock"), draft("rock", "rock")]),
      q.clearAll(),
      q.recordBattles([draft("paper", "rock")]),
    ];
    resume();
    await Promise.all(p);
    expect(mem.log.filter((l) => l !== "loadStats")).toEqual(["recordBattles:1", "recordBattles:2", "clearAll", "recordBattles:1"]);
    expect(mem.records().map((r) => r.seq)).toEqual([1]);
  });

  it("읽기는 큐를 기다리지 않는다", async () => {
    const mem = createMemoryStore();
    const q = createQueuedStore(mem);
    const resume = mem.pauseWrites();
    const w = q.recordBattles([draft("rock", "rock")]);
    await expect(q.loadStats()).resolves.toEqual({ wins: 0, losses: 0, draws: 0 });
    resume();
    await w;
  });

  it("whenIdle은 수락된 쓰기가 모두 끝나고 호출 측이 결과를 받은 뒤 resolve된다", async () => {
    const mem = createMemoryStore();
    const q = createQueuedStore(mem);
    const resume = mem.pauseWrites();
    const received: string[] = [];
    const w = q.recordBattles([draft("rock", "rock")]).then(() => received.push("w"));
    let idle = false;
    const idleP = q.whenIdle().then(() => {
      idle = true;
      received.push("idle");
    });
    await Promise.resolve();
    expect(idle).toBe(false);
    resume();
    await Promise.all([w, idleP]);
    expect(received).toEqual(["w", "idle"]);
  });

  it("쓰기가 없으면 whenIdle은 바로 끝난다", async () => {
    await expect(createQueuedStore(createMemoryStore()).whenIdle()).resolves.toBeUndefined();
  });
});

describe("실패 게이트", () => {
  it("쓰기 실패 후 대기 중이던 쓰기는 저장을 시도하지 않고 skipped로 거절된다", async () => {
    const mem = createMemoryStore();
    const q = createQueuedStore(mem);
    mem.fail.write = 1;
    const results = await Promise.allSettled([
      q.recordBattles([draft("rock", "rock")]),
      q.recordBattles([draft("rock", "rock")]),
      q.recordBattles([draft("rock", "rock")]),
    ]);
    expect(results.map((r) => (r.status === "rejected" ? (r.reason as { kind: string }).kind : "ok"))).toEqual([
      "write",
      "skipped",
      "skipped",
    ]);
    expect(q.gate()).toEqual({ closed: true, cause: "write" });
    expect(mem.log.filter((l) => l.startsWith("recordBattles"))).toHaveLength(1); // 시도는 처음 1번뿐
    expect(mem.records()).toEqual([]);
  });

  it("게이트가 닫힌 뒤의 새 쓰기도 skipped이고 저장소를 건드리지 않는다", async () => {
    const mem = createMemoryStore();
    const q = createQueuedStore(mem);
    q.closeGate("write");
    await expect(q.recordBattles([draft("rock", "rock")])).rejects.toMatchObject({ kind: "skipped" });
    expect(mem.log).toEqual([]);
  });

  it("초기 읽기 실패로 닫은 게이트(원인 read)도 쓰기를 막는다", async () => {
    const q = createQueuedStore(createMemoryStore());
    q.closeGate("read");
    expect(q.gate()).toEqual({ closed: true, cause: "read" });
    await expect(q.recordBattles([draft("rock", "rock")])).rejects.toMatchObject({ kind: "skipped" });
  });

  it("recover() 성공에서만 게이트가 열리고 이후 쓰기가 저장된다", async () => {
    const mem = createMemoryStore();
    const q = createQueuedStore(mem);
    q.closeGate("write");
    mem.fail.probe = 1;
    await expect(q.recover()).rejects.toMatchObject({ kind: "write" });
    expect(q.gate().closed).toBe(true);
    await expect(q.recordBattles([draft("rock", "rock")])).rejects.toMatchObject({ kind: "skipped" });
    const stats = await q.recover();
    expect(stats).toEqual({ wins: 0, losses: 0, draws: 0 });
    expect(q.gate()).toEqual({ closed: false });
    expect(mem.reopenCount).toBe(2); // 시도마다 연결을 새로 연다
    await q.recordBattles([draft("rock", "rock")]);
    expect(mem.records()).toHaveLength(1);
  });

  it("recover()는 큐가 비어 있을 때만 실행된다", async () => {
    const mem = createMemoryStore();
    const q = createQueuedStore(mem);
    const resume = mem.pauseWrites();
    const w = q.recordBattles([draft("rock", "rock")]);
    let recovered = false;
    const r = q.recover().then(() => (recovered = true));
    await Promise.resolve();
    await Promise.resolve();
    expect(recovered).toBe(false);
    expect(mem.reopenCount).toBe(0);
    resume();
    await Promise.all([w, r]);
    expect(mem.reopenCount).toBe(1);
  });

  it("동시에 recover()를 호출해도 한 번만 실행한다", async () => {
    const mem = createMemoryStore();
    const q = createQueuedStore(mem);
    q.closeGate("write");
    await Promise.all([q.recover(), q.recover()]);
    expect(mem.reopenCount).toBe(1);
  });

  it("recover() 중 loadStats가 실패하면 게이트는 닫힌 채 StoreError로 거절된다", async () => {
    const mem = createMemoryStore();
    const q = createQueuedStore(mem);
    q.closeGate("read");
    mem.fail.read = 1;
    await expect(q.recover()).rejects.toMatchObject({ kind: "read" });
    expect(q.gate().closed).toBe(true);
  });

  it("clearAll은 게이트에 막히지 않아 저장 불가·손상 상태에서도 초기화할 수 있다(FR2-019)", async () => {
    const mem = createMemoryStore([draft("rock", "rock")]);
    const q = createQueuedStore(mem);
    q.closeGate("write");
    await q.clearAll();
    expect(mem.records()).toEqual([]);
    expect(q.gate().closed).toBe(true); // 초기화 성공이 게이트를 열지 않는다
  });

  it("clearAll 실패는 게이트를 닫지 않는다", async () => {
    const mem = createMemoryStore([draft("rock", "rock")]);
    const q = createQueuedStore(mem);
    mem.fail.clear = 1;
    await expect(q.clearAll()).rejects.toMatchObject({ kind: "write" });
    expect(q.gate()).toEqual({ closed: false });
    expect(mem.records()).toHaveLength(1);
  });

  it("실패 뒤에도 큐는 멈추지 않고 이후 clearAll이 순서대로 실행된다", async () => {
    const mem = createMemoryStore();
    const q = createQueuedStore(mem);
    mem.fail.write = 1;
    const a = q.recordBattles([draft("rock", "rock")]).catch(() => "fail");
    const b = q.clearAll();
    expect(await a).toBe("fail");
    await expect(b).resolves.toBeUndefined();
  });
});

describe("앱 수준 싱글턴", () => {
  it("항상 같은 인스턴스를 돌려준다", () => {
    resetBrowserBattleStoreForTests();
    expect(getBrowserBattleStore()).toBe(getBrowserBattleStore());
    resetBrowserBattleStoreForTests();
  });

  it("indexedDB가 없는 환경(jsdom)에서도 만들 때 던지지 않고 unavailable로 거절한다", async () => {
    resetBrowserBattleStoreForTests();
    const s = getBrowserBattleStore();
    await expect(s.loadStats()).rejects.toMatchObject({ kind: "unavailable" });
    await expect(s.recordBattles([draft("rock", "rock")])).rejects.toMatchObject({ kind: "unavailable" });
    expect(s.gate().closed).toBe(true); // 쓰기 실패는 게이트를 닫는다
    resetBrowserBattleStoreForTests();
  });
});
