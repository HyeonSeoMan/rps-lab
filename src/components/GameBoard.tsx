"use client";

import { useReducer } from "react";
import { createInitialState, gameReducer, type Score } from "@/lib/game-state";
import { pickComputerChoice, type Choice, type Outcome } from "@/lib/rps";

const INITIAL_SCORE: Score = { wins: 0, losses: 0, draws: 0 };

const CHOICE_LABEL: Record<Choice, string> = {
  scissors: "가위",
  rock: "바위",
  paper: "보",
};

const CHOICE_EMOJI: Record<Choice, string> = {
  scissors: "✌️",
  rock: "✊",
  paper: "✋",
};

const OUTCOME_LABEL: Record<Outcome, string> = {
  win: "승리!",
  lose: "패배",
  draw: "무승부",
};

const BUTTON_ORDER: readonly Choice[] = ["scissors", "rock", "paper"];

type Props = { random?: () => number };

export default function GameBoard({ random = Math.random }: Props) {
  const [state, dispatch] = useReducer(gameReducer, INITIAL_SCORE, createInitialState);

  function play(user: Choice) {
    dispatch({ type: "play", user, computer: pickComputerChoice(random) });
  }

  const round = state.lastRound;

  return (
    <>
      <p role="status">
        {round
          ? `나: ${CHOICE_LABEL[round.user]} · 컴퓨터: ${CHOICE_LABEL[round.computer]} — ${OUTCOME_LABEL[round.outcome]}`
          : "가위, 바위, 보 중 하나를 선택하세요"}
      </p>
      <div>
        {BUTTON_ORDER.map((choice) => (
          <button key={choice} type="button" onClick={() => play(choice)}>
            <span aria-hidden="true">{CHOICE_EMOJI[choice]}</span> {CHOICE_LABEL[choice]}
          </button>
        ))}
      </div>
      <ul aria-label="누적 전적">
        <li>승 {state.score.wins}</li>
        <li>패 {state.score.losses}</li>
        <li>무 {state.score.draws}</li>
      </ul>
    </>
  );
}
