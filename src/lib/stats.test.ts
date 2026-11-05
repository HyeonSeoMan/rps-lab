import { describe, expect, it } from "vitest";
import { formatPercent, pageCount, ratios, total, winRate } from "./stats";

describe("stats", () => {
  it("0건이면 승률 0, 0.0%, 비율 0", () => {
    const z = { wins: 0, losses: 0, draws: 0 };
    expect(total(z)).toBe(0);
    expect(winRate(z)).toBe(0);
    expect(formatPercent(winRate(z))).toBe("0.0%");
    expect(ratios(z)).toEqual({ wins: 0, losses: 0, draws: 0 });
  });
  it("승률은 소수 첫째 자리까지 표시", () => {
    expect(formatPercent(winRate({ wins: 1, losses: 1, draws: 1 }))).toBe("33.3%");
    expect(formatPercent(winRate({ wins: 2, losses: 1, draws: 0 }))).toBe("66.7%");
    expect(formatPercent(winRate({ wins: 3, losses: 0, draws: 0 }))).toBe("100.0%");
  });
  it("비율은 반올림하지 않은 실제 비율", () => {
    const r = ratios({ wins: 1, losses: 1, draws: 1 });
    expect(r.wins).toBeCloseTo(1 / 3, 10);
    expect(r.wins + r.losses + r.draws).toBeCloseTo(1, 10);
  });
  it("pageCount는 0건이어도 1, 20건 단위", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(1)).toBe(1);
    expect(pageCount(20)).toBe(1);
    expect(pageCount(21)).toBe(2);
    expect(pageCount(100000)).toBe(5000);
  });
});
