import { createIdbBattleStore } from "./idb-battle-store";
import { createQueuedStore } from "./save-queue";
import type { QueuedBattleStore } from "./battle-store";

let instance: QueuedBattleStore | null = null;

/**
 * 앱 수준 단일 QueuedBattleStore. 큐·실패 게이트·연결을 소유하며 페이지 컴포넌트는 참조만 한다.
 * indexedDB가 없는 환경(SSR, 일부 시크릿 모드)에서도 만들 때 예외를 던지지 않고,
 * 각 호출이 StoreError("unavailable")로 거절된다.
 */
export function getBrowserBattleStore(): QueuedBattleStore {
  instance ??= createQueuedStore(createIdbBattleStore());
  return instance;
}

/** 테스트 전용: 싱글턴을 버린다. */
export function resetBrowserBattleStoreForTests(): void {
  instance = null;
}
