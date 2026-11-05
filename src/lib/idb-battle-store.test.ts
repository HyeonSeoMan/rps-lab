import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createIdbBattleStore, DB_NAME } from "./idb-battle-store";
import { describeStoreContract, draft } from "@/test-utils/store-contract";

const fresh = () => new IDBFactory();
const open = (f: IDBFactory) => createIdbBattleStore(() => f);

/** 저장소 내용을 직접 심거나 읽기 위한 저수준 도우미 */
function rawDb(f: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = f.open(DB_NAME);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function rawPut(f: IDBFactory, storeName: string, value: unknown, key?: string) {
  const db = await rawDb(f);
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(storeName, "readwrite");
    if (key === undefined) tx.objectStore(storeName).put(value);
    else tx.objectStore(storeName).put(value, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}
async function rawGet(f: IDBFactory, storeName: string, key: IDBValidKey) {
  const db = await rawDb(f);
  const v = await new Promise<unknown>((res, rej) => {
    const r = db.transaction(storeName).objectStore(storeName).get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  db.close();
  return v;
}
async function rawCount(f: IDBFactory) {
  const db = await rawDb(f);
  const n = await new Promise<number>((res) => {
    const r = db.transaction("battles").objectStore("battles").count();
    r.onsuccess = () => res(r.result);
  });
  db.close();
  return n;
}

afterEach(() => vi.restoreAllMocks());

describeStoreContract("IndexedDB 어댑터(fake-indexeddb)", () => open(fresh()));

describe("IndexedDB 어댑터 — 원자성", () => {
  it("묶음 저장 중 add 예외가 나면 전부 저장되지 않고 카운터도 그대로다", async () => {
    const f = fresh();
    const s = open(f);
    await s.recordBattles([draft("rock", "scissors")]);
    const real = IDBObjectStore.prototype.add;
    let calls = 0;
    vi.spyOn(IDBObjectStore.prototype, "add").mockImplementation(function (this: IDBObjectStore, ...a) {
      if (++calls === 3) throw new DOMException("boom", "ConstraintError");
      return real.apply(this, a as Parameters<typeof real>);
    });
    await expect(
      s.recordBattles([draft("rock", "paper"), draft("rock", "paper"), draft("rock", "paper"), draft("rock", "paper")]),
    ).rejects.toMatchObject({ kind: "write" });
    vi.restoreAllMocks();
    expect(await rawCount(f)).toBe(1);
    expect(await s.loadStats()).toEqual({ wins: 1, losses: 0, draws: 0 });
    // 같은 연결이 계속 사용 가능(트랜잭션 오류는 연결을 무효화하지 않음)
    await s.recordBattles([draft("rock", "paper")]);
    expect((await s.listBattles({ limit: 10 })).items.map((r) => r.seq)).toEqual([2, 1]);
  });

  it("clearAll 중 meta 쓰기 예외가 나면 battles도 그대로다", async () => {
    const f = fresh();
    const s = open(f);
    await s.recordBattles([draft("rock", "paper"), draft("rock", "paper")]);
    const real = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, ...a) {
      if (this.name === "meta") throw new DOMException("boom", "QuotaExceededError");
      return real.apply(this, a as Parameters<typeof real>);
    });
    await expect(s.clearAll()).rejects.toMatchObject({ kind: "write" });
    vi.restoreAllMocks();
    expect(await rawCount(f)).toBe(2);
    expect(await s.loadStats()).toEqual({ wins: 0, losses: 2, draws: 0 });
  });

  it("listBattles는 limit+1건까지만 읽는다(건수와 무관)", async () => {
    const f = fresh();
    const s = open(f);
    await s.recordBattles(Array.from({ length: 300 }, () => draft("rock", "rock")));
    vi.spyOn(IDBObjectStore.prototype, "openCursor");
    const p = await s.listBattles({ limit: 20 });
    expect(p.items).toHaveLength(20);
    expect(IDBObjectStore.prototype.openCursor).toHaveBeenCalledTimes(1);
  });
});

describe("IndexedDB 어댑터 — 자가 복구와 손상", () => {
  it("카운터가 틀리면 첫 loadStats가 기록 스캔으로 바로잡는다", async () => {
    const f = fresh();
    await open(f).recordBattles([draft("rock", "scissors"), draft("rock", "paper")]);
    await rawPut(f, "meta", { wins: 9, losses: 9, draws: 9 }, "stats");
    const s = open(f); // 새 연결
    expect(await s.loadStats()).toEqual({ wins: 1, losses: 1, draws: 0 });
    expect(await rawGet(f, "meta", "stats")).toEqual({ wins: 1, losses: 1, draws: 0 });
  });

  it("카운터가 없거나 형식이 틀려도 복구된다", async () => {
    const f = fresh();
    await open(f).recordBattles([draft("paper", "paper")]);
    await rawPut(f, "meta", "garbage", "stats");
    expect(await open(f).loadStats()).toEqual({ wins: 0, losses: 0, draws: 1 });
  });

  it("복구 후 쓰기는 정확한 증분을 한다", async () => {
    const f = fresh();
    await open(f).recordBattles([draft("rock", "scissors")]);
    await rawPut(f, "meta", { wins: 0, losses: 0, draws: 0 }, "stats");
    const s = open(f);
    expect(await s.recordBattles([draft("rock", "scissors")])).toEqual({ wins: 2, losses: 0, draws: 0 });
  });

  it("손상된 레코드는 corrupt, 하지만 clearAll로 탈출할 수 있다", async () => {
    const f = fresh();
    await open(f).recordBattles([draft("rock", "scissors")]);
    await rawPut(f, "battles", { seq: 2, user: "???", computer: "rock", at: 1 });
    await rawPut(f, "meta", { wins: 0, losses: 0, draws: 0 }, "stats");
    const s = open(f);
    await expect(s.loadStats()).rejects.toMatchObject({ kind: "corrupt" });
    await expect(s.listBattles({ limit: 20 })).rejects.toMatchObject({ kind: "corrupt" });
    await s.clearAll();
    expect(await s.loadStats()).toEqual({ wins: 0, losses: 0, draws: 0 });
    await s.recordBattles([draft("rock", "rock")]);
    expect((await s.listBattles({ limit: 20 })).items.map((r) => r.seq)).toEqual([1]);
  });
});

describe("IndexedDB 어댑터 — 사용 불가·버전", () => {
  it("indexedDB가 없으면 unavailable로 거절하고 예외로 죽지 않는다", async () => {
    const s = createIdbBattleStore(() => undefined);
    await expect(s.loadStats()).rejects.toMatchObject({ kind: "unavailable" });
    await expect(s.recordBattles([draft("rock", "rock")])).rejects.toMatchObject({ kind: "unavailable" });
    await expect(s.listBattles({ limit: 1 })).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("저장된 DB 버전이 더 높으면 version 오류이고 데이터를 건드리지 않는다", async () => {
    const f = fresh();
    await new Promise<void>((res) => {
      const r = f.open(DB_NAME, 5);
      r.onupgradeneeded = () => {
        r.result.createObjectStore("battles", { keyPath: "seq" });
        r.result.createObjectStore("meta");
      };
      r.onsuccess = () => (r.result.close(), res());
    });
    await expect(open(f).loadStats()).rejects.toMatchObject({ kind: "version" });
  });

  it("open 실패는 캐시되지 않아 다음 요청이 다시 연다", async () => {
    const f = fresh();
    let fail = true;
    const s = createIdbBattleStore(() => (fail ? undefined : f));
    await expect(s.loadStats()).rejects.toMatchObject({ kind: "unavailable" });
    fail = false;
    expect(await s.loadStats()).toEqual({ wins: 0, losses: 0, draws: 0 });
  });
});

describe("IndexedDB 어댑터 — 다중 연결과 연결 관리", () => {
  it("연결 2개가 번갈아 쓰면 seq 중복·유실이 없다", async () => {
    const f = fresh();
    const a = open(f);
    const b = open(f);
    await Promise.all([a.loadStats(), b.loadStats()]);
    for (let i = 0; i < 10; i++) {
      await Promise.all([a.recordBattles([draft("rock", "rock")]), b.recordBattles([draft("rock", "paper")])]);
    }
    const { items } = await a.listBattles({ limit: 100 });
    expect(items.map((r) => r.seq).sort((x, y) => x - y)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(await b.loadStats()).toEqual({ wins: 0, losses: 10, draws: 10 });
  });

  it("한 연결이 초기화하면 다른 연결의 쓰기는 seq=1부터 쌓인다", async () => {
    const f = fresh();
    const a = open(f);
    const b = open(f);
    await a.recordBattles([draft("rock", "rock"), draft("rock", "rock")]);
    await b.loadStats();
    await a.clearAll();
    await b.recordBattles([draft("rock", "paper")]);
    expect((await a.listBattles({ limit: 10 })).items.map((r) => r.seq)).toEqual([1]);
  });

  it("versionchange를 받으면 연결을 닫고 다음 요청이 새로 연결한다", async () => {
    const f = fresh();
    const s = open(f);
    await s.recordBattles([draft("rock", "rock")]);
    // 다른 탭이 버전을 올리는 상황
    await new Promise<void>((res) => {
      const r = f.open(DB_NAME, 2);
      r.onupgradeneeded = () => {};
      r.onsuccess = () => (r.result.close(), res());
    });
    // 코드 버전(1)이 저장 버전(2)보다 낮아졌으므로 새 연결은 version 오류 — 데이터는 건드리지 않았다.
    await expect(s.loadStats()).rejects.toMatchObject({ kind: "version" });
    expect(await rawCount(f)).toBe(1);
  });

  it("reopen()은 연결을 새로 열고 검증도 다시 한다", async () => {
    const f = fresh();
    const s = open(f);
    await s.recordBattles([draft("rock", "scissors")]);
    await rawPut(f, "meta", { wins: 7, losses: 7, draws: 7 }, "stats"); // 몰래 틀리게 만든다
    expect(await s.loadStats()).toEqual({ wins: 7, losses: 7, draws: 7 }); // 같은 연결: 재검증하지 않는다
    s.reopen?.();
    expect(await s.loadStats()).toEqual({ wins: 1, losses: 0, draws: 0 }); // 새 연결: 재검증으로 meta도 바로잡힘
    expect(await rawGet(f, "meta", "stats")).toEqual({ wins: 1, losses: 0, draws: 0 });
  });
});

