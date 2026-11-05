import { describe, expect, it } from "vitest";
import { applyOutcome, type Score } from "./game-state";
import type { Outcome } from "./rps";

const zero = (): Score => ({ wins: 0, losses: 0, draws: 0 });
const sum = (s: Score) => s.wins + s.losses + s.draws;

describe("applyOutcome", () => {
  const cases: [Outcome, Score][] = [
    ["win", { wins: 1, losses: 0, draws: 0 }],
    ["lose", { wins: 0, losses: 1, draws: 0 }],
    ["draw", { wins: 0, losses: 0, draws: 1 }],
  ];

  it.each(cases)("AC-006: %s는 해당 항목만 정확히 1 증가한다", (outcome, expected) => {
    expect(applyOutcome(zero(), outcome)).toEqual(expected);
  });

  it("AC-006: 기존 누적값에서도 해당 항목만 증가하고 나머지는 변하지 않는다", () => {
    expect(applyOutcome({ wins: 4, losses: 5, draws: 6 }, "win")).toEqual({ wins: 5, losses: 5, draws: 6 });
  });

  it("입력을 변경하지 않고 새 객체를 반환한다", () => {
    const input = zero();
    const out = applyOutcome(input, "win");
    expect(out).not.toBe(input);
    expect(input).toEqual(zero());
  });

  it("AC-007 / SC-003: 0/0/0에서 N회 적용 후 합계는 항상 N이다", () => {
    const outcomes: Outcome[] = ["win", "lose", "draw"];
    for (const n of [1, 2, 7, 50, 300]) {
      let s = zero();
      for (let i = 0; i < n; i++) s = applyOutcome(s, outcomes[(i * 7 + 1) % 3]);
      expect(sum(s)).toBe(n);
    }
  });
});
