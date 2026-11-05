import type { Round, Score } from "./game-state";
import { DEFAULT_AUTO_SETTINGS, type AutoSettings } from "./auto-run";
import * as announce from "./announce";

export type StorageStatus =
  | { phase: "loading" }
  | { phase: "ready" }
  | {
      phase: "unavailable";
      cause: "read" | "write";
      retry: "idle" | "retrying" | "failed";
      /** 저장 불가에 들어온 경로. 저장 안내의 낭독 방식(role=alert 여부)을 정한다(UI Contract 5절). */
      origin: "load" | "manual" | "run";
    };

export type RunState =
  | { phase: "idle" }
  | { phase: "saving"; total: number }
  | { phase: "animating"; total: number; done: number; stopping: boolean };

export type RunSummary = { kind: "completed" | "stopped" | "aborted"; total: number; done: number; tally: Score };

export type SessionState = {
  storage: StorageStatus;
  /** null = 읽지 못함/읽는 중. 0/0/0과 구분된다. */
  stats: Score | null;
  mode: "manual" | "auto";
  settings: AutoSettings;
  /** saved=false: 연습/저장 실패 결과 */
  last: { round: Round; saved: boolean } | null;
  run: RunState;
  summary: RunSummary | null;
  reset: "idle" | "confirming" | "resetting";
  notice: null | "recovered" | "reset-failed";
  /** 결과 영역 role="status" 문장. "" 이면 모드별 안내 문구를 화면이 보여 준다. */
  announcement: string;
};

export type SessionAction =
  | { type: "LOADED"; stats: Score }
  | { type: "LOADED_UNAVAILABLE"; cause: "read" | "write"; stats: Score | null }
  | { type: "LOAD_FAILED" }
  | { type: "COMMITTED"; round: Round; stats: Score }
  | { type: "PRACTICED"; round: Round }
  | { type: "SAVE_FAILED"; round: Round }
  | { type: "RUN_STARTED"; settings: AutoSettings }
  | { type: "RUN_PROGRESS"; done: number; last: Round; stats: Score }
  | { type: "RUN_STOP_REQUESTED" }
  | { type: "RUN_FINISHED"; result: RunSummary & { stats?: Score | null } }
  | { type: "RESET_REQUESTED" }
  | { type: "RESET_CANCELLED" }
  | { type: "RESET_CONFIRMED" }
  | { type: "RESET_SUCCEEDED" }
  | { type: "RESET_FAILED" }
  | { type: "RETRY_STARTED" }
  | { type: "RETRY_SUCCEEDED"; stats: Score }
  | { type: "RETRY_FAILED" }
  | { type: "MODE_SET"; mode: "manual" | "auto" }
  | { type: "SETTINGS_SET"; patch: Partial<AutoSettings> };

export function createInitialSession(): SessionState {
  return {
    storage: { phase: "loading" },
    stats: null,
    mode: "manual",
    settings: { ...DEFAULT_AUTO_SETTINGS },
    last: null,
    run: { phase: "idle" },
    summary: null,
    reset: "idle",
    notice: null,
    announcement: "",
  };
}

const unavailable = (cause: "read" | "write", origin: "load" | "manual" | "run"): StorageStatus => ({
  phase: "unavailable",
  cause,
  retry: "idle",
  origin,
});
const isLoading = (s: SessionState) => s.storage.phase === "loading";
const isUnavailable = (s: SessionState) => s.storage.phase === "unavailable";
const clearRecovered = (n: SessionState["notice"]) => (n === "recovered" ? null : n);

/** 순수 reducer. 난수·저장소·타이머를 모른다. 허용되지 않는 전이는 같은 상태 객체를 반환한다. */
export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "LOADED":
      if (!isLoading(state)) return state;
      return { ...state, storage: { phase: "ready" }, stats: action.stats };

    case "LOADED_UNAVAILABLE":
      if (!isLoading(state)) return state;
      return {
        ...state,
        storage: unavailable(action.cause, "load"),
        stats: action.cause === "write" ? action.stats : null,
      };

    case "LOAD_FAILED":
      if (!isLoading(state)) return state;
      return { ...state, storage: unavailable("read", "load"), stats: null };

    case "COMMITTED": {
      return {
        ...state,
        stats: action.stats,
        last: { round: action.round, saved: true },
        notice: clearRecovered(state.notice),
        announcement: announce.manualResult(action.round, true),
      };
    }

    case "PRACTICED":
      if (!isUnavailable(state)) return state;
      return {
        ...state,
        last: { round: action.round, saved: false },
        announcement: announce.manualResult(action.round, false),
      };

    case "SAVE_FAILED": {
      const storage: StorageStatus = isUnavailable(state) ? state.storage : unavailable("write", "manual");
      return {
        ...state,
        storage,
        last: { round: action.round, saved: false },
        announcement: announce.manualResult(action.round, false),
      };
    }

    case "RUN_STARTED": {
      const ok =
        state.run.phase === "idle" &&
        state.storage.phase === "ready" &&
        state.stats !== null &&
        state.reset === "idle";
      if (!ok) return state;
      const total = action.settings.count;
      return {
        ...state,
        settings: action.settings,
        run:
          action.settings.run === "instant"
            ? { phase: "saving", total }
            : { phase: "animating", total, done: 0, stopping: false },
        summary: null,
        announcement: action.settings.run === "instant" ? announce.runSaving(total) : announce.runStarted(total),
      };
    }

    case "RUN_PROGRESS": {
      if (state.run.phase === "idle") return state;
      return {
        ...state,
        run: state.run.phase === "animating" ? { ...state.run, done: action.done } : state.run,
        stats: action.stats,
        last: { round: action.last, saved: true },
        notice: clearRecovered(state.notice),
      };
    }

    case "RUN_STOP_REQUESTED":
      if (state.run.phase !== "animating" || state.run.stopping) return state;
      return { ...state, run: { ...state.run, stopping: true } };

    case "RUN_FINISHED": {
      if (state.run.phase === "idle") return state;
      const { stats, ...summary } = action.result;
      const aborted = summary.kind === "aborted";
      return {
        ...state,
        run: { phase: "idle" },
        summary,
        stats: stats ?? state.stats,
        storage: aborted && !isUnavailable(state) ? unavailable("write", "run") : state.storage,
        announcement: announce.runSummary(summary),
      };
    }

    case "RESET_REQUESTED": {
      const retrying = state.storage.phase === "unavailable" && state.storage.retry === "retrying";
      if (state.run.phase !== "idle" || state.reset !== "idle" || retrying) return state;
      return { ...state, reset: "confirming" };
    }

    case "RESET_CANCELLED":
      return state.reset === "confirming" ? { ...state, reset: "idle" } : state;

    case "RESET_CONFIRMED":
      return state.reset === "confirming" ? { ...state, reset: "resetting" } : state;

    case "RESET_SUCCEEDED":
      if (state.reset !== "resetting") return state;
      return {
        ...state,
        stats: { wins: 0, losses: 0, draws: 0 },
        last: null,
        summary: null,
        reset: "idle",
        notice: null,
        announcement: announce.RESET_DONE_TEXT,
      };

    case "RESET_FAILED":
      if (state.reset !== "resetting") return state;
      return { ...state, reset: "idle", notice: "reset-failed" };

    case "RETRY_STARTED": {
      if (state.storage.phase !== "unavailable" || state.storage.retry === "retrying") return state;
      if (state.run.phase !== "idle" || state.reset !== "idle") return state;
      return {
        ...state,
        storage: { ...state.storage, retry: "retrying" },
        announcement: announce.RETRYING_TEXT,
      };
    }

    case "RETRY_SUCCEEDED": {
      if (state.storage.phase !== "unavailable" || state.storage.retry !== "retrying") return state;
      return {
        ...state,
        storage: { phase: "ready" },
        stats: action.stats,
        last: state.last && !state.last.saved ? null : state.last,
        notice: "recovered",
        announcement: announce.RECOVERED_TEXT,
      };
    }

    case "RETRY_FAILED":
      if (state.storage.phase !== "unavailable" || state.storage.retry !== "retrying") return state;
      return { ...state, storage: { ...state.storage, retry: "failed" } };

    case "MODE_SET":
      if (state.run.phase !== "idle" || state.reset === "resetting") return state;
      return state.mode === action.mode ? state : { ...state, mode: action.mode };

    case "SETTINGS_SET":
      if (state.run.phase !== "idle" || state.reset === "resetting") return state;
      return { ...state, settings: { ...state.settings, ...action.patch } };
  }
}

