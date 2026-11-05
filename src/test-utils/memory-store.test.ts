import { describe, expect, it } from "vitest";
import { createMemoryStore } from "./memory-store";
import { describeStoreContract, draft } from "./store-contract";

describeStoreContract("메모리 저장소", () => createMemoryStore());

describe("메모리 저장소 — 실패·지연 주입", () => {
  it("쓰기 실패는 아무것도 저장하지 않는다", async () => {
    const s = createMemoryStore();
    s.fail.write = 1;
    await expect(s.recordBattles([draft("rock", "paper")])).rejects.toMatchObject({ kind: "write" });
    expect(s.records()).toEqual([]);
    await s.recordBattles([draft("rock", "paper")]);
    expect(s.records()).toHaveLength(1);
  });
  it("pauseWrites 동안 쓰기가 보류된다", async () => {
    const s = createMemoryStore();
    const resume = s.pauseWrites();
    let done = false;
    const p = s.recordBattles([draft("rock", "paper")]).then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    resume();
    await p;
    expect(done).toBe(true);
  });
});
