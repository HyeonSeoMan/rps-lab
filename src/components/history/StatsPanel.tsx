import type { Score } from "@/lib/game-state";
import { formatPercent, total, winRate } from "@/lib/stats";
import ScoreCards from "../game/ScoreCards";
import RatioBar from "./RatioBar";
import styles from "./history.module.css";

export default function StatsPanel({ stats }: { stats: Score | null }) {
  return (
    <section className={styles.card} aria-labelledby="stats-title">
      <h2 id="stats-title" className={styles.stitle}>
        통계
      </h2>
      <p className={styles.sub}>전체 누적 대결을 기준으로 계산해요.</p>
      <div className={styles.sumbox}>
        <div>
          <small>총 대결</small>
          <strong>{stats ? `${total(stats)}회` : "—"}</strong>
        </div>
        <div>
          <small>승률 (무승부 포함)</small>
          <strong>{stats ? formatPercent(winRate(stats)) : "—"}</strong>
        </div>
      </div>
      <ScoreCards stats={stats} />
      <RatioBar stats={stats} />
      <p className={styles.hint}>승률 = 승리 횟수 ÷ 전체 대결 횟수 × 100</p>
    </section>
  );
}
