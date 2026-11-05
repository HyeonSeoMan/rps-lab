import { describe, expect, it } from "vitest";
import { isBattleDraft, isBattleRecord, isScore, outcomeOf } from "./battle";

describe("battle 검증", () => {
  it("유효한 레코드를 받아들인다", () => {
    expect(isBattleRecord({ seq: 1, user: "rock", computer: "paper", at: 1 })).toBe(true);
  });
  it.each([
    [{ seq: 0, user: "rock", computer: "paper", at: 1 }],
    [{ seq: 1.5, user: "rock", computer: "paper", at: 1 }],
    [{ seq: 1, user: "stone", computer: "paper", at: 1 }],
    [{ seq: 1, user: "rock", computer: "paper", at: Number.NaN }],
    [{ seq: Number.MAX_SAFE_INTEGER + 1, user: "rock", computer: "paper", at: 1 }],
    [null],
    ["x"],
  ])("잘못된 레코드를 거부한다 %#", (v) => {
    expect(isBattleRecord(v)).toBe(false);
  });
  it("드래프트는 seq 없이도 유효하다", () => {
    expect(isBattleDraft({ user: "rock", computer: "rock", at: 0 })).toBe(true);
    expect(isBattleDraft({ user: "rock", at: 0 })).toBe(false);
  });
  it("Score는 0 이상의 안전한 정수만 허용한다", () => {
    expect(isScore({ wins: 0, losses: 1, draws: 2 })).toBe(true);
    expect(isScore({ wins: -1, losses: 0, draws: 0 })).toBe(false);
    expect(isScore({ wins: 0.5, losses: 0, draws: 0 })).toBe(false);
    expect(isScore({ wins: 0, losses: 0 })).toBe(false);
  });
  it("결과는 judge()로 계산된다", () => {
    expect(outcomeOf({ user: "rock", computer: "scissors" })).toBe("win");
    expect(outcomeOf({ user: "rock", computer: "paper" })).toBe("lose");
    expect(outcomeOf({ user: "paper", computer: "paper" })).toBe("draw");
  });
});
