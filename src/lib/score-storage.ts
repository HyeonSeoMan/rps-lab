import type { Score } from "./game-state";

export const STORAGE_KEY = "rps-lab:score";

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

export type LoadResult = {
  score: Score;
  /** false면 이번 세션에서는 저장하지 않는다(유효한 기존 데이터 덮어쓰기 방지). */
  writable: boolean;
};

function emptyScore(): Score {
  return { wins: 0, losses: 0, draws: 0 };
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** 저장 문자열을 검증해 Score로 변환한다. 유효하지 않으면 null. */
export function parseScore(raw: string | null): Score | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const { wins, losses, draws } = parsed as Record<string, unknown>;
  if (!isCount(wins) || !isCount(losses) || !isCount(draws)) return null;
  return { wins, losses, draws };
}

export function loadScore(storage: StorageLike | null): LoadResult {
  if (storage === null) return { score: emptyScore(), writable: false };
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { score: emptyScore(), writable: false };
  }
  return { score: parseScore(raw) ?? emptyScore(), writable: true };
}

export function saveScore(storage: StorageLike, score: Score): void {
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ wins: score.wins, losses: score.losses, draws: score.draws }),
    );
  } catch {
    // 저장 실패는 게임 진행에 영향을 주지 않는다.
  }
}

/** window.localStorage 접근 자체가 예외를 던지는 환경에서는 null. */
export function getBrowserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
