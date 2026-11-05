import { outcomeOf, type BattleRecord } from "@/lib/battle";
import type { Choice, Outcome } from "@/lib/rps";
import { CHOICE_EMOJI, CHOICE_LABEL } from "../game/hands";
import styles from "./history.module.css";

const RESULT_LABEL: Record<Outcome, string> = { win: "승리", lose: "패배", draw: "무승부" };
const pad = (n: number) => String(n).padStart(2, "0");

/** 표시용 일시: 2026.11.05 18:30 (브라우저 로컬 시간) */
export function formatAt(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const hand = (c: Choice) => `${CHOICE_EMOJI[c]} ${CHOICE_LABEL[c]}`;

/** 한 페이지의 기록. 넓은 화면은 표, 컨테이너 폭 600px 이하는 카드(CSS로 하나만 보인다). 결과는 judge()로 계산한다. */
export default function RecordList({ rows }: { rows: BattleRecord[] }) {
  return (
    <>
      <table className={styles.table} aria-label="전체 대결 기록">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">시간</th>
            <th scope="col">나</th>
            <th scope="col">컴퓨터</th>
            <th scope="col">결과</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const o = outcomeOf(r);
            return (
              <tr key={r.seq}>
                <td>{r.seq}</td>
                <td>{formatAt(r.at)}</td>
                <td>{hand(r.user)}</td>
                <td>{hand(r.computer)}</td>
                <td>
                  <span className={styles.tag} data-o={o}>
                    {RESULT_LABEL[o]}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <ul className={styles.cards} aria-label="전체 대결 기록">
        {rows.map((r) => {
          const o = outcomeOf(r);
          return (
            <li key={r.seq} className={styles.rc}>
              <span className={styles.m}>
                #{r.seq} · {formatAt(r.at)}
              </span>
              <span className={styles.p}>
                <span>나 {hand(r.user)}</span>
                <span>컴퓨터 {hand(r.computer)}</span>
              </span>
              <span className={styles.tag} data-o={o}>
                {RESULT_LABEL[o]}
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
