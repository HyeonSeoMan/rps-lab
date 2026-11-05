import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getBrowserStorage,
  loadScore,
  parseScore,
  saveScore,
  STORAGE_KEY,
  type StorageLike,
} from "./score-storage";

const EMPTY = { wins: 0, losses: 0, draws: 0 };

function fakeStorage(initial?: string | null): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  if (initial != null) data.set(STORAGE_KEY, initial);
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

describe("parseScore", () => {
  it("AC-017: 유효한 값을 채택한다", () => {
    expect(parseScore('{"wins":5,"losses":3,"draws":2}')).toEqual({
      wins: 5,
      losses: 3,
      draws: 2,
    });
  });

  it("AC-017: 0 값과 추가 키는 허용(추가 키는 무시)한다", () => {
    expect(parseScore('{"wins":0,"losses":0,"draws":0,"extra":"x"}')).toEqual(EMPTY);
  });

  it.each([
    ["null 입력", null],
    ["잘못된 JSON", "abc"],
    ["빈 문자열", ""],
    ["JSON null", "null"],
    ["JSON 숫자", "5"],
    ["JSON 배열", "[1,2,3]"],
    ["키 누락", '{"wins":1,"losses":2}'],
    ["음수", '{"wins":-1,"losses":0,"draws":0}'],
    ["소수", '{"wins":1.5,"losses":0,"draws":0}'],
    ["문자열 값", '{"wins":"1","losses":0,"draws":0}'],
    ["null 값", '{"wins":null,"losses":0,"draws":0}'],
    ["안전한 정수 범위 초과", '{"wins":9007199254740993,"losses":0,"draws":0}'],
  ])("AC-020: 유효하지 않은 값은 null — %s", (_label, raw) => {
    expect(parseScore(raw)).toBeNull();
  });
});

describe("loadScore", () => {
  it("AC-021: 저장소가 없으면 0/0/0이고 writable=false", () => {
    expect(loadScore(null)).toEqual({ score: EMPTY, writable: false });
  });

  it("AC-020: getItem이 예외를 던지면 0/0/0이고 writable=false", () => {
    const storage: StorageLike = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {},
    };
    expect(loadScore(storage)).toEqual({ score: EMPTY, writable: false });
  });

  it("AC-005: 키가 없으면 0/0/0이고 writable=true", () => {
    expect(loadScore(fakeStorage())).toEqual({ score: EMPTY, writable: true });
  });

  it("AC-020: 손상된 값이면 0/0/0이고 writable=true", () => {
    expect(loadScore(fakeStorage("abc"))).toEqual({ score: EMPTY, writable: true });
    expect(loadScore(fakeStorage('{"wins":-1,"losses":0,"draws":0}'))).toEqual({
      score: EMPTY,
      writable: true,
    });
  });

  it("AC-017: 유효한 값이면 그 값과 writable=true", () => {
    const result = loadScore(fakeStorage('{"wins":5,"losses":3,"draws":2}'));
    expect(result).toEqual({ score: { wins: 5, losses: 3, draws: 2 }, writable: true });
  });
});

describe("saveScore", () => {
  it("저장 키와 JSON 형식을 지킨다", () => {
    const storage = fakeStorage();
    saveScore(storage, { wins: 1, losses: 2, draws: 3 });
    expect(STORAGE_KEY).toBe("rps-lab:score");
    expect(JSON.parse(storage.data.get("rps-lab:score") as string)).toEqual({
      wins: 1,
      losses: 2,
      draws: 3,
    });
  });

  it("AC-021: setItem이 예외를 던져도 밖으로 전파하지 않는다", () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(() => saveScore(storage, EMPTY)).not.toThrow();
  });

  it("저장한 값은 loadScore로 그대로 복원된다", () => {
    const storage = fakeStorage();
    saveScore(storage, { wins: 9, losses: 8, draws: 7 });
    expect(loadScore(storage).score).toEqual({ wins: 9, losses: 8, draws: 7 });
  });
});

describe("getBrowserStorage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("정상이면 window.localStorage를 반환한다", () => {
    expect(getBrowserStorage()).toBe(window.localStorage);
  });

  it("AC-021: window.localStorage 접근이 예외를 던지면 null", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(getBrowserStorage()).toBeNull();
  });
});
