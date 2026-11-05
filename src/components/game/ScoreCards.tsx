import type { Score } from "@/lib/game-state";
import styles from "./game.module.css";

/** 승·패·무 색상 카드. 읽지 못한 상태(stats=null)는 0과 구분해 "—"로 표시한다. */
export default function ScoreCards({ stats }: { stats: Score | null }) {
  const items = [
    { label: "승", value: stats?.wins, cls: styles.w },
    { label: "패", value: stats?.losses, cls: styles.l },
    { label: "무", value: stats?.draws, cls: styles.d },
  ];
  return (
    <ul aria-label="누적 전적" className={styles.stats}>
      {items.map(({ label, value, cls }) => (
        <li key={label} className={`${styles.stat} ${cls}`}>
          <small>{label}</small>{" "}
          {value === undefined ? (
            <>
              <strong aria-hidden="true">—</strong>
              <span className={styles.srOnly}>기록을 불러오지 못했어요</span>
            </>
          ) : (
            <strong>{value}</strong>
          )}
        </li>
      ))}
    </ul>
  );
}
