"use client";

import { useReducer } from "react";
import { createInitialState, gameReducer, type Score } from "@/lib/game-state";
import { pickComputerChoice, type Choice, type Outcome } from "@/lib/rps";
import styles from "./Game.module.css";

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

const GUIDE_MESSAGE = "가위, 바위, 보 중 하나를 선택하세요";

type Props = { random?: () => number };

export default function GameBoard({ random = Math.random }: Props) {
  const [state, dispatch] = useReducer(gameReducer, INITIAL_SCORE, createInitialState);

  function play(user: Choice) {
    dispatch({ type: "play", user, computer: pickComputerChoice(random) });
  }

  const round = state.lastRound;
  // 스크린리더용 전체 문장. role="status" 하나가 결과 변화를 알린다.
  const message = round
    ? `나: ${CHOICE_LABEL[round.user]} · 컴퓨터: ${CHOICE_LABEL[round.computer]} — ${OUTCOME_LABEL[round.outcome]}`
    : GUIDE_MESSAGE;

  return (
    <div className={styles.board}>
      <section className={styles.battle} aria-label="최근 라운드 결과">
        <p role="status" className={styles.srOnly}>
          {message}
        </p>
        {/* 시각용 대결 영역: 사용자 | 결과 | 컴퓨터. 문장은 위 status가 대신 전달하므로 중복 낭독을 막는다. */}
        <div className={styles.arena} aria-hidden="true">
          <div className={`${styles.fighter} ${styles.me}`}>
            <span className={styles.name}>나</span>
            <span className={styles.hand}>{round ? CHOICE_EMOJI[round.user] : "?"}</span>
            <span className={styles.pickName}>{round ? CHOICE_LABEL[round.user] : ""}</span>
          </div>
          <div className={styles.outcome} data-outcome={round?.outcome ?? "none"}>
            <span className={styles.vs}>VS</span>
            <strong className={styles.result}>{round ? OUTCOME_LABEL[round.outcome] : ""}</strong>
            <span className={styles.line} />
          </div>
          <div className={`${styles.fighter} ${styles.cpu}`}>
            <span className={styles.name}>컴퓨터</span>
            <span className={styles.hand}>{round ? CHOICE_EMOJI[round.computer] : "?"}</span>
            <span className={styles.pickName}>{round ? CHOICE_LABEL[round.computer] : ""}</span>
          </div>
        </div>
        <p className={styles.hint} aria-hidden="true">
          {round ? "" : GUIDE_MESSAGE}
        </p>
      </section>

      <div className={styles.choices} role="group" aria-label="손 모양 선택">
        {BUTTON_ORDER.map((choice) => (
          <button
            key={choice}
            type="button"
            className={`${styles.button} ${styles.pick}`}
            onClick={() => play(choice)}
          >
            <span aria-hidden="true" className={styles.emoji}>
              {CHOICE_EMOJI[choice]}
            </span>
            <span className={styles.pickLabel}>{CHOICE_LABEL[choice]}</span>
          </button>
        ))}
      </div>

      <ul aria-label="누적 전적" className={styles.score}>
        <li>
          <small>승</small> <strong>{state.score.wins}</strong>
        </li>
        <li>
          <small>패</small> <strong>{state.score.losses}</strong>
        </li>
        <li>
          <small>무</small> <strong>{state.score.draws}</strong>
        </li>
      </ul>
    </div>
  );
}
