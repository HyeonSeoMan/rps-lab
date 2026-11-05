import { describe, expect, it } from "vitest";
import { chunkSize, draftBattle, type AutoSettings } from "./auto-run";

const base: AutoSettings = { pick: "random", hand: "rock", run: "instant", count: 100 };

describe("auto-run", () => {
  it("묶음 크기: 즉시 100, 애니메이션 max(1, N/100)", () => {
    expect(chunkSize({ run: "instant", count: 10 })).toBe(100);
    expect(chunkSize({ run: "instant", count: 1000 })).toBe(100);
    expect(chunkSize({ run: "animated", count: 10 })).toBe(1);
    expect(chunkSize({ run: "animated", count: 100 })).toBe(1);
    expect(chunkSize({ run: "animated", count: 1000 })).toBe(10);
  });
  it("고정 손이면 내 손은 고정, 난수는 컴퓨터에만 쓴다", () => {
    const calls: number[] = [];
    const random = () => (calls.push(1), 0.99);
    const d = draftBattle({ ...base, pick: "fixed", hand: "paper" }, random, () => 7);
    expect(d).toEqual({ user: "paper", computer: "scissors", at: 7 });
    expect(calls).toHaveLength(1);
  });
  it("랜덤이면 사용자 → 컴퓨터 순으로 난수를 쓴다", () => {
    const seq = [0, 0.5];
    const d = draftBattle(base, () => seq.shift()!, () => 1);
    expect(d).toMatchObject({ user: "rock", computer: "paper" });
  });
  it("랜덤 손은 세 손을 균등하게 고른다", () => {
    const counts = { rock: 0, paper: 0, scissors: 0 };
    for (let i = 0; i < 3000; i++) counts[draftBattle(base, () => (i % 3) / 3 + 0.1, () => 0).user]++;
    expect(counts).toEqual({ rock: 1000, paper: 1000, scissors: 1000 });
  });
});
