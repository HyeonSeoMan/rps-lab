import type { Choice, Outcome } from "./rps";

/** 각 값은 0 이상의 안전한 정수다. */
export type Score = { wins: number; losses: number; draws: number };

export type Round = { user: Choice; computer: Choice; outcome: Outcome };

/** 해당 결과의 항목만 1 증가시킨 새 Score를 반환한다. */
export function applyOutcome(score: Score, outcome: Outcome): Score {
  return {
    wins: score.wins + (outcome === "win" ? 1 : 0),
    losses: score.losses + (outcome === "lose" ? 1 : 0),
    draws: score.draws + (outcome === "draw" ? 1 : 0),
  };
}
