import { describe, expect, it } from "vitest";
import { judge, pickComputerChoice, type Choice, type Outcome } from "./rps";

describe("judge", () => {
  const table: [Choice, Choice, Outcome][] = [
    ["scissors", "scissors", "draw"],
    ["scissors", "rock", "lose"],
    ["scissors", "paper", "win"],
    ["rock", "scissors", "win"],
    ["rock", "rock", "draw"],
    ["rock", "paper", "lose"],
    ["paper", "scissors", "lose"],
    ["paper", "rock", "win"],
    ["paper", "paper", "draw"],
  ];

  it.each(table)(
    "AC-003: 사용자 %s vs 컴퓨터 %s → %s",
    (user, computer, expected) => {
      expect(judge(user, computer)).toBe(expected);
    },
  );

  it("AC-003: 9가지 조합을 모두 검증한다", () => {
    expect(table).toHaveLength(9);
    expect(new Set(table.map(([u, c]) => `${u}/${c}`)).size).toBe(9);
  });
});

describe("pickComputerChoice", () => {
  it.each([
    [0, "rock"],
    [0.34, "paper"],
    [0.67, "scissors"],
    [0.9999999, "scissors"],
    [1, "scissors"],
  ] as const)("AC-004: random()=%s → %s (경계값 매핑)", (value, expected) => {
    expect(pickComputerChoice(() => value)).toBe(expected);
  });

  it("AC-004: 시드 고정 의사난수 3,000회에서 세 값이 모두 등장한다", () => {
    // 테스트 전용 LCG (재현 가능한 난수열)
    let seed = 12345;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const seen = new Set<Choice>();
    for (let i = 0; i < 3000; i++) {
      seen.add(pickComputerChoice(random));
    }
    expect(seen).toEqual(new Set(["rock", "paper", "scissors"]));
  });

  it("AC-004: 사용자 선택이나 이전 결과와 무관하게 주입된 난수만 사용한다", () => {
    const values = [0, 0, 0.5, 0.5];
    let i = 0;
    const picks = values.map(() => pickComputerChoice(() => values[i++]));
    expect(picks).toEqual(["rock", "rock", "paper", "paper"]);
  });
});
