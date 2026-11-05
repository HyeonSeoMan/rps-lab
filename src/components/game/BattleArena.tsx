import type { Round } from "@/lib/game-state";
import { CHOICE_EMOJI, CHOICE_LABEL, OUTCOME_LABEL } from "./hands";
import styles from "./game.module.css";

export const MANUAL_GUIDE = "가위, 바위, 보 중 하나를 선택하세요";
export const AUTO_GUIDE = "자동 대결 설정 후 시작하세요";

type Props = {
  mode: "manual" | "auto";
  last: { round: Round; saved: boolean } | null;
  /** 대표 live region 문장. 비어 있으면 모드별 안내 문구를 보여 준다. */
  announcement: string;
};

/** 결과 영역. role="status"는 이 영역에 정확히 1개이며, 시각용 대결 영역은 aria-hidden이다. */
export default function BattleArena({ mode, last, announcement }: Props) {
  const round = last?.round ?? null;
  const guide = mode === "auto" ? AUTO_GUIDE : MANUAL_GUIDE;
  return (
    <section className={styles.battle} aria-label="최근 라운드 결과">
      <p role="status" className={styles.srOnly}>
        {announcement || guide}
      </p>
      <div className={styles.arena} aria-hidden="true">
        <div className={`${styles.fighter} ${styles.me}`}>
          <span className={styles.name}>나</span>
          <span className={styles.hand}>{round ? CHOICE_EMOJI[round.user] : "?"}</span>
          <span className={styles.pickName}>{round ? CHOICE_LABEL[round.user] : ""}</span>
        </div>
        <div className={styles.outcome} data-outcome={round?.outcome ?? "none"}>
          <span className={styles.vs}>VS</span>
          <strong className={styles.result}>{round ? OUTCOME_LABEL[round.outcome] : ""}</strong>
        </div>
        <div className={`${styles.fighter} ${styles.cpu}`}>
          <span className={styles.name}>컴퓨터</span>
          <span className={styles.hand}>{round ? CHOICE_EMOJI[round.computer] : "?"}</span>
          <span className={styles.pickName}>{round ? CHOICE_LABEL[round.computer] : ""}</span>
        </div>
      </div>
      {last && !last.saved && (
        <div className={styles.unsaved} aria-hidden="true">
          <span className={styles.chip}>저장되지 않음 · 연습 대결</span>
        </div>
      )}
      <p className={styles.hint} aria-hidden="true">
        {round ? "" : guide}
      </p>
    </section>
  );
}
