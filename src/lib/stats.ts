import type { Score } from "./game-state";

export const PAGE_SIZE = 20;

export function total(score: Score): number {
  return score.wins + score.losses + score.draws;
}

/** 승률(%). 0건이면 0. */
export function winRate(score: Score): number {
  const t = total(score);
  return t === 0 ? 0 : (score.wins / t) * 100;
}

/** 소수 첫째 자리까지 표시. 0건은 "0.0%". */
export function formatPercent(x: number): string {
  return `${x.toFixed(1)}%`;
}

/** 구간별 비율(0~1, 반올림하지 않음). 0건이면 모두 0. */
export function ratios(score: Score): { wins: number; losses: number; draws: number } {
  const t = total(score);
  if (t === 0) return { wins: 0, losses: 0, draws: 0 };
  return { wins: score.wins / t, losses: score.losses / t, draws: score.draws / t };
}

/** 0건이어도 1. */
export function pageCount(totalRecords: number, size: number = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(totalRecords / size));
}
