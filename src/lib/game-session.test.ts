import { describe, expect, it } from "vitest";
import { createInitialSession, sessionReducer, type SessionAction, type SessionState } from "./game-session";
import type { Round, Score } from "./game-state";
import type { AutoSettings } from "./auto-run";
import * as announce from "./announce";

const Z: Score = { wins: 0, losses: 0, draws: 0 };
const round = (outcomeUser: Round["user"] = "rock", computer: Round["computer"] = "scissors"): Round => ({
  user: outcomeUser,
  computer,
  outcome: outcomeUser === computer ? "draw" : "win",
});
const instant: AutoSettings = { pick: "random", hand: "rock", run: "instant", count: 100 };
const animated: AutoSettings = { ...instant, run: "animated", count: 10 };

const reduce = (s: SessionState, ...actions: SessionAction[]) => actions.reduce(sessionReducer, s);
const ready = (stats: Score = Z) => reduce(createInitialSession(), { type: "LOADED", stats });
const unavailableState = () => reduce(createInitialSession(), { type: "LOAD_FAILED" });
const writeFailed = () => reduce(ready(), { type: "SAVE_FAILED", round: round() });
const animating = () => reduce(ready(), { type: "RUN_STARTED", settings: animated });

describe("로딩", () => {
  it("초기 상태는 loading, stats=null(0/0/0과 구분), 수동 모드", () => {
    const s = createInitialSession();
    expect(s).toMatchObject({ storage: { phase: "loading" }, stats: null, mode: "manual", announcement: "" });
  });
  it("LOADED → ready", () => {
    expect(ready({ wins: 1, losses: 0, draws: 0 })).toMatchObject({ storage: { phase: "ready" }, stats: { wins: 1 } });
  });
  it("LOAD_FAILED → unavailable(read), stats=null", () => {
    expect(unavailableState()).toMatchObject({ storage: { phase: "unavailable", cause: "read", retry: "idle" }, stats: null });
  });
  it("LOADED_UNAVAILABLE: write는 통계 표시, read는 stats=null", () => {
    const w = reduce(createInitialSession(), { type: "LOADED_UNAVAILABLE", cause: "write", stats: { wins: 2, losses: 0, draws: 0 } });
    expect(w).toMatchObject({ storage: { phase: "unavailable", cause: "write" }, stats: { wins: 2 } });
    const r = reduce(createInitialSession(), { type: "LOADED_UNAVAILABLE", cause: "read", stats: { wins: 2, losses: 0, draws: 0 } });
    expect(r.stats).toBeNull();
  });
  it("로딩이 아닐 때 도착한 로딩 액션은 무시된다", () => {
    const s = ready();
    expect(sessionReducer(s, { type: "LOADED", stats: { wins: 9, losses: 0, draws: 0 } })).toBe(s);
    expect(sessionReducer(s, { type: "LOAD_FAILED" })).toBe(s);
  });
});

describe("수동 대결", () => {
  it("COMMITTED: 저장소가 돌려준 통계로만 갱신하고 낭독 문장을 만든다", () => {
    const s = reduce(ready(), { type: "COMMITTED", round: round(), stats: { wins: 1, losses: 0, draws: 0 } });
    expect(s.stats).toEqual({ wins: 1, losses: 0, draws: 0 });
    expect(s.last).toEqual({ round: round(), saved: true });
    expect(s.announcement).toBe("나: 바위 · 컴퓨터: 가위 — 승리!");
  });
  it("SAVE_FAILED: unavailable(write), 통계 불변, 연습 결과(꼬리표)", () => {
    const s = writeFailed();
    expect(s.storage).toMatchObject({ phase: "unavailable", cause: "write", retry: "idle" });
    expect(s.stats).toEqual(Z);
    expect(s.last).toEqual({ round: round(), saved: false });
    expect(s.announcement).toBe("나: 바위 · 컴퓨터: 가위 — 승리! (저장되지 않음 · 연습 대결)");
  });
  it("PRACTICED: 저장 불가에서만, 통계 불변", () => {
    const s = reduce(writeFailed(), { type: "PRACTICED", round: round("paper", "paper") });
    expect(s.stats).toEqual(Z);
    expect(s.last).toEqual({ round: round("paper", "paper"), saved: false });
    const ok = ready();
    expect(sessionReducer(ok, { type: "PRACTICED", round: round() })).toBe(ok);
  });
  it("저장 불가 상태의 SAVE_FAILED는 재시도 상태를 초기화하지 않는다", () => {
    const failedRetry = reduce(writeFailed(), { type: "RETRY_STARTED" }, { type: "RETRY_FAILED" });
    const s = reduce(failedRetry, { type: "SAVE_FAILED", round: round() });
    expect(s.storage).toMatchObject({ retry: "failed" });
  });
});

describe("자동 실행", () => {
  it("RUN_STARTED(즉시): saving + 문장 2, 애니메이션: animating + 문장 1", () => {
    const a = reduce(ready(), { type: "RUN_STARTED", settings: instant });
    expect(a.run).toEqual({ phase: "saving", total: 100 });
    expect(a.announcement).toBe("자동 대결 100회를 처리하고 저장하고 있어요.");
    const b = animating();
    expect(b.run).toEqual({ phase: "animating", total: 10, done: 0, stopping: false });
    expect(b.announcement).toBe("자동 대결 10회를 시작했어요.");
  });
  it.each([
    ["loading", createInitialSession()],
    ["unavailable", unavailableState()],
    ["이미 실행 중", animating()],
    ["초기화 확인 중", reduce(ready(), { type: "RESET_REQUESTED" })],
  ])("RUN_STARTED는 %s 상태에서 무시된다", (_n, s) => {
    expect(sessionReducer(s, { type: "RUN_STARTED", settings: instant })).toBe(s);
  });
  it("RUN_PROGRESS: 진행·통계·last 갱신, 실행 중이 아니면 무시, 대결마다 낭독하지 않는다(P-7)", () => {
    const s = reduce(animating(), { type: "RUN_PROGRESS", done: 3, last: round(), stats: { wins: 3, losses: 0, draws: 0 } });
    expect(s.run).toMatchObject({ done: 3 });
    expect(s.stats).toEqual({ wins: 3, losses: 0, draws: 0 });
    expect(s.last?.saved).toBe(true);
    expect(s.announcement).toBe("자동 대결 10회를 시작했어요."); // 변하지 않음
    const idle = ready();
    expect(sessionReducer(idle, { type: "RUN_PROGRESS", done: 1, last: round(), stats: Z })).toBe(idle);
  });
  it("RUN_STOP_REQUESTED: 애니메이션에서만, stopping=true", () => {
    expect((reduce(animating(), { type: "RUN_STOP_REQUESTED" }).run as { stopping: boolean }).stopping).toBe(true);
    const saving = reduce(ready(), { type: "RUN_STARTED", settings: instant });
    expect(sessionReducer(saving, { type: "RUN_STOP_REQUESTED" })).toBe(saving);
  });
  it.each([
    ["completed", announce.runCompleted(10, { wins: 4, losses: 3, draws: 3 })],
    ["stopped", announce.runStopped(10, 6, { wins: 4, losses: 1, draws: 1 })],
    ["aborted", announce.runAborted(6)],
  ] as const)("RUN_FINISHED(%s): idle, 요약·낭독 문장", (kind, text) => {
    const tally = kind === "completed" ? { wins: 4, losses: 3, draws: 3 } : { wins: 4, losses: 1, draws: 1 };
    const done = kind === "completed" ? 10 : 6;
    const s = reduce(animating(), {
      type: "RUN_FINISHED",
      result: { kind, total: 10, done, tally, stats: { wins: 4, losses: 1, draws: 1 } },
    });
    expect(s.run).toEqual({ phase: "idle" });
    expect(s.summary).toEqual({ kind, total: 10, done, tally });
    expect(s.announcement).toBe(text);
    expect(s.stats).toEqual({ wins: 4, losses: 1, draws: 1 });
    if (kind === "aborted") expect(s.storage).toMatchObject({ phase: "unavailable", cause: "write" });
    else expect(s.storage).toEqual({ phase: "ready" });
  });
  it("실행 중이 아닐 때 RUN_FINISHED는 무시된다", () => {
    const s = ready();
    expect(sessionReducer(s, { type: "RUN_FINISHED", result: { kind: "completed", total: 1, done: 1, tally: Z } })).toBe(s);
  });
  it("실행 중 가드: 모드 전환·설정 변경·초기화 요청·재시도는 상태를 바꾸지 않는다(FR2-009)", () => {
    const s = animating();
    expect(sessionReducer(s, { type: "MODE_SET", mode: "manual" })).toBe(s);
    expect(sessionReducer(s, { type: "SETTINGS_SET", patch: { count: 1000 } })).toBe(s);
    expect(sessionReducer(s, { type: "RESET_REQUESTED" })).toBe(s);
    expect(sessionReducer(s, { type: "RETRY_STARTED" })).toBe(s);
  });
  it("실행 중에 도착한 수동 COMMITTED도 수용한다(G-11)", () => {
    const s = reduce(animating(), { type: "COMMITTED", round: round(), stats: { wins: 1, losses: 0, draws: 0 } });
    expect(s.stats?.wins).toBe(1);
  });
});

describe("초기화", () => {
  it("요청 → 취소는 데이터 불변(AC2-060)", () => {
    const s0 = reduce(ready({ wins: 2, losses: 0, draws: 0 }), { type: "COMMITTED", round: round(), stats: { wins: 3, losses: 0, draws: 0 } });
    const s = reduce(s0, { type: "RESET_REQUESTED" }, { type: "RESET_CANCELLED" });
    expect(s).toEqual({ ...s0, reset: "idle" });
  });
  it("확인 중에는 확정 전까지 resetting이 아니고, resetting 중에는 새 대결 시작·모드·설정이 막힌다(AC2-061)", () => {
    const s = reduce(ready(), { type: "RESET_REQUESTED" }, { type: "RESET_CONFIRMED" });
    expect(s.reset).toBe("resetting");
    expect(sessionReducer(s, { type: "RUN_STARTED", settings: instant })).toBe(s);
    expect(sessionReducer(s, { type: "MODE_SET", mode: "auto" })).toBe(s);
    expect(sessionReducer(s, { type: "SETTINGS_SET", patch: { count: 10 } })).toBe(s);
    expect(sessionReducer(s, { type: "RETRY_STARTED" })).toBe(s); // G-6
  });
  it("RESET_CONFIRMED는 확인 중일 때만", () => {
    const s = ready();
    expect(sessionReducer(s, { type: "RESET_CONFIRMED" })).toBe(s);
  });
  it("RESET_SUCCEEDED: 전적·마지막 결과·요약을 함께 초기화하고 낭독, storage는 그대로", () => {
    const s0 = reduce(
      writeFailed(),
      { type: "RESET_REQUESTED" },
      { type: "RESET_CONFIRMED" },
    );
    const s = reduce(s0, { type: "RESET_SUCCEEDED" });
    expect(s).toMatchObject({ stats: Z, last: null, summary: null, reset: "idle", notice: null });
    expect(s.announcement).toBe("누적 전적과 대결 기록을 모두 초기화했어요.");
    expect(s.storage).toEqual(s0.storage);
  });
  it("RESET_FAILED: 데이터 불변, reset-failed 안내(AC2-043)", () => {
    const s0 = reduce(ready({ wins: 1, losses: 0, draws: 0 }), { type: "RESET_REQUESTED" }, { type: "RESET_CONFIRMED" });
    const s = reduce(s0, { type: "RESET_FAILED" });
    expect(s).toMatchObject({ reset: "idle", notice: "reset-failed", stats: { wins: 1 } });
  });
  it("재시도 중에는 초기화를 요청할 수 없다(G-6)", () => {
    const s = reduce(writeFailed(), { type: "RETRY_STARTED" });
    expect(sessionReducer(s, { type: "RESET_REQUESTED" })).toBe(s);
  });
  it("저장 불가 상태(재시도 중 아님)에서는 초기화를 요청할 수 있다(손상 탈출)", () => {
    expect(reduce(unavailableState(), { type: "RESET_REQUESTED" }).reset).toBe("confirming");
  });
});

describe("재시도와 복구", () => {
  it("RETRY_STARTED → 재시도 중 문장", () => {
    const s = reduce(writeFailed(), { type: "RETRY_STARTED" });
    expect(s.storage).toMatchObject({ retry: "retrying" });
    expect(s.announcement).toBe("저장소를 다시 확인하는 중이에요");
  });
  it("재시도 중 중복 시작은 무시, ready 상태에서는 시작 불가", () => {
    const s = reduce(writeFailed(), { type: "RETRY_STARTED" });
    expect(sessionReducer(s, { type: "RETRY_STARTED" })).toBe(s);
    const r = ready();
    expect(sessionReducer(r, { type: "RETRY_STARTED" })).toBe(r);
  });
  it("RETRY_SUCCEEDED: ready, 저장소 통계, 연습 결과 제거, recovered 안내", () => {
    const s = reduce(writeFailed(), { type: "RETRY_STARTED" }, { type: "RETRY_SUCCEEDED", stats: { wins: 5, losses: 0, draws: 0 } });
    expect(s).toMatchObject({ storage: { phase: "ready" }, stats: { wins: 5 }, last: null, notice: "recovered" });
    expect(s.announcement).toBe(announce.RECOVERED_TEXT);
  });
  it("RETRY_SUCCEEDED는 저장된 last는 유지한다", () => {
    const base = reduce(ready(), { type: "COMMITTED", round: round(), stats: { wins: 1, losses: 0, draws: 0 } });
    const unavail = { ...base, storage: { phase: "unavailable", cause: "write", retry: "retrying" } } as SessionState;
    expect(sessionReducer(unavail, { type: "RETRY_SUCCEEDED", stats: Z }).last).not.toBeNull();
  });
  it("RETRY_FAILED: 상태 유지, retry=failed, 다시 시도 가능", () => {
    const s = reduce(writeFailed(), { type: "RETRY_STARTED" }, { type: "RETRY_FAILED" });
    expect(s.storage).toMatchObject({ phase: "unavailable", retry: "failed" });
    expect(reduce(s, { type: "RETRY_STARTED" }).storage).toMatchObject({ retry: "retrying" });
  });
  it("RETRY_SUCCEEDED/FAILED는 재시도 중이 아니면 무시된다", () => {
    const s = writeFailed();
    expect(sessionReducer(s, { type: "RETRY_SUCCEEDED", stats: Z })).toBe(s);
    expect(sessionReducer(s, { type: "RETRY_FAILED" })).toBe(s);
  });
});

describe("복구됨 안내 해제 규칙", () => {
  const recovered = () =>
    reduce(writeFailed(), { type: "RETRY_STARTED" }, { type: "RETRY_SUCCEEDED", stats: Z });
  it("다음 확정 대결(COMMITTED)에서 해제", () => {
    expect(reduce(recovered(), { type: "COMMITTED", round: round(), stats: Z }).notice).toBeNull();
  });
  it("자동 실행의 첫 진행에서 해제", () => {
    const s = reduce(recovered(), { type: "RUN_STARTED", settings: animated }, { type: "RUN_PROGRESS", done: 1, last: round(), stats: Z });
    expect(s.notice).toBeNull();
  });
  it("초기화 성공에서 해제", () => {
    const s = reduce(recovered(), { type: "RESET_REQUESTED" }, { type: "RESET_CONFIRMED" }, { type: "RESET_SUCCEEDED" });
    expect(s.notice).toBeNull();
  });
  it("모드 전환·설정 변경으로는 해제되지 않는다", () => {
    const s = reduce(recovered(), { type: "MODE_SET", mode: "auto" }, { type: "SETTINGS_SET", patch: { count: 1000 } });
    expect(s.notice).toBe("recovered");
    expect(s.mode).toBe("auto");
    expect(s.settings.count).toBe(1000);
  });
  it("초기화 취소·실패로는 recovered가 해제되지 않는다", () => {
    const s = reduce(recovered(), { type: "RESET_REQUESTED" }, { type: "RESET_CANCELLED" });
    expect(s.notice).toBe("recovered");
  });
});

describe("모드·설정", () => {
  it("idle에서는 변경된다", () => {
    const s = reduce(ready(), { type: "MODE_SET", mode: "auto" }, { type: "SETTINGS_SET", patch: { pick: "fixed", hand: "paper" } });
    expect(s.mode).toBe("auto");
    expect(s.settings).toMatchObject({ pick: "fixed", hand: "paper" });
  });
  it("모드 전환은 전적·last·낭독을 바꾸지 않는다", () => {
    const s0 = reduce(ready(), { type: "COMMITTED", round: round(), stats: { wins: 1, losses: 0, draws: 0 } });
    const s = reduce(s0, { type: "MODE_SET", mode: "auto" });
    expect({ ...s, mode: "manual" }).toEqual(s0);
  });
});

describe("불변: 전적이 바뀌는 경로", () => {
  it("전적은 LOADED/RETRY_SUCCEEDED/COMMITTED/RUN_PROGRESS/RUN_FINISHED(stats)/RESET_SUCCEEDED 외에는 바뀌지 않는다", () => {
    const s0 = reduce(ready({ wins: 4, losses: 4, draws: 4 }), { type: "RESET_REQUESTED" });
    const noStatChange: SessionAction[] = [
      { type: "PRACTICED", round: round() },
      { type: "SAVE_FAILED", round: round() },
      { type: "RUN_STOP_REQUESTED" },
      { type: "RESET_CANCELLED" },
      { type: "RESET_FAILED" },
      { type: "RETRY_FAILED" },
      { type: "MODE_SET", mode: "auto" },
      { type: "SETTINGS_SET", patch: { count: 10 } },
    ];
    for (const a of noStatChange) expect(sessionReducer(s0, a).stats).toEqual({ wins: 4, losses: 4, draws: 4 });
  });
});
