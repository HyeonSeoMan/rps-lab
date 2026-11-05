import type { Score } from "./game-state";
import type { BattleStore } from "./battle-store";
import { ANIMATION_TICK_MS, chunkSize, draftBattle, type AutoSettings } from "./auto-run";
import { outcomeOf } from "./battle";
import type { Round } from "./game-state";

export type RunSummaryData = {
  kind: "completed" | "stopped" | "aborted";
  total: number;
  /** 커밋(확정)된 대결 수 */
  done: number;
  /** 이번 실행에서 확정된 승·패·무 */
  tally: Score;
};

export type RunResult = RunSummaryData & {
  /** 마지막으로 확정된 저장소 통계. 한 묶음도 확정되지 않았으면 null */
  stats: Score | null;
  /** aborted일 때 원인 */
  error?: unknown;
};

export type RunProgress = {
  done: number;
  total: number;
  last: Round;
  stats: Score;
  tally: Score;
};

export type AutoRunnerDeps = {
  /** 큐로 감싼 저장소(QueuedBattleStore)를 주입한다. */
  store: Pick<BattleStore, "recordBattles">;
  random: () => number;
  now: () => number;
  /** ms 대기. signal이 abort되면 일찍 resolve해야 한다. */
  wait: (ms: number, signal: AbortSignal) => Promise<void>;
  signal: AbortSignal;
  onProgress?: (p: RunProgress) => void;
};

export function defaultWait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(id);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const id = setTimeout(done, ms);
    signal.addEventListener("abort", done);
  });
}

/**
 * 자동 대결을 묶음 단위로 저장하며 실행한다.
 * - abort()는 묶음 사이에서만 반영된다. 이미 시작된 묶음은 커밋되면 포함, 아니면 완전 제외된다.
 * - 저장 실패(skipped 포함)는 즉시 aborted로 끝나며, 중지 요청과 겹쳐도 aborted가 우선한다.
 * - 마지막 묶음 확정과 중지가 겹치면 completed로 처리한다.
 */
export async function runAutoBattles(settings: AutoSettings, deps: AutoRunnerDeps): Promise<RunResult> {
  const { store, random, now, wait, signal, onProgress } = deps;
  const total = settings.count;
  const size = chunkSize(settings);
  const tally: Score = { wins: 0, losses: 0, draws: 0 };
  let done = 0;
  let stats: Score | null = null;

  const result = (kind: RunSummaryData["kind"], error?: unknown): RunResult => ({
    kind,
    total,
    done,
    tally: { ...tally },
    stats,
    ...(error === undefined ? {} : { error }),
  });

  while (done < total) {
    if (signal.aborted) return result("stopped");
    const n = Math.min(size, total - done);
    const drafts = Array.from({ length: n }, () => draftBattle(settings, random, now));
    try {
      stats = await store.recordBattles(drafts);
    } catch (error) {
      return result("aborted", error);
    }
    for (const d of drafts) {
      const o = outcomeOf(d);
      tally[o === "win" ? "wins" : o === "lose" ? "losses" : "draws"]++;
    }
    done += n;
    const lastDraft = drafts[drafts.length - 1];
    onProgress?.({
      done,
      total,
      last: { user: lastDraft.user, computer: lastDraft.computer, outcome: outcomeOf(lastDraft) },
      stats,
      tally: { ...tally },
    });
    if (done < total && settings.run === "animated") await wait(ANIMATION_TICK_MS, signal);
  }
  return result("completed");
}
