import type { Choice } from "@/lib/rps";
import type { AutoSettings } from "@/lib/auto-run";
import type { RunState, RunSummary as Summary, StorageStatus } from "@/lib/game-session";
import { BUTTON_ORDER, CHOICE_EMOJI, CHOICE_LABEL } from "./hands";
import RunProgress from "./RunProgress";
import RunSummary from "./RunSummary";
import styles from "./game.module.css";

type Props = {
  settings: AutoSettings;
  run: RunState;
  storage: StorageStatus;
  hasStats: boolean;
  summary: Summary | null;
  onSettings: (patch: Partial<AutoSettings>) => void;
  onStart: () => void;
  onStop: () => void;
};

const COUNT_LABEL: Record<AutoSettings["count"], string> = { 10: "10회", 100: "100회", 1000: "1,000회" };

export default function AutoPanel({ settings, run, storage, hasStats, summary, onSettings, onStart, onStop }: Props) {
  const running = run.phase !== "idle";
  const blocked = !running && (storage.phase !== "ready" || !hasStats);
  const pill = (pressed: boolean, label: React.ReactNode, onClick: () => void) => (
    <button type="button" className={styles.pill} aria-pressed={pressed} disabled={running} onClick={onClick}>
      {label}
    </button>
  );

  return (
    <div className={styles.panel}>
      <div className={styles.fld} role="group" aria-labelledby="auto-pick">
        <h3 id="auto-pick">내 손 선택</h3>
        <div className={`${styles.pills} ${styles.c2}`}>
          {pill(settings.pick === "fixed", "고정 선택", () => onSettings({ pick: "fixed" }))}
          {pill(settings.pick === "random", "매번 랜덤", () => onSettings({ pick: "random" }))}
        </div>
        {settings.pick === "fixed" && (
          <div className={`${styles.pills} ${styles.c3}`} role="group" aria-label="고정할 손">
            {BUTTON_ORDER.map((c: Choice) =>
              pill(
                settings.hand === c,
                <>
                  <span aria-hidden="true">{CHOICE_EMOJI[c]} </span>
                  {CHOICE_LABEL[c]}
                </>,
                () => onSettings({ hand: c }),
              ),
            )}
          </div>
        )}
      </div>
      <div className={styles.fld} role="group" aria-labelledby="auto-run">
        <h3 id="auto-run">실행 방식</h3>
        <div className={`${styles.pills} ${styles.c2}`}>
          {pill(settings.run === "instant", "즉시 결과", () => onSettings({ run: "instant" }))}
          {pill(settings.run === "animated", "애니메이션", () => onSettings({ run: "animated" }))}
        </div>
      </div>
      <div className={styles.fld} role="group" aria-labelledby="auto-count">
        <h3 id="auto-count">대결 횟수</h3>
        <div className={`${styles.pills} ${styles.c3}`}>
          {([10, 100, 1000] as const).map((n) => (
            <span key={n} style={{ display: "contents" }}>
              {pill(settings.count === n, COUNT_LABEL[n], () => onSettings({ count: n }))}
            </span>
          ))}
        </div>
      </div>

      {run.phase === "saving" ? (
        <>
          <button type="button" className={styles.primary} disabled aria-busy="true">
            <span className={styles.spin} aria-hidden="true" />
            저장하며 실행하는 중…
          </button>
          <p className={styles.runnote}>
            <span className={styles.spin} aria-hidden="true" />
            {run.total}회를 처리하고 저장하는 중이에요. 끝나면 결과가 표시돼요.
          </p>
        </>
      ) : run.phase === "animating" ? (
        <>
          <button type="button" className={styles.primary} disabled aria-busy="true">
            대결 진행 중…
          </button>
          <RunProgress done={run.done} total={run.total} stopping={run.stopping} onStop={onStop} />
        </>
      ) : (
        <>
          <button type="button" className={styles.primary} disabled={blocked} onClick={onStart}>
            자동 대결 시작
          </button>
          {storage.phase === "unavailable" && (
            <p className={styles.note} role="note">
              저장 불가 상태에서는 자동 대결을 시작할 수 없어요. 저장을 복구하면 가능해요.
            </p>
          )}
        </>
      )}
      {!running && summary && <RunSummary summary={summary} />}
    </div>
  );
}
