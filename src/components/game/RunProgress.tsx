import styles from "./game.module.css";

type Props = { done: number; total: number; stopping: boolean; onStop: () => void };

/** 애니메이션 실행 중에만 표시: 진행 횟수 / 전체, 진행 표시줄, 중지 버튼. */
export default function RunProgress({ done, total, stopping, onStop }: Props) {
  return (
    <div className={styles.progress}>
      <div className={styles.prow}>
        <strong>
          {done} / {total}회
        </strong>
        <button type="button" className={styles.stop} disabled={stopping} onClick={onStop}>
          중지
        </button>
      </div>
      <div
        className={styles.bar}
        role="progressbar"
        aria-label="자동 대결 진행"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={`${done}회 / ${total}회`}
      >
        <i style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }} />
      </div>
      <p className={styles.note}>중지하면 저장된 대결만 전적에 반영돼요.</p>
    </div>
  );
}
