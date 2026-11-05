import { pickComputerChoice, type Choice } from "./rps";
import type { BattleDraft } from "./battle";

export type AutoSettings = {
  pick: "fixed" | "random";
  /** pick === "fixed"일 때만 의미가 있다. */
  hand: Choice;
  run: "instant" | "animated";
  count: 10 | 100 | 1000;
};

export const AUTO_COUNTS = [10, 100, 1000] as const;
export const DEFAULT_AUTO_SETTINGS: AutoSettings = { pick: "random", hand: "rock", run: "instant", count: 100 };

/** 애니메이션 실행의 틱 간격(ms). */
export const ANIMATION_TICK_MS = 70;
/** 즉시 실행의 한 묶음 크기. */
export const INSTANT_CHUNK = 100;

/** 한 묶음(저장 1회)에 담는 대결 수. 애니메이션은 틱당 max(1, N/100), 즉시는 100. */
export function chunkSize(settings: Pick<AutoSettings, "run" | "count">): number {
  return settings.run === "instant" ? INSTANT_CHUNK : Math.max(1, Math.floor(settings.count / 100));
}

/** 자동 대결 1건 생성. 난수 호출 순서는 사용자 → 컴퓨터로 고정(시드 재현 가능). */
export function draftBattle(settings: AutoSettings, random: () => number, now: () => number): BattleDraft {
  const user = settings.pick === "fixed" ? settings.hand : pickComputerChoice(random);
  const computer = pickComputerChoice(random);
  return { user, computer, at: now() };
}
