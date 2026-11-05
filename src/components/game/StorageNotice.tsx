import type { StorageStatus } from "@/lib/game-session";
import { RETRY_FAILED_ALERT } from "@/lib/announce";
import styles from "./game.module.css";

type Props = {
  storage: StorageStatus;
  recovered: boolean;
  retryDisabled: boolean;
  onRetry: () => void;
};

/**
 * 저장 안내(UI Contract 5절). 낭독 책임: 수동 저장 실패·읽기 실패만 role="alert",
 * 자동 중단으로 진입한 박스·재시도 중·복구됨은 live 없음(대표 status가 낭독), 재시도 실패는 숨은 alert 문장.
 */
export default function StorageNotice({ storage, recovered, retryDisabled, onRetry }: Props) {
  if (storage.phase === "ready") {
    if (!recovered) return null;
    return (
      <div className={`${styles.notice} ${styles.ok}`}>
        <strong>저장이 복구되었어요</strong>
        <p>지금부터 대결이 기록돼요. 복구 전의 연습 대결은 저장되지 않아요.</p>
      </div>
    );
  }
  if (storage.phase !== "unavailable") return null;

  if (storage.retry === "retrying") {
    return (
      <div className={`${styles.notice} ${styles.warn}`} aria-busy="true">
        <strong>저장소를 다시 확인하는 중이에요</strong>
        <div className={styles.act}>
          <button type="button" className={styles.retry} disabled aria-busy="true">
            <span className={styles.spin} aria-hidden="true" />
            다시 시도하는 중…
          </button>
        </div>
      </div>
    );
  }

  const readFailure = storage.cause === "read";
  const alert = readFailure || storage.origin !== "run" ? ("alert" as const) : undefined;
  return (
    <div className={`${styles.notice} ${styles.err}`} role={alert}>
      {readFailure ? (
        <>
          <strong>저장된 전적을 불러오지 못했어요</strong>
          <p>전적이 0이라는 뜻은 아니에요. 저장을 다시 시도하기 전까지는 연습 대결만 할 수 있어요.</p>
        </>
      ) : (
        <>
          <strong>기록을 저장하지 못했어요</strong>
          <p>
            저장 불가 상태예요. 지금부터의 직접 대결은 <b>연습 대결</b>이며 전적과 기록에 반영되지 않아요. 자동 대결은 저장을 복구한
            뒤에 할 수 있어요.
          </p>
        </>
      )}
      <div className={styles.act}>
        <button type="button" className={styles.retry} disabled={retryDisabled} onClick={onRetry}>
          저장 다시 시도
        </button>
      </div>
      {storage.retry === "failed" && (
        <p role="alert" className={styles.srOnly}>
          {RETRY_FAILED_ALERT}
        </p>
      )}
    </div>
  );
}
