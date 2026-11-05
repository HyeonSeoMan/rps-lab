import { CHOICES, judge, type Choice, type Outcome } from "./rps";
import type { Score } from "./game-state";

/** 확정 전 대결(저장 대상). 결과는 저장하지 않고 judge()로 항상 계산한다. at: epoch ms(표시용). */
export type BattleDraft = { user: Choice; computer: Choice; at: number };

/** 확정된 대결 = IndexedDB `battles`에 저장된 레코드. seq는 1부터 확정 순서. */
export type BattleRecord = BattleDraft & { seq: number };

export function isChoice(value: unknown): value is Choice {
  return typeof value === "string" && (CHOICES as readonly string[]).includes(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** 양의 안전한 정수 seq, 유효한 Choice 2개, 유한한 at. */
export function isBattleRecord(value: unknown): value is BattleRecord {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.seq === "number" &&
    Number.isSafeInteger(v.seq) &&
    v.seq > 0 &&
    isChoice(v.user) &&
    isChoice(v.computer) &&
    typeof v.at === "number" &&
    Number.isFinite(v.at)
  );
}

export function isBattleDraft(value: unknown): value is BattleDraft {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return isChoice(v.user) && isChoice(v.computer) && typeof v.at === "number" && Number.isFinite(v.at);
}

/** 세 값 모두 0 이상의 안전한 정수. */
export function isScore(value: unknown): value is Score {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return isNonNegativeSafeInteger(v.wins) && isNonNegativeSafeInteger(v.losses) && isNonNegativeSafeInteger(v.draws);
}

/** 기록의 결과는 저장하지 않고 항상 계산한다. */
export function outcomeOf(record: Pick<BattleDraft, "user" | "computer">): Outcome {
  return judge(record.user, record.computer);
}
