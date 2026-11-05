import { describe, expect, it } from "vitest";
import * as a from "./announce";

describe("announce — 승인된 문장 원문", () => {
  const t = { wins: 3, losses: 2, draws: 5 };
  it("자동 실행 문장 1~5", () => {
    expect(a.runStarted(100)).toBe("자동 대결 100회를 시작했어요.");
    expect(a.runSaving(1000)).toBe("자동 대결 1000회를 처리하고 저장하고 있어요.");
    expect(a.runStopped(100, 40, t)).toBe("자동 대결을 중지했어요. 100회 중 40회가 저장됐어요. 승 3회, 패 2회, 무 5회.");
    expect(a.runCompleted(10, t)).toBe("자동 대결 10회를 완료했어요. 승 3회, 패 2회, 무 5회.");
    expect(a.runAborted(30)).toBe("저장에 실패해 자동 대결이 중단됐어요. 30회까지 저장됐어요.");
  });
  it("초기화·재시도·복구 문장", () => {
    expect(a.RESET_DONE_TEXT).toBe("누적 전적과 대결 기록을 모두 초기화했어요.");
    expect(a.RETRYING_TEXT).toBe("저장소를 다시 확인하는 중이에요");
    expect(a.RETRY_FAILED_ALERT).toBe("저장을 다시 시도했지만 실패했어요. 연습 대결은 계속할 수 있어요.");
    expect(a.RECOVERED_TEXT).toBe("저장이 복구되었어요. 지금부터 대결이 기록돼요. 복구 전의 연습 대결은 저장되지 않아요.");
    expect(a.READ_FAILED_CARD_TEXT).toBe("승/패/무 기록을 불러오지 못했어요");
  });
  it("수동 결과는 v1 형식이며 연습은 꼬리표가 붙는다", () => {
    const r = { user: "rock", computer: "scissors" } as const;
    expect(a.manualResult(r, true)).toBe("나: 바위 · 컴퓨터: 가위 — 승리!");
    expect(a.manualResult(r, false)).toBe("나: 바위 · 컴퓨터: 가위 — 승리! (저장되지 않음 · 연습 대결)");
  });
  it("runSummary는 종류별로 같은 입력에서 의미·수치가 일치하는 문장을 만든다", () => {
    expect(a.runSummary({ kind: "completed", total: 10, done: 10, tally: t })).toBe(a.runCompleted(10, t));
    expect(a.runSummary({ kind: "stopped", total: 100, done: 40, tally: t })).toBe(a.runStopped(100, 40, t));
    expect(a.runSummary({ kind: "aborted", total: 100, done: 30, tally: t })).toBe(a.runAborted(30));
  });
});
