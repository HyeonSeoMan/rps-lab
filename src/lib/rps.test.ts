import { describe, expect, it } from "vitest";
import { CHOICES, judge, pickComputerChoice, type Choice, type Outcome } from "./rps";

describe("judge", () => {
  const table: [Choice, Choice, Outcome][] = [
    ["scissors", "scissors", "draw"],
    ["scissors", "rock", "lose"],
    ["scissors", "paper", "win"],
    ["rock", "scissors", "win"],
    ["rock", "rock", "draw"],
    ["rock", "paper", "lose"],
    ["paper", "scissors", "lose"],
    ["paper", "rock", "win"],
    ["paper", "paper", "draw"],
  ];

  it.each(table)(
    "AC-003: 사용자 %s vs 컴퓨터 %s → %s",
    (user, computer, expected) => {
      expect(judge(user, computer)).toBe(expected);
    },
  );

  it("AC-003: 9가지 조합을 모두 검증한다", () => {
    expect(table).toHaveLength(9);
    expect(new Set(table.map(([u, c]) => `${u}/${c}`)).size).toBe(9);
  });
});

describe("pickComputerChoice", () => {
  it.each([
    [0, "rock"],
    [0.34, "paper"],
    [0.67, "scissors"],
    [0.9999999, "scissors"],
    [1, "scissors"],
  ] as const)("AC-004: random()=%s → %s (경계값 매핑)", (value, expected) => {
    expect(pickComputerChoice(() => value)).toBe(expected);
  });

  it("AC-004: 시드 고정 의사난수 3,000회에서 세 값이 모두 등장한다", () => {
    // 테스트 전용 LCG (재현 가능한 난수열)
    let seed = 12345;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const seen = new Set<Choice>();
    for (let i = 0; i < 3000; i++) {
      seen.add(pickComputerChoice(random));
    }
    expect(seen).toEqual(new Set(["rock", "paper", "scissors"]));
  });

  it("AC-004: 사용자 선택이나 이전 결과와 무관하게 주입된 난수만 사용한다", () => {
    const values = [0, 0, 0.5, 0.5];
    let i = 0;
    const picks = values.map(() => pickComputerChoice(() => values[i++]));
    expect(picks).toEqual(["rock", "rock", "paper", "paper"]);
  });
});

/**
 * 컴퓨터 선택 분포 검증 (AC-004 보강).
 *
 * 방법: 재현 가능한 의사난수(mulberry32)를 고정 시드로 `pickComputerChoice`에 주입하고,
 * 각 선택의 비율이 이론값 1/3에서 허용 오차 이내인지 확인한다.
 *
 * 허용 오차 근거: 각 선택의 횟수는 이항분포 B(n, 1/3)를 따르므로 비율의 표준편차는
 * σ = √(p(1−p)/n)이다. 허용 오차는 4σ로 둔다(n=30,000일 때 ±1.09%p).
 *  - 정규 근사에서 4σ 밖일 확률은 범주당 약 6.3×10⁻⁵(세 범주 합쳐 약 0.02%)다.
 *  - 시드가 고정되어 결과가 결정적이므로 테스트는 흔들리지 않는다. 시드를 바꿔도 우연히
 *    실패할 확률이 약 0.02%에 불과하다.
 *  - n이 커질수록 σ가 줄어 허용 오차도 함께 줄어든다(1/√n).
 *
 * 한계 (이 테스트가 증명하지 않는 것):
 *  1. 편향이 약 1%p(n=30,000, 4σ 기준) 미만이면 검출하지 못한다. 예: 34/33/33% 분포는 통과한다.
 *  2. 통계 검정은 "이 시드의 수열에서 이 함수의 매핑이 균등하다"는 것만 보인다.
 *     실제 `Math.random()`의 품질이나 난수 생성기 일반의 품질은 증명하지 않는다.
 *  3. 비결정적인 `Math.random()` 검증은 간헐적 실패를 피하려고 테스트에 넣지 않았다.
 *  4. 난수열의 직렬 상관 등 고차 구조는 검사하지 않는다(독립성은 "직전 선택 → 다음 선택"
 *     분포만 확인한다).
 */
describe("pickComputerChoice 분포 (재현 가능한 통계 검증)", () => {
  const P = 1 / 3;

  /** 테스트 전용 고정 시드 의사난수 (mulberry32). 호출마다 [0, 1) 값을 반환한다. */
  const mulberry32 = (seed: number) => {
    let a = seed | 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /** 비율의 표준편차 σ = √(p(1−p)/n) 의 k배 */
  const tolerance = (n: number, k = 4) => k * Math.sqrt((P * (1 - P)) / n);

  const countChoices = (picker: (random: () => number) => Choice, n: number, seed: number) => {
    const random = mulberry32(seed);
    const counts: Record<Choice, number> = { rock: 0, paper: 0, scissors: 0 };
    for (let i = 0; i < n; i++) counts[picker(random)]++;
    return counts;
  };

  /** 세 선택의 비율이 모두 1/3 ± 4σ 이내인가 */
  const isUniform = (counts: Record<Choice, number>) => {
    const n = CHOICES.reduce((sum, c) => sum + counts[c], 0);
    return CHOICES.every((c) => Math.abs(counts[c] / n - P) <= tolerance(n));
  };

  it.each([
    [1_000, 1_000],
    [10_000, 10_000],
    [30_000, 30_000],
    [30_000, 101],
    [30_000, 202],
    [30_000, 303],
  ])("AC-004: %i회(시드 %i) — 가위·바위·보 비율이 1/3 ± 4σ 이내", (n, seed) => {
    const counts = countChoices(pickComputerChoice, n, seed);
    expect(CHOICES.reduce((sum, c) => sum + counts[c], 0)).toBe(n);
    for (const choice of CHOICES) {
      expect(Math.abs(counts[choice] / n - P)).toBeLessThanOrEqual(tolerance(n));
    }
  });

  it("AC-004: 직전 컴퓨터 선택이 무엇이든 다음 선택 분포는 1/3 ± 4σ 이내다(이전 라운드 무영향)", () => {
    const random = mulberry32(3030);
    const next: Record<Choice, Record<Choice, number>> = {
      rock: { rock: 0, paper: 0, scissors: 0 },
      paper: { rock: 0, paper: 0, scissors: 0 },
      scissors: { rock: 0, paper: 0, scissors: 0 },
    };
    let prev = pickComputerChoice(random);
    for (let i = 0; i < 30_000; i++) {
      const cur = pickComputerChoice(random);
      next[prev][cur]++;
      prev = cur;
    }
    for (const before of CHOICES) {
      const rowTotal = CHOICES.reduce((sum, c) => sum + next[before][c], 0);
      for (const after of CHOICES) {
        expect(Math.abs(next[before][after] / rowTotal - P)).toBeLessThanOrEqual(
          tolerance(rowTotal),
        );
      }
    }
  });

  it.each([
    ["scissors", 7001],
    ["rock", 7002],
    ["paper", 7003],
  ] as const)(
    "AC-003/004: 사용자가 %s만 낼 때 30,000회 승·패·무 비율이 각각 1/3 ± 4σ 이내다(시드 %i)",
    (user, seed) => {
      const n = 30_000;
      const random = mulberry32(seed);
      const outcomes: Record<Outcome, number> = { win: 0, lose: 0, draw: 0 };
      for (let i = 0; i < n; i++) outcomes[judge(user, pickComputerChoice(random))]++;
      expect(outcomes.win + outcomes.lose + outcomes.draw).toBe(n);
      for (const outcome of ["win", "lose", "draw"] as const) {
        expect(Math.abs(outcomes[outcome] / n - P)).toBeLessThanOrEqual(tolerance(n));
      }
    },
  );

  it("검출력 확인: 편향된 선택기(Math.round 방식, 25/50/25%)는 같은 기준으로 불합격한다", () => {
    const biased = (random: () => number): Choice => CHOICES[Math.round(random() * 2)];
    expect(isUniform(countChoices(biased, 30_000, 9))).toBe(false);
    // 같은 기준이 올바른 구현은 통과시킨다.
    expect(isUniform(countChoices(pickComputerChoice, 30_000, 9))).toBe(true);
  });

  it("한계 확인: 1%p 미만의 미세한 편향(34/33/33%)은 이 기준으로 검출되지 않는다", () => {
    const slight = (random: () => number): Choice => {
      const v = random();
      return v < 0.34 ? CHOICES[0] : v < 0.67 ? CHOICES[1] : CHOICES[2];
    };
    // 이 테스트는 위 "한계 1"을 문서화한다. 이 기준은 약 1%p 미만의 편향을 보장하지 않는다.
    expect(isUniform(countChoices(slight, 30_000, 9))).toBe(true);
  });
});
