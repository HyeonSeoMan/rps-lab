import type { Score } from "./game-state";
import { isBattleDraft, isBattleRecord, isScore, type BattleDraft, type BattleRecord } from "./battle";
import { judge } from "./rps";
import { StoreError, type ReopenableStore } from "./battle-store";

export const DB_NAME = "rps-lab";
export const DB_VERSION = 1;
const BATTLES = "battles";
const META = "meta";
const STATS_KEY = "stats";
const PROBE_KEY = "probe";
const ZERO: Score = { wins: 0, losses: 0, draws: 0 };
const BUCKET = { win: "wins", lose: "losses", draw: "draws" } as const;

/** 번호순 단계 함수. 한 번 배포된 단계는 수정하지 않고 새 단계를 추가한다. */
const MIGRATIONS: Array<(db: IDBDatabase) => void> = [
  (db) => {
    db.createObjectStore(BATTLES, { keyPath: "seq" });
    db.createObjectStore(META);
  },
];

function upgrade(db: IDBDatabase, oldVersion: number, newVersion: number) {
  for (let v = oldVersion + 1; v <= newVersion; v++) MIGRATIONS[v - 1](db);
}

type Conn = { promise: Promise<IDBDatabase>; verified: Promise<void> | null };

/**
 * IndexedDB 구현. factory는 테스트에서 fake-indexeddb의 IDBFactory를 주입하기 위한 것이다.
 * 연결 관리: 트랜잭션 오류는 연결을 무효화하지 않는다. versionchange/close/InvalidStateError/open 실패만
 * 연결을 무효화하며, 무효화는 캐시 참조가 해당 연결과 같을 때만 비운다(세대 번호 없음, G-7).
 */
export function createIdbBattleStore(getFactory: () => IDBFactory | undefined = () => globalThis.indexedDB): ReopenableStore {
  let cached: Conn | null = null;

  function invalidate(conn: Conn) {
    if (cached === conn) cached = null;
  }

  function connect(): Conn {
    if (cached) return cached;
    const conn: Conn = { promise: null as unknown as Promise<IDBDatabase>, verified: null };
    conn.promise = new Promise<IDBDatabase>((resolve, reject) => {
      const factory = getFactory();
      if (!factory) return reject(new StoreError("unavailable", "indexedDB is not available"));
      let req: IDBOpenDBRequest;
      try {
        req = factory.open(DB_NAME, DB_VERSION);
      } catch (cause) {
        return reject(new StoreError("unavailable", undefined, { cause }));
      }
      req.onupgradeneeded = (e) => {
        try {
          upgrade(req.result, e.oldVersion, DB_VERSION);
        } catch (cause) {
          req.transaction?.abort();
          reject(new StoreError("unavailable", undefined, { cause }));
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          invalidate(conn);
          db.close();
        };
        db.onclose = () => invalidate(conn);
        resolve(db);
      };
      req.onerror = () => {
        const name = req.error?.name;
        reject(new StoreError(name === "VersionError" ? "version" : "unavailable", undefined, { cause: req.error }));
      };
    });
    conn.promise.catch(() => invalidate(conn)); // 실패한 연결은 캐시하지 않는다
    cached = conn;
    return conn;
  }

  /** 트랜잭션을 열고 완료(커밋)까지 기다린다. fn은 트랜잭션 안에서 요청을 발행하고 결과 getter를 돌려준다. */
  async function transact<T>(
    mode: IDBTransactionMode,
    stores: string[],
    kind: "read" | "write",
    fn: (tx: IDBTransaction, fail: (e: unknown) => void) => () => T,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const conn = connect();
      const db = await conn.promise;
      let tx: IDBTransaction;
      try {
        tx = db.transaction(stores, mode);
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "InvalidStateError") {
          invalidate(conn);
          if (attempt === 0) continue; // 새 연결로 한 번만 다시 시도(트랜잭션은 시작되지 않았음)
        }
        throw new StoreError(kind, undefined, { cause });
      }
      return new Promise<T>((resolve, reject) => {
        let failure: unknown;
        let getter: (() => T) | undefined;
        const fail = (e: unknown) => {
          failure ??= e;
          try {
            tx.abort();
          } catch {
            /* 이미 종료됨 */
          }
        };
        tx.oncomplete = () => {
          try {
            resolve(getter!());
          } catch (e) {
            reject(e instanceof StoreError ? e : new StoreError(kind, undefined, { cause: e }));
          }
        };
        tx.onabort = () => {
          const cause = failure ?? tx.error;
          reject(cause instanceof StoreError ? cause : new StoreError(kind, undefined, { cause }));
        };
        tx.onerror = () => {}; // abort 이벤트로 처리
        try {
          getter = fn(tx, fail);
        } catch (e) {
          fail(e);
        }
      });
    }
  }

  function reqValue<T>(req: IDBRequest<T>, fail: (e: unknown) => void, onOk: (v: T) => void) {
    req.onsuccess = () => {
      try {
        onOk(req.result);
      } catch (e) {
        fail(e);
      }
    };
  }

  /** 연결당 첫 호출에서 불변식 1을 검증하고, 어긋나면 기록 스캔으로 meta.stats를 다시 쓴다. 이후에는 다시 검증하지 않는다. */
  function ensureVerified(): Promise<void> {
    const conn = connect();
    if (!conn.verified) {
      const p = (async () => {
        const read = await transact("readonly", [BATTLES, META], "read", (tx, fail) => {
          let stats: unknown;
          let count = 0;
          reqValue(tx.objectStore(META).get(STATS_KEY), fail, (v) => (stats = v));
          reqValue(tx.objectStore(BATTLES).count(), fail, (v) => (count = v));
          return () => ({ stats, count });
        });
        if (read.stats === undefined && read.count === 0) return;
        if (isScore(read.stats) && read.stats.wins + read.stats.losses + read.stats.draws === read.count) return;
        await recomputeStats();
      })();
      conn.verified = p;
      p.catch(() => {
        if (conn.verified === p) conn.verified = null;
      });
    }
    return conn.verified;
  }

  async function readStats(): Promise<Score> {
    return transact("readonly", [META], "read", (tx, fail) => {
      let stats: unknown;
      reqValue(tx.objectStore(META).get(STATS_KEY), fail, (v) => (stats = v));
      return () => {
        if (stats === undefined) return { ...ZERO };
        if (!isScore(stats)) throw new StoreError("corrupt", "invalid stats");
        return { ...stats };
      };
    });
  }

  function recomputeStats(): Promise<Score> {
    return transact("readwrite", [BATTLES, META], "read", (tx, fail) => {
      const score = { ...ZERO };
      const cursorReq = tx.objectStore(BATTLES).openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) {
          tx.objectStore(META).put({ ...score }, STATS_KEY);
          return;
        }
        if (!isBattleRecord(cursor.value)) return fail(new StoreError("corrupt", "corrupt battle record"));
        const { user, computer } = cursor.value;
        const o = BUCKET[judge(user, computer)];
        score[o]++;
        cursor.continue();
      };
      cursorReq.onerror = () => fail(cursorReq.error);
      return () => score;
    });
  }

  return {
    async loadStats() {
      await ensureVerified();
      return readStats();
    },

    async recordBattles(items: BattleDraft[]): Promise<Score> {
      if (!items.every(isBattleDraft)) throw new StoreError("write", "invalid battle draft");
      await ensureVerified(); // 카운터가 어긋난 채 증분하지 않도록(자가 복구 후 진행)
      return transact("readwrite", [BATTLES, META], "write", (tx, fail) => {
        const battles = tx.objectStore(BATTLES);
        const meta = tx.objectStore(META);
        let next: Score = { ...ZERO };
        reqValue(meta.get(STATS_KEY), fail, (stored) => {
          // 빈 저장소는 카운터가 아직 없다(검증이 이미 끝났으므로 undefined는 0건을 뜻한다).
          if (stored !== undefined && !isScore(stored)) return fail(new StoreError("corrupt", "invalid stats"));
          const lastReq = battles.openCursor(null, "prev");
          reqValue(lastReq, fail, (cursor) => {
            let seq = cursor ? (cursor.key as number) : 0;
            next = stored === undefined ? { ...ZERO } : { ...(stored as Score) };
            for (const item of items) {
              battles.add({ seq: ++seq, user: item.user, computer: item.computer, at: item.at });
              const k = BUCKET[judge(item.user, item.computer)];
              next[k]++;
            }
            meta.put({ ...next }, STATS_KEY);
          });
        });
        return () => next;
      });
    },

    async listBattles(q) {
      const { before, limit } = q;
      return transact("readonly", [BATTLES], "read", (tx, fail) => {
        const items: BattleRecord[] = [];
        let first = true;
        const req = tx.objectStore(BATTLES).openCursor(null, "prev");
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) return;
          // seq < before 로 시작한다. 역방향 continue(key)는 key 이하의 다음 레코드로 건너뛴다(IDBKeyRange 불필요).
          if (first) {
            first = false;
            if (before !== undefined && (cursor.key as number) >= before) return void cursor.continue(before - 1);
          }
          if (!isBattleRecord(cursor.value)) return fail(new StoreError("corrupt", "corrupt battle record"));
          items.push(cursor.value);
          if (items.length <= limit) cursor.continue(); // limit+1건까지만 읽는다
        };
        req.onerror = () => fail(req.error);
        return () => ({ items: items.slice(0, limit), hasMore: items.length > limit });
      });
    },

    async clearAll() {
      await transact("readwrite", [BATTLES, META], "write", (tx) => {
        tx.objectStore(BATTLES).clear();
        tx.objectStore(META).put({ ...ZERO }, STATS_KEY);
        return () => undefined;
      });
      const conn = cached;
      if (conn) conn.verified = Promise.resolve();
    },

    async probeWrite() {
      await transact("readwrite", [META], "write", (tx) => {
        const meta = tx.objectStore(META);
        meta.put(Date.now(), PROBE_KEY);
        meta.delete(PROBE_KEY);
        return () => undefined;
      });
    },

    /** recover()에서만 호출: 현재 연결을 닫고 다음 요청에서 새로 열며 검증도 다시 한다. */
    reopen() {
      const conn = cached;
      cached = null;
      conn?.promise.then((db) => db.close()).catch(() => {});
    },
  };
}
