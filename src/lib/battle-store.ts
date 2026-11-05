import type { Score } from "./game-state";
import type { BattleDraft, BattleRecord } from "./battle";

export type StoreErrorKind =
  | "unavailable"
  | "read"
  | "write"
  | "corrupt"
  | "version"
  /** 실패 게이트가 닫혀 저장을 시도하지 않음(저장소 상태 오류가 아님) */
  | "skipped";

export class StoreError extends Error {
  readonly kind: StoreErrorKind;
  constructor(kind: StoreErrorKind, message?: string, options?: { cause?: unknown }) {
    super(message ?? `store error: ${kind}`, options);
    this.name = "StoreError";
    this.kind = kind;
  }
}

export function toStoreError(error: unknown, fallback: StoreErrorKind = "write"): StoreError {
  return error instanceof StoreError ? error : new StoreError(fallback, undefined, { cause: error });
}

export interface BattleStore {
  loadStats(): Promise<Score>;
  /** 커밋 후 resolve. 갱신된 통계 반환. 전부 저장되거나 전혀 저장되지 않는다. */
  recordBattles(items: BattleDraft[]): Promise<Score>;
  listBattles(q: { before?: number; limit: number }): Promise<{ items: BattleRecord[]; hasMore: boolean }>;
  clearAll(): Promise<void>;
  probeWrite(): Promise<void>;
}

/** 저장소 구현이 연결을 소유하는 경우 recover()가 연결을 새로 열도록 요청하는 선택적 훅. */
export interface ReopenableStore extends BattleStore {
  reopen?(): void;
}

export type GateState = { closed: false } | { closed: true; cause: "read" | "write" };

/** FIFO 저장 큐 + 실패 게이트 + 복구를 더한 앱 수준 저장소. */
export interface QueuedBattleStore extends BattleStore {
  whenIdle(): Promise<void>;
  gate(): GateState;
  closeGate(cause: "read" | "write"): void;
  recover(): Promise<Score>;
}
