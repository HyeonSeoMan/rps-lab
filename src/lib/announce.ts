import { outcomeOf } from "./battle";
import type { Score } from "./game-state";
import type { Choice, Outcome } from "./rps";

export const CHOICE_LABEL: Record<Choice, string> = { scissors: "가위", rock: "바위", paper: "보" };
export const OUTCOME_LABEL: Record<Outcome, string> = { win: "승리!", lose: "패배", draw: "무승부" };

export const PRACTICE_TAG = " (저장되지 않음 · 연습 대결)";
export const RETRYING_TEXT = "저장소를 다시 확인하는 중이에요";
export const RECOVERED_TEXT = "저장이 복구되었어요. 지금부터 대결이 기록돼요. 복구 전의 연습 대결은 저장되지 않아요.";
export const RETRY_FAILED_ALERT = "저장을 다시 시도했지만 실패했어요. 연습 대결은 계속할 수 있어요.";
export const RESET_DONE_TEXT = "누적 전적과 대결 기록을 모두 초기화했어요.";
export const READ_FAILED_CARD_TEXT = "승/패/무 기록을 불러오지 못했어요";

/** 수동 대결 문장(v1 형식). 저장되지 않은 결과는 꼬리표를 붙인다. */
export function manualResult(round: { user: Choice; computer: Choice }, saved: boolean): string {
  const text = `나: ${CHOICE_LABEL[round.user]} · 컴퓨터: ${CHOICE_LABEL[round.computer]} — ${OUTCOME_LABEL[outcomeOf(round)]}`;
  return saved ? text : text + PRACTICE_TAG;
}

/** 1번: 애니메이션 시작 */
export const runStarted = (total: number) => `자동 대결 ${total}회를 시작했어요.`;
/** 2번: 즉시 결과 처리·저장 중 */
export const runSaving = (total: number) => `자동 대결 ${total}회를 처리하고 저장하고 있어요.`;
/** 3번: 중지 */
export const runStopped = (total: number, done: number, t: Score) =>
  `자동 대결을 중지했어요. ${total}회 중 ${done}회가 저장됐어요. 승 ${t.wins}회, 패 ${t.losses}회, 무 ${t.draws}회.`;
/** 4번: 완료 */
export const runCompleted = (total: number, t: Score) =>
  `자동 대결 ${total}회를 완료했어요. 승 ${t.wins}회, 패 ${t.losses}회, 무 ${t.draws}회.`;
/** 5번: 저장 실패로 중단 */
export const runAborted = (done: number) => `저장에 실패해 자동 대결이 중단됐어요. ${done}회까지 저장됐어요.`;

export type RunSummaryLike = { kind: "completed" | "stopped" | "aborted"; total: number; done: number; tally: Score };

/** 시각 요약 박스와 같은 입력에서 낭독 문장을 만든다(의미·수치 일치). */
export function runSummary(s: RunSummaryLike): string {
  switch (s.kind) {
    case "completed":
      return runCompleted(s.total, s.tally);
    case "stopped":
      return runStopped(s.total, s.done, s.tally);
    case "aborted":
      return runAborted(s.done);
  }
}
