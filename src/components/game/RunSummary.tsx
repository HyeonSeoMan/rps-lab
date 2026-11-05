import type { RunSummary as Summary } from "@/lib/game-session";
import styles from "./game.module.css";

/** 실행 요약 박스(시각 요소, live region 아님). 낭독은 결과 영역의 대표 status가 같은 수치로 담당한다. */
export default function RunSummary({ summary }: { summary: Summary }) {
  const t = summary.tally;
  const tally = ` · 승 ${t.wins} · 패 ${t.losses} · 무 ${t.draws}`;
  if (summary.kind === "completed") {
    return (
      <div className={styles.summary}>
        <b>자동 대결 {summary.total}회를 마쳤어요.</b>
        {tally}
      </div>
    );
  }
  if (summary.kind === "stopped") {
    return (
      <div className={styles.summary}>
        <b>중지했어요.</b> {summary.total}회 중 <b>{summary.done}회</b>가 저장됐어요.{tally}
      </div>
    );
  }
  return (
    <div className={`${styles.summary} ${styles.bad}`}>
      <b>저장 실패로 자동 대결을 중단했어요.</b> {summary.total}회 중 <b>{summary.done}회</b>만 저장돼 전적에 반영됐어요. 실패한
      대결은 포함되지 않아요.
    </div>
  );
}
