"use client";

import { useEffect, useReducer, useState } from "react";
import { createInitialState, gameReducer } from "@/lib/game-state";
import { pickComputerChoice, type Choice, type Outcome } from "@/lib/rps";
import { getBrowserStorage, loadScore, saveScore } from "@/lib/score-storage";
import styles from "./Game.module.css";

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
  // 마운트 시 한 번 동기적으로 저장값을 읽어 초기 상태로 쓴다. 이 컴포넌트는 클라이언트 준비 게이트(Game)
  // 뒤에서만 마운트되므로 서버 렌더·하이드레이션과 충돌하지 않고, 복원 전 0/0/0이 표시되지 않는다.
  const [loaded] = useState(() => loadScore(getBrowserStorage()));
  const [state, dispatch] = useReducer(gameReducer, loaded.score, createInitialState);

  // 전적이 바뀐 경우에만 저장한다(외부 시스템 localStorage와의 동기화).
  // 마운트 직후(복원값 그대로)에는 쓰지 않고, 읽기에 실패한 세션(writable=false)에서는 기존 데이터를
  // 덮어쓰지 않도록 저장하지 않는다. reducer가 play/reset마다 새 Score 객체를 반환하는 것이 전제다.
  useEffect(() => {
    if (!loaded.writable || state.score === loaded.score) return;
    const storage = getBrowserStorage();
    if (storage) saveScore(storage, state.score);
  }, [loaded, state.score]);

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

      <button
        type="button"
        className={`${styles.button} ${styles.reset}`}
        onClick={() => dispatch({ type: "reset" })}
      >
        전적 초기화
      </button>
    </div>
  );
}
