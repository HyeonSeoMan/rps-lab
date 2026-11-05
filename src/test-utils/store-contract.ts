// 테스트 전용: BattleStore 계약을 어떤 구현(메모리, IndexedDB)에도 같게 적용한다.
import { beforeEach, describe, expect, it } from "vitest";
import type { BattleStore } from "@/lib/battle-store";
import type { BattleDraft } from "@/lib/battle";

export const draft = (user: BattleDraft["user"], computer: BattleDraft["computer"], at = 1): BattleDraft => ({ user, computer, at });

export function describeStoreContract(name: string, create: () => Promise<BattleStore> | BattleStore) {
  describe(`${name} — BattleStore 계약`, () => {
    let store: BattleStore;
    beforeEach(async () => {
      store = await create();
    });

    it("비어 있으면 0/0/0", async () => {
      expect(await store.loadStats()).toEqual({ wins: 0, losses: 0, draws: 0 });
      expect(await store.listBattles({ limit: 20 })).toEqual({ items: [], hasMore: false });
    });

    it("recordBattles는 입력 순서대로 seq를 부여하고 갱신된 통계를 돌려준다", async () => {
      const s = await store.recordBattles([draft("rock", "scissors"), draft("rock", "paper"), draft("paper", "paper")]);
      expect(s).toEqual({ wins: 1, losses: 1, draws: 1 });
      const { items } = await store.listBattles({ limit: 20 });
      expect(items.map((r) => r.seq)).toEqual([3, 2, 1]); // 최신순
      expect(items.map((r) => r.user)).toEqual(["paper", "rock", "rock"]);
      expect(await store.loadStats()).toEqual(s);
    });

    it("통계 합 == 기록 수", async () => {
      for (let i = 0; i < 7; i++) await store.recordBattles([draft("rock", i % 2 ? "paper" : "scissors")]);
      const s = await store.loadStats();
      const { items } = await store.listBattles({ limit: 100 });
      expect(s.wins + s.losses + s.draws).toBe(items.length);
    });

    it("키셋 페이지네이션: 55건을 20건씩 순회해도 누락·중복이 없다", async () => {
      await store.recordBattles(Array.from({ length: 55 }, (_, i) => draft("rock", "paper", i)));
      const seen: number[] = [];
      let before: number | undefined;
      const sizes: number[] = [];
      for (;;) {
        const page = await store.listBattles({ before, limit: 20 });
        sizes.push(page.items.length);
        seen.push(...page.items.map((r) => r.seq));
        if (!page.hasMore) break;
        before = page.items[page.items.length - 1].seq;
      }
      expect(sizes).toEqual([20, 20, 15]);
      expect(seen).toEqual(Array.from({ length: 55 }, (_, i) => 55 - i));
    });

    it("정확히 limit건이면 hasMore는 false", async () => {
      await store.recordBattles(Array.from({ length: 20 }, () => draft("rock", "rock")));
      expect((await store.listBattles({ limit: 20 })).hasMore).toBe(false);
      await store.recordBattles([draft("rock", "rock")]);
      expect((await store.listBattles({ limit: 20 })).hasMore).toBe(true);
    });

    it("clearAll 후에는 0/0/0이고 seq는 1부터 다시 시작한다", async () => {
      await store.recordBattles([draft("rock", "paper"), draft("rock", "paper")]);
      await store.clearAll();
      expect(await store.loadStats()).toEqual({ wins: 0, losses: 0, draws: 0 });
      expect((await store.listBattles({ limit: 20 })).items).toEqual([]);
      await store.recordBattles([draft("rock", "paper")]);
      expect((await store.listBattles({ limit: 20 })).items.map((r) => r.seq)).toEqual([1]);
    });

    it("probeWrite는 성공한다", async () => {
      await expect(store.probeWrite()).resolves.toBeUndefined();
    });
  });
}
