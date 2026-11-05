import type { Score } from "@/lib/game-state";
import { formatPercent, ratios, total } from "@/lib/stats";
import styles from "./history.module.css";

/** 승·패·무 비율 막대(장식, aria-hidden)와 텍스트 범례. 막대 폭은 실제 비율이며 반올림하지 않는다(P-10). */
export default function RatioBar({ stats }: { stats: Score | null }) {
  const r = stats ? ratios(stats) : null;
  const pct = (v: number | undefined) => (v === undefined ? "—" : formatPercent(v * 100));
  return (
    <>
      <div className={styles.graph} aria-hidden="true">
        {r && stats && total(stats) > 0 && (
          <>
            <i className={styles.gw} style={{ width: `${r.wins * 100}%` }} />
            <i className={styles.gl} style={{ width: `${r.losses * 100}%` }} />
            <i className={styles.gd} style={{ width: `${r.draws * 100}%` }} />
          </>
        )}
      </div>
      <div className={styles.legend}>
        <span className={styles.lw}>승 {pct(r?.wins)}</span>
        <span className={styles.ll}>패 {pct(r?.losses)}</span>
        <span className={styles.ld}>무 {pct(r?.draws)}</span>
      </div>
    </>
  );
}
