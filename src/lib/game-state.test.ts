import { describe, expect, it } from "vitest";
import {
  applyOutcome,
  createInitialState,
  gameReducer,
  type GameState,
  type Score,
} from "./game-state";
import type { Choice, Outcome } from "./rps";

const zero = (): Score => ({ wins: 0, losses: 0, draws: 0 });
const sum = (s: Score) => s.wins + s.losses + s.draws;

describe("createInitialState", () => {
  it("전달한 전적과 lastRound=null로 시작한다", () => {
    const score = { wins: 5, losses: 3, draws: 2 };
    expect(createInitialState(score)).toEqual({ score, lastRound: null });
  });
});

describe("applyOutcome / play", () => {
  const cases: [Outcome, Choice, Choice, Score][] = [
    ["win", "rock", "scissors", { wins: 1, losses: 0, draws: 0 }],
    ["lose", "rock", "paper", { wins: 0, losses: 1, draws: 0 }],
    ["draw", "rock", "rock", { wins: 0, losses: 0, draws: 1 }],
  ];

  it.each(cases)(
    "AC-006: %s 라운드는 해당 항목만 정확히 1 증가한다",
    (outcome, user, computer, expected) => {
      const start = createInitialState(zero());
      const next = gameReducer(start, { type: "play", user, computer });
      expect(next.score).toEqual(expected);
      expect(next.lastRound).toEqual({ user, computer, outcome });
    },
  );

  it("AC-006: 기존 누적값에서도 해당 항목만 증가하고 나머지는 변하지 않는다", () => {
    const start = createInitialState({ wins: 4, losses: 5, draws: 6 });
    const next = gameReducer(start, {
      type: "play",
      user: "paper",
      computer: "rock",
    });
    expect(next.score).toEqual({ wins: 5, losses: 5, draws: 6 });
  });

  it("applyOutcome은 입력을 변경하지 않고 새 객체를 반환한다", () => {
    const input = zero();
    const out = applyOutcome(input, "win");
    expect(out).not.toBe(input);
    expect(input).toEqual(zero());
    expect(out).toEqual({ wins: 1, losses: 0, draws: 0 });
  });

  it("AC-007 / SC-003: 0/0/0에서 N라운드 후 합계는 항상 N이다", () => {
    const choices: Choice[] = ["rock", "paper", "scissors"];
    for (const n of [1, 2, 7, 50, 300]) {
      let state: GameState = createInitialState(zero());
      for (let i = 0; i < n; i++) {
        state = gameReducer(state, {
          type: "play",
          user: choices[i % 3],
          computer: choices[(i * 7 + 1) % 3],
        });
      }
      expect(sum(state.score)).toBe(n);
    }
  });

  it("FR-004: 가장 최근 라운드 1개만 보관한다(이력 필드 없음)", () => {
    let state = createInitialState(zero());
    state = gameReducer(state, { type: "play", user: "rock", computer: "rock" });
    state = gameReducer(state, { type: "play", user: "paper", computer: "rock" });
    expect(state.lastRound).toEqual({
      user: "paper",
      computer: "rock",
      outcome: "win",
    });
    expect(Object.keys(state).sort()).toEqual(["lastRound", "score"]);
  });

  it("play는 입력 state를 변경하지 않고 새 Score 객체를 반환한다", () => {
    const start = createInitialState(zero());
    const frozenScore = start.score;
    const next = gameReducer(start, { type: "play", user: "rock", computer: "rock" });
    expect(next.score).not.toBe(frozenScore);
    expect(start.score).toEqual(zero());
    expect(start.lastRound).toBeNull();
  });
});

describe("reset", () => {
  it("FR-008: 새 0/0/0 객체와 lastRound=null로 되돌린다", () => {
    let state = createInitialState({ wins: 3, losses: 2, draws: 1 });
    state = gameReducer(state, { type: "play", user: "rock", computer: "rock" });
    const next = gameReducer(state, { type: "reset" });
    expect(next.score).toEqual(zero());
    expect(next.lastRound).toBeNull();
  });

  it("reset은 항상 새 Score 객체를 반환한다(이미 0/0/0이어도 동일 참조 아님)", () => {
    const start = createInitialState(zero());
    const a = gameReducer(start, { type: "reset" });
    const b = gameReducer(a, { type: "reset" });
    expect(a.score).not.toBe(start.score);
    expect(b.score).not.toBe(a.score);
  });
});
