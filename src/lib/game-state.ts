import { judge, type Choice, type Outcome } from "./rps";

/** 각 값은 0 이상의 안전한 정수다. */
export type Score = { wins: number; losses: number; draws: number };

export type Round = { user: Choice; computer: Choice; outcome: Outcome };

export type GameState = { score: Score; lastRound: Round | null };

export type GameAction =
  | { type: "play"; user: Choice; computer: Choice }
  | { type: "reset" };

/** 해당 결과의 항목만 1 증가시킨 새 Score를 반환한다. */
export function applyOutcome(score: Score, outcome: Outcome): Score {
  return {
    wins: score.wins + (outcome === "win" ? 1 : 0),
    losses: score.losses + (outcome === "lose" ? 1 : 0),
    draws: score.draws + (outcome === "draw" ? 1 : 0),
  };
}

export function createInitialState(score: Score): GameState {
  return { score, lastRound: null };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "play": {
      const outcome = judge(action.user, action.computer);
      return {
        score: applyOutcome(state.score, outcome),
        lastRound: { user: action.user, computer: action.computer, outcome },
      };
    }
    case "reset":
      // 항상 새 객체를 반환한다(저장 effect의 참조 비교 전제).
      return { score: { wins: 0, losses: 0, draws: 0 }, lastRound: null };
  }
}
