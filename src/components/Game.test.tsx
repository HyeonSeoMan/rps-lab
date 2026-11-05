import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Profiler, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Game from "./Game";

const INITIAL_MESSAGE = "가위, 바위, 보 중 하나를 선택하세요";

beforeEach(() => {
  window.localStorage.clear();
});

// 하이드레이션 테스트가 직접 만든 컨테이너·루트. 단언이 실패해도 afterEach가 항상 정리한다.
const manualContainers: HTMLElement[] = [];
const manualRoots: ReturnType<typeof hydrateRoot>[] = [];

function trackContainer(): HTMLElement {
  const container = document.createElement("div");
  document.body.append(container);
  manualContainers.push(container);
  return container;
}

afterEach(async () => {
  for (const root of manualRoots.splice(0)) {
    await act(async () => root.unmount());
  }
  for (const container of manualContainers.splice(0)) container.remove();
  cleanup();
  vi.restoreAllMocks();
});

function renderGame(random: () => number = () => 0) {
  return render(<Game random={random} />);
}

const button = (name: string) => screen.getByRole("button", { name });

/** 전적 항목(li)의 읽히는 텍스트("승 N" 등). 라벨과 값이 분리된 마크업에서도 동일하게 읽힌다. */
const scoreItem = (label: string) => {
  const li = screen
    .getAllByRole("listitem")
    .find((el) => el.textContent?.startsWith(`${label} `));
  if (!li) throw new Error(`전적 항목 없음: ${label}`);
  return li.textContent as string;
};
const status = () => screen.getByRole("status").textContent;

describe("US1: 한 라운드 플레이", () => {
  it("AC-001: 가위·바위·보 세 선택지가 보이고 선택 가능하다", () => {
    renderGame();
    for (const name of ["가위", "바위", "보"]) {
      // 이모지는 aria-hidden이라 접근 가능한 이름은 텍스트와 정확히 일치한다.
      const el = button(name) as HTMLButtonElement;
      expect(el.disabled).toBe(false);
    }
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("가위바위보");
    expect(status()).toBe(INITIAL_MESSAGE);
  });

  it("AC-001: 선택 버튼의 이모지는 aria-hidden 장식이다", () => {
    renderGame();
    for (const name of ["가위", "바위", "보"]) {
      const hidden = button(name).querySelector('[aria-hidden="true"]');
      expect(hidden).not.toBeNull();
      expect(hidden?.textContent?.trim().length).toBeGreaterThan(0);
    }
  });

  // random=0 → 컴퓨터는 바위, 0.4 → 보, 0.9 → 가위
  it.each([
    ["가위", 0, "바위", "패배"],
    ["가위", 0.4, "보", "승리!"],
    ["가위", 0.9, "가위", "무승부"],
    ["바위", 0, "바위", "무승부"],
    ["바위", 0.4, "보", "패배"],
    ["바위", 0.9, "가위", "승리!"],
    ["보", 0, "바위", "승리!"],
    ["보", 0.4, "보", "무승부"],
    ["보", 0.9, "가위", "패배"],
  ])(
    "AC-002: 내가 %s, 난수 %s(컴퓨터 %s) → %s",
    async (mine, value, computer, result) => {
      const user = userEvent.setup();
      renderGame(() => value);
      await user.click(button(mine));
      expect(status()).toBe(`나: ${mine} · 컴퓨터: ${computer} — ${result}`);
    },
  );

  it("AC-016: 라운드 진행 중 네트워크 요청(fetch)이 발생하지 않는다", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const user = userEvent.setup();
    renderGame();
    await user.click(button("가위"));
    await user.click(button("보"));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("FR-011: 입력 1회 = 라운드 1회 (AC-014 선행 확인)", () => {
  it("마우스 클릭 1회는 컴퓨터 선택을 정확히 1번만 호출한다", async () => {
    const random = vi.fn(() => 0);
    const user = userEvent.setup();
    renderGame(random);
    await user.click(button("가위"));
    expect(random).toHaveBeenCalledTimes(1);
  });

  it("터치(포인터) 탭 1회는 정확히 1번만 처리된다", async () => {
    const random = vi.fn(() => 0);
    const user = userEvent.setup();
    renderGame(random);
    await user.pointer([
      { keys: "[TouchA>]", target: button("바위") },
      { keys: "[/TouchA]" },
    ]);
    expect(random).toHaveBeenCalledTimes(1);
  });

  it("키보드 Enter 1회, Space 1회는 각각 정확히 1번만 처리된다", async () => {
    const random = vi.fn(() => 0);
    const user = userEvent.setup();
    renderGame(random);
    button("보").focus();
    await user.keyboard("{Enter}");
    expect(random).toHaveBeenCalledTimes(1);
    await user.keyboard(" ");
    expect(random).toHaveBeenCalledTimes(2);
  });
});

describe("복원 게이트 (서버 렌더·하이드레이션)", () => {
  it("서버 렌더 HTML에는 선택 버튼이 없고 제목과 빈 로딩 영역만 있다", () => {
    const html = renderToString(<Game />);
    expect(html).not.toContain("<button");
    expect(html).toContain("가위바위보");
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain(INITIAL_MESSAGE);
  });

  it("하이드레이션 후에는 버튼이 나타나고 불일치 오류가 없다", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const container = trackContainer();
    container.innerHTML = renderToString(<Game random={() => 0} />);
    expect(container.querySelectorAll("button")).toHaveLength(0);

    await act(async () => {
      manualRoots.push(hydrateRoot(container, <Game random={() => 0} />));
    });

    expect(container.querySelectorAll("button")).toHaveLength(4); // 선택 3 + 전적 초기화 1
    expect(container.querySelector('[role="status"]')?.textContent).toBe(INITIAL_MESSAGE);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe("US2: 누적 전적 표시", () => {
  // 전적 항목: 라벨과 값이 함께 읽히는 "승 N" / "패 N" / "무 N"
  const scoreText = (label: "승" | "패" | "무") =>
    scoreItem(label);
  const scoreLine = () => `${scoreText("승")} ${scoreText("패")} ${scoreText("무")}`;

  it("AC-005: 저장된 전적이 없는 첫 접속에서 승 0 / 패 0 / 무 0이 표시된다", () => {
    renderGame();
    expect(scoreText("승")).toBe("승 0");
    expect(scoreText("패")).toBe("패 0");
    expect(scoreText("무")).toBe("무 0");
  });

  // 가위로 플레이: 난수 0 → 컴퓨터 바위(패배), 0.4 → 보(승리), 0.9 → 가위(무승부)
  it.each([
    [0, "승 0 패 1 무 0"],
    [0.4, "승 1 패 0 무 0"],
    [0.9, "승 0 패 0 무 1"],
  ])(
    "AC-006: 난수 %s 라운드는 해당 항목만 정확히 1 증가한다 → %s",
    async (value, expected) => {
      const user = userEvent.setup();
      renderGame(() => value);
      await user.click(button("가위"));
      expect(scoreLine()).toBe(expected);
    },
  );

  it("AC-006: 이미 누적된 값에서도 해당 항목만 1 증가하고 나머지는 변하지 않는다", async () => {
    const values = [0.4, 0.4, 0, 0.9]; // 승 승 패 무
    let i = 0;
    const user = userEvent.setup();
    renderGame(() => values[i++]);
    await user.click(button("가위"));
    await user.click(button("가위"));
    expect(scoreLine()).toBe("승 2 패 0 무 0");
    await user.click(button("가위"));
    expect(scoreLine()).toBe("승 2 패 1 무 0");
    await user.click(button("가위"));
    expect(scoreLine()).toBe("승 2 패 1 무 1");
  });

  it("AC-007: 0/0/0에서 N라운드 진행 후 승 + 패 + 무 = N 이다", async () => {
    const values = [0, 0.4, 0.9, 0.4, 0, 0.9, 0.4]; // 7라운드, 결과 혼합
    let i = 0;
    const user = userEvent.setup();
    renderGame(() => values[i++ % values.length]);
    const choices = ["가위", "바위", "보"];
    for (let n = 0; n < values.length; n++) {
      await user.click(button(choices[n % 3]));
    }
    const total = ["승", "패", "무"]
      .map((l) => Number(scoreText(l as "승" | "패" | "무")?.split(" ")[1]))
      .reduce((a, b) => a + b, 0);
    expect(total).toBe(values.length);
  });
});

describe("US3: 연속 플레이", () => {
  const CHOICES = ["가위", "바위", "보"] as const;

  const num = (label: "승" | "패" | "무") =>
    Number(scoreItem(label).split(" ")[1]);
  const score = () => ({ win: num("승"), lose: num("패"), draw: num("무") });
  const total = () => score().win + score().lose + score().draw;

  /** 표시된 결과 문구에서 판정(win/lose/draw)을 읽는다. */
  const shownOutcome = () => {
    const text = status() ?? "";
    if (text.endsWith("승리!")) return "win";
    if (text.endsWith("패배")) return "lose";
    if (text.endsWith("무승부")) return "draw";
    return null;
  };

  /** 결정적 의사난수열 (테스트 전용 LCG) */
  const lcg = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  it("AC-008: 다음 라운드를 누르면 결과가 갱신되고 이전 라운드 결과는 남지 않는다", async () => {
    const values = [0, 0.9]; // 첫 라운드: 컴퓨터 바위, 둘째: 컴퓨터 가위
    let i = 0;
    const user = userEvent.setup();
    renderGame(() => values[i++]);

    await user.click(button("가위"));
    expect(status()).toBe("나: 가위 · 컴퓨터: 바위 — 패배");

    await user.click(button("보"));
    expect(status()).toBe("나: 보 · 컴퓨터: 가위 — 패배");
    expect(document.body.textContent).not.toContain("나: 가위 · 컴퓨터: 바위");
    expect(screen.getAllByRole("status")).toHaveLength(1); // 이력 목록 없음
    expect(screen.getAllByRole("listitem")).toHaveLength(3); // 전적 3항목뿐
  });

  it("AC-009: 결과 표시 후에도 이어서 플레이하면 전적이 계속 누적된다", async () => {
    const user = userEvent.setup();
    renderGame(lcg(7));
    for (let n = 1; n <= 12; n++) {
      await user.click(button(CHOICES[n % 3]));
      expect(total()).toBe(n);
    }
  });

  describe("AC-014: 입력 1회 = 라운드 1회", () => {
    const methods: [string, (u: ReturnType<typeof userEvent.setup>) => Promise<void>][] = [
      ["마우스 클릭", (u) => u.click(button("바위"))],
      [
        "터치 탭",
        (u) =>
          u.pointer([{ keys: "[TouchA>]", target: button("바위") }, { keys: "[/TouchA]" }]),
      ],
      [
        "키보드 Enter",
        async (u) => {
          button("바위").focus();
          await u.keyboard("{Enter}");
        },
      ],
      [
        "키보드 Space",
        async (u) => {
          button("바위").focus();
          await u.keyboard(" ");
        },
      ],
    ];

    it.each(methods)("%s 1회: 컴퓨터 선택 1회 호출, 전적 합계 정확히 +1", async (_name, act1) => {
      const random = vi.fn(() => 0.4);
      const user = userEvent.setup();
      renderGame(random);
      await act1(user);
      expect(random).toHaveBeenCalledTimes(1);
      expect(total()).toBe(1);
      expect(shownOutcome()).toBe("lose"); // 바위 vs 보
    });
  });

  describe("AC-022: 빠른 연속 입력은 모두 독립적인 라운드로 처리된다", () => {
    it("대기 없이 연속 클릭 N회 → 컴퓨터 선택 N회, 합계 N, 마지막 라운드 표시", async () => {
      const N = 5;
      const values = [0, 0.4, 0.9, 0.4, 0]; // 컴퓨터: 바위 보 가위 보 바위
      let i = 0;
      const random = vi.fn(() => values[i++]);
      const user = userEvent.setup({ delay: null });
      renderGame(random);
      for (let n = 0; n < N; n++) await user.click(button("가위"));
      expect(random).toHaveBeenCalledTimes(N);
      expect(total()).toBe(N);
      // 가위 vs [바위 보 가위 보 바위] = 패 승 무 승 패
      expect(score()).toEqual({ win: 2, lose: 2, draw: 1 });
      expect(status()).toBe("나: 가위 · 컴퓨터: 바위 — 패배");
    });

    it("클릭·터치·Enter·Space를 섞어 연속 입력해도 4회 모두 처리된다", async () => {
      const random = vi.fn(() => 0.9);
      const user = userEvent.setup({ delay: null });
      renderGame(random);
      await user.click(button("가위"));
      await user.pointer([{ keys: "[TouchA>]", target: button("바위") }, { keys: "[/TouchA]" }]);
      button("보").focus();
      await user.keyboard("{Enter}");
      await user.keyboard(" ");
      expect(random).toHaveBeenCalledTimes(4);
      expect(total()).toBe(4);
    });

    it("더블 클릭은 입력 2회이므로 2라운드로 처리된다", async () => {
      const random = vi.fn(() => 0);
      const user = userEvent.setup({ delay: null });
      renderGame(random);
      await user.dblClick(button("바위"));
      expect(random).toHaveBeenCalledTimes(2);
      expect(total()).toBe(2);
    });

    it("같은 틱에 발생한 클릭 5회(동일 act 안)도 모두 처리된다", () => {
      const random = vi.fn(() => 0.4);
      renderGame(random);
      const target = button("보");
      act(() => {
        for (let n = 0; n < 5; n++) target.click();
      });
      expect(random).toHaveBeenCalledTimes(5);
      expect(total()).toBe(5);
      expect(score()).toEqual({ win: 0, lose: 0, draw: 5 });
    });

    it("타이머가 전혀 진행되지 않아도(시간 기반 제한 없음) 연속 입력이 모두 처리된다", () => {
      // user-event의 비동기 래퍼는 Vitest 가짜 타이머를 감지하지 못하므로 동기 fireEvent를 쓴다.
      vi.useFakeTimers();
      try {
        const random = vi.fn(() => 0);
        renderGame(random);
        fireEvent.click(button("가위"));
        fireEvent.click(button("가위"));
        fireEvent.click(button("가위"));
        expect(random).toHaveBeenCalledTimes(3);
        expect(total()).toBe(3);
      } finally {
        vi.useRealTimers();
      }
    });

    it("연속 입력 40회 동안 매번 결과 표시와 누적 전적이 일치하고 입력이 차단되지 않는다", async () => {
      const random = vi.fn(lcg(2024));
      const user = userEvent.setup({ delay: null });
      renderGame(random);

      let prev = score();
      for (let n = 1; n <= 40; n++) {
        await user.click(button(CHOICES[(n * 5) % 3]));
        const now = score();
        const shown = shownOutcome();
        // 표시된 판정에 해당하는 항목만 정확히 1 증가했다.
        expect(shown).not.toBeNull();
        for (const key of ["win", "lose", "draw"] as const) {
          expect(now[key] - prev[key]).toBe(key === shown ? 1 : 0);
        }
        expect(total()).toBe(n);
        // 입력 차단(disabled / aria-disabled)이 없다.
        for (const name of CHOICES) {
          const el = button(name) as HTMLButtonElement;
          expect(el.disabled).toBe(false);
          expect(el.getAttribute("aria-disabled")).toBeNull();
        }
        prev = now;
      }
      expect(random).toHaveBeenCalledTimes(40);
    });
  });
});

describe("US4: 키보드 접근성", () => {
  const total = () =>
    ["승", "패", "무"]
      .map((l) => Number(scoreItem(l).split(" ")[1]))
      .reduce((a, b) => a + b, 0);

  it("AC-013: 세 선택 버튼은 네이티브 button이며 tabindex 조작 없이 Tab 순서에 포함된다", () => {
    renderGame();
    for (const name of ["가위", "바위", "보"]) {
      const el = button(name);
      expect(el.tagName).toBe("BUTTON");
      expect((el as HTMLButtonElement).type).toBe("button");
      expect(el.hasAttribute("tabindex")).toBe(false);
    }
  });

  it("AC-013: Tab 키로 가위 → 바위 → 보 순서로 포커스가 이동하고 Shift+Tab은 역순이다", async () => {
    const user = userEvent.setup();
    renderGame();
    await user.tab();
    expect(document.activeElement).toBe(button("가위"));
    await user.tab();
    expect(document.activeElement).toBe(button("바위"));
    await user.tab();
    expect(document.activeElement).toBe(button("보"));
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(button("바위"));
  });

  it("AC-013: 포커스된 버튼에서 Enter는 정확히 한 라운드를 진행한다", async () => {
    const random = vi.fn(() => 0);
    const user = userEvent.setup();
    renderGame(random);
    await user.tab(); // 가위
    await user.keyboard("{Enter}");
    expect(random).toHaveBeenCalledTimes(1);
    expect(total()).toBe(1);
    expect(status()).toBe("나: 가위 · 컴퓨터: 바위 — 패배");
  });

  it("AC-013: 포커스된 버튼에서 Space는 정확히 한 라운드를 진행한다", async () => {
    const random = vi.fn(() => 0.4);
    const user = userEvent.setup();
    renderGame(random);
    await user.tab();
    await user.tab(); // 바위
    await user.keyboard(" ");
    expect(random).toHaveBeenCalledTimes(1);
    expect(total()).toBe(1);
    expect(status()).toBe("나: 바위 · 컴퓨터: 보 — 패배");
  });

  it("AC-013: 라운드 후에도 포커스가 같은 버튼에 남아 키보드만으로 계속 플레이할 수 있다", async () => {
    const random = vi.fn(() => 0);
    const user = userEvent.setup();
    renderGame(random);
    await user.tab();
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(button("가위"));
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(random).toHaveBeenCalledTimes(3);
    expect(total()).toBe(3);
    expect(document.activeElement).toBe(button("가위"));
  });

  it("AC-013: 키보드로 다른 버튼을 선택하면 해당 선택이 반영된다", async () => {
    const user = userEvent.setup();
    renderGame(() => 0.9); // 컴퓨터 가위
    await user.tab();
    await user.tab();
    await user.tab(); // 보
    await user.keyboard("{Enter}");
    expect(status()).toBe("나: 보 · 컴퓨터: 가위 — 패배");
  });
});

describe("UI 개선: 좌우 대결 구조 (사용자 | 결과 | 컴퓨터)", () => {
  const arena = () => screen.getByRole("region", { name: "최근 라운드 결과" });

  /** DOM 순서상 a가 b보다 앞인지 */
  const before = (a: Element, b: Element) =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it("첫 라운드 전에는 중립적인 초기 화면(물음표, 승패 문구 없음)과 안내 문구가 보인다", () => {
    renderGame();
    const region = arena();
    expect(within(region).getByText("나")).toBeTruthy();
    expect(within(region).getByText("컴퓨터")).toBeTruthy();
    expect(within(region).getByText("VS")).toBeTruthy();
    expect(within(region).getAllByText("?")).toHaveLength(2);
    for (const word of ["승리!", "패배", "무승부"]) {
      expect(region.textContent).not.toContain(word);
    }
    // 시각용 안내 문구는 장식(aria-hidden), 접근 가능한 문장은 role="status"가 맡는다.
    const matches = within(region).getAllByText(INITIAL_MESSAGE);
    expect(matches).toHaveLength(2); // role="status"(스크린리더용) + 시각용 안내
    expect(matches.filter((el) => el.getAttribute("aria-hidden") === "true")).toHaveLength(1);
    expect(matches.filter((el) => el.getAttribute("role") === "status")).toHaveLength(1);
    expect(status()).toBe(INITIAL_MESSAGE);
  });

  it("라운드 후 왼쪽=나, 가운데=결과, 오른쪽=컴퓨터 순서로 선택 이모지와 이름이 표시된다", async () => {
    const user = userEvent.setup();
    renderGame(() => 0); // 컴퓨터: 바위
    await user.click(button("가위")); // 나: 가위 → 패배
    const region = arena();

    const me = within(region).getByText("나");
    const mine = within(region).getByText("가위");
    const outcome = within(region).getByText("패배");
    const cpu = within(region).getByText("컴퓨터");
    const theirs = within(region).getByText("바위");

    expect(before(me, mine)).toBe(true);
    expect(before(mine, outcome)).toBe(true);
    expect(before(outcome, cpu)).toBe(true);
    expect(before(cpu, theirs)).toBe(true);
    expect(region.textContent).toContain("✌️"); // 내 손
    expect(region.textContent).toContain("✊"); // 컴퓨터 손
    expect(region.textContent).not.toContain("?");
  });

  it.each([
    ["가위", 0.4, "승리!", "win"],
    ["가위", 0, "패배", "lose"],
    ["가위", 0.9, "무승부", "draw"],
  ])("%s / 난수 %s → 결과가 텍스트(%s)와 data-outcome(%s)로 구분된다", async (mine, value, text, kind) => {
    const user = userEvent.setup();
    renderGame(() => value);
    await user.click(button(mine));
    const node = within(arena()).getByText(text);
    expect(node.closest("[data-outcome]")?.getAttribute("data-outcome")).toBe(kind);
  });

  it("첫 라운드 후 시각용 안내 문구는 사라지고 결과가 갱신된다", async () => {
    const user = userEvent.setup();
    renderGame(() => 0);
    await user.click(button("보")); // 보 vs 바위 → 승리
    expect(arena().textContent).not.toContain(INITIAL_MESSAGE);
    await user.click(button("바위")); // 바위 vs 바위 → 무승부
    expect(within(arena()).getByText("무승부")).toBeTruthy();
    expect(arena().textContent).not.toContain("승리!");
  });

  it("접근성: role=status는 1개이며 전체 문장을 담고, 시각용 대결 영역은 aria-hidden이다", async () => {
    const user = userEvent.setup();
    renderGame(() => 0.4); // 컴퓨터: 보
    await user.click(button("가위"));
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(status()).toBe("나: 가위 · 컴퓨터: 보 — 승리!");
    const status_ = screen.getByRole("status");
    expect(status_.closest('[aria-hidden="true"]')).toBeNull();
    const hiddenArena = arena().querySelector('[aria-hidden="true"]');
    expect(hiddenArena?.textContent).toContain("승리!");
    // 접근성 트리에서 결과 문구가 중복 낭독되지 않는다.
    expect(screen.queryAllByText("승리!", { ignore: '[aria-hidden="true"], [aria-hidden="true"] *' })).toHaveLength(0);
  });

  it("선택 버튼 그룹과 누적 전적에 접근 가능한 이름이 있다", () => {
    renderGame();
    expect(screen.getByRole("group", { name: "손 모양 선택" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "누적 전적" })).toBeTruthy();
    expect(scoreItem("승")).toBe("승 0");
  });
});

describe("US5: 전적 유지와 초기화", () => {
  const KEY = "rps-lab:score";
  const store = (wins: number, losses: number, draws: number) =>
    window.localStorage.setItem(KEY, JSON.stringify({ wins, losses, draws }));
  const rawStored = () => window.localStorage.getItem(KEY);
  const line = () => `${scoreItem("승")} ${scoreItem("패")} ${scoreItem("무")}`;
  const sumOf = () => ["승", "패", "무"].reduce((a, l) => a + Number(scoreItem(l).split(" ")[1]), 0);
  /** 새로고침 시뮬레이션: 언마운트 후 다시 마운트 */
  const reload = (random: () => number = () => 0) => {
    cleanup();
    return renderGame(random);
  };
  const noConsoleErrors = () => vi.spyOn(console, "error").mockImplementation(() => {});

  describe("AC-017: 복원", () => {
    it("서버 렌더 HTML에는 전적 값과 버튼이 없다(복원 전 입력 불가, 잘못된 0/0/0 없음)", () => {
      store(5, 3, 2);
      const html = renderToString(<Game />);
      expect(html).not.toContain("<button");
      expect(html).not.toContain("승");
      expect(html).not.toContain("누적 전적");
    });

    it("하이드레이션: 저장값 5/3/2가 표시되고 중간 상태에 '승 0'이 한 번도 나타나지 않는다", async () => {
      store(5, 3, 2);
      const errorSpy = noConsoleErrors();
      const container = trackContainer();
      container.innerHTML = renderToString(<Game random={() => 0} />);

      const snapshots: string[] = [container.textContent ?? ""];
      const observer = new MutationObserver(() => snapshots.push(container.textContent ?? ""));
      observer.observe(container, { childList: true, subtree: true, characterData: true });

      await act(async () => {
        manualRoots.push(hydrateRoot(container, <Game random={() => 0} />));
      });
      snapshots.push(container.textContent ?? "");
      observer.disconnect();

      const items = [...container.querySelectorAll("li")].map((li) => li.textContent);
      expect(items).toEqual(["승 5", "패 3", "무 2"]);
      expect(snapshots.some((t) => t.includes("승 0"))).toBe(false);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it("클라이언트 렌더: 저장값이 첫 커밋에 바로 표시된다(커밋 1회, 0/0/0 중간 상태 없음)", () => {
      store(5, 3, 2);
      let commits = 0;
      render(
        <Profiler id="game" onRender={() => commits++}>
          <Game random={() => 0} />
        </Profiler>,
      );
      expect(commits).toBe(1);
      expect(line()).toBe("승 5 패 3 무 2");
    });

    it("라운드를 진행한 뒤 새로고침(재마운트)해도 전적이 정확히 복원된다", async () => {
      const user = userEvent.setup();
      const values = [0.4, 0.4, 0, 0.9]; // 가위 기준: 승 승 패 무
      let i = 0;
      renderGame(() => values[i++]);
      for (let n = 0; n < 4; n++) await user.click(button("가위"));
      expect(line()).toBe("승 2 패 1 무 1");
      expect(JSON.parse(rawStored() as string)).toEqual({ wins: 2, losses: 1, draws: 1 });

      reload();
      expect(line()).toBe("승 2 패 1 무 1");
    });

    it("마지막 라운드 결과는 새로고침 후 복원되지 않는다(초기 안내 문구, '?' 표시)", async () => {
      const user = userEvent.setup();
      renderGame(() => 0);
      await user.click(button("가위"));
      expect(status()).toBe("나: 가위 · 컴퓨터: 바위 — 패배");
      expect(rawStored()).not.toContain("lastRound");

      reload();
      expect(status()).toBe(INITIAL_MESSAGE);
      expect(within(screen.getByRole("region", { name: "최근 라운드 결과" })).getAllByText("?")).toHaveLength(2);
      expect(line()).toBe("승 0 패 1 무 0");
    });
  });

  describe("AC-018 / AC-019: 초기화", () => {
    it("AC-018: 초기화 버튼은 확인 절차 없이 즉시 0/0/0과 초기 안내 문구로 되돌린다", async () => {
      const confirmSpy = vi.spyOn(window, "confirm");
      const user = userEvent.setup();
      renderGame(() => 0);
      await user.click(button("가위"));
      await user.click(button("바위"));
      expect(sumOf()).toBe(2);

      await user.click(button("전적 초기화"));
      expect(line()).toBe("승 0 패 0 무 0");
      expect(status()).toBe(INITIAL_MESSAGE);
      const region = screen.getByRole("region", { name: "최근 라운드 결과" });
      expect(within(region).getAllByText("?")).toHaveLength(2);
      expect(confirmSpy).not.toHaveBeenCalled();
    });

    it("AC-019: 초기화한 전적은 새로고침 후에도 0/0/0이고 저장값도 0이다", async () => {
      store(5, 3, 2);
      const user = userEvent.setup();
      renderGame();
      expect(line()).toBe("승 5 패 3 무 2");
      await user.click(button("전적 초기화"));
      expect(JSON.parse(rawStored() as string)).toEqual({ wins: 0, losses: 0, draws: 0 });

      reload();
      expect(line()).toBe("승 0 패 0 무 0");
    });

    it("초기화 직후 다음 라운드는 0부터 정확히 누적되고 저장된다", async () => {
      store(5, 3, 2);
      const user = userEvent.setup();
      renderGame(() => 0.4); // 가위 vs 보 → 승
      await user.click(button("전적 초기화"));
      await user.click(button("가위"));
      expect(line()).toBe("승 1 패 0 무 0");
      expect(JSON.parse(rawStored() as string)).toEqual({ wins: 1, losses: 0, draws: 0 });
    });

    it("이미 0/0/0인 상태에서 초기화해도 문제가 없고 0이 저장된다", async () => {
      const user = userEvent.setup();
      renderGame();
      await user.click(button("전적 초기화"));
      expect(line()).toBe("승 0 패 0 무 0");
      expect(JSON.parse(rawStored() as string)).toEqual({ wins: 0, losses: 0, draws: 0 });
    });
  });

  describe("AC-020: 손상된 저장값 (승인된 저장소 정책)", () => {
    it.each([
      ["잘못된 JSON", "abc"],
      ["빈 문자열", ""],
      ["JSON null", "null"],
      ["배열", "[1,2,3]"],
      ["음수", '{"wins":-1,"losses":0,"draws":0}'],
      ["소수", '{"wins":1.5,"losses":0,"draws":0}'],
      ["문자열 값", '{"wins":"5","losses":0,"draws":0}'],
      ["키 누락", '{"wins":5,"losses":3}'],
    ])("%s → 0/0/0으로 시작하고, 한 라운드 후 저장값이 유효한 JSON으로 대체된다", async (_label, raw) => {
      window.localStorage.setItem(KEY, raw);
      const errorSpy = noConsoleErrors();
      const user = userEvent.setup();
      renderGame(() => 0.4);
      expect(line()).toBe("승 0 패 0 무 0");
      expect(rawStored()).toBe(raw); // 상호작용 전에는 덮어쓰지 않는다

      await user.click(button("가위"));
      expect(line()).toBe("승 1 패 0 무 0");
      expect(JSON.parse(rawStored() as string)).toEqual({ wins: 1, losses: 0, draws: 0 });
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe("AC-020 / AC-021: 저장소 예외에도 게임은 계속된다", () => {
    it("getItem이 예외를 던져도 0/0/0으로 시작해 플레이할 수 있고, 유효한 기존 데이터를 덮어쓰지 않는다", async () => {
      store(5, 3, 2);
      const realGet = Storage.prototype.getItem;
      const errorSpy = noConsoleErrors();
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      const setSpy = vi.spyOn(Storage.prototype, "setItem");
      const user = userEvent.setup();
      renderGame(() => 0.4);

      expect(line()).toBe("승 0 패 0 무 0");
      await user.click(button("가위"));
      await user.click(button("가위"));
      expect(line()).toBe("승 2 패 0 무 0");
      await user.click(button("전적 초기화"));
      expect(line()).toBe("승 0 패 0 무 0");

      expect(setSpy).not.toHaveBeenCalled();
      expect(realGet.call(window.localStorage, KEY)).toBe('{"wins":5,"losses":3,"draws":2}');
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it("setItem이 예외를 던져도 전적이 정상 누적되고 오류가 화면에 드러나지 않는다", async () => {
      const errorSpy = noConsoleErrors();
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new DOMException("quota", "QuotaExceededError");
      });
      const user = userEvent.setup();
      renderGame(() => 0.4);
      await user.click(button("가위"));
      await user.click(button("가위"));
      await user.click(button("가위"));
      expect(line()).toBe("승 3 패 0 무 0");
      await user.click(button("전적 초기화"));
      expect(line()).toBe("승 0 패 0 무 0");
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it("window.localStorage getter가 예외를 던져도 플레이와 초기화가 정상 동작한다", async () => {
      const errorSpy = noConsoleErrors();
      vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
        throw new DOMException("denied", "SecurityError");
      });
      const user = userEvent.setup();
      renderGame(() => 0.9); // 가위 vs 가위 → 무
      expect(line()).toBe("승 0 패 0 무 0");
      await user.click(button("가위"));
      await user.click(button("가위"));
      expect(line()).toBe("승 0 패 0 무 2");
      await user.click(button("전적 초기화"));
      expect(line()).toBe("승 0 패 0 무 0");
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe("저장 시점과 StrictMode", () => {
    it("유효한 저장값 마운트 후 상호작용 전에는 setItem을 호출하지 않는다", () => {
      store(5, 3, 2);
      const setSpy = vi.spyOn(Storage.prototype, "setItem");
      renderGame();
      expect(line()).toBe("승 5 패 3 무 2");
      expect(setSpy).not.toHaveBeenCalled();
      expect(rawStored()).toBe('{"wins":5,"losses":3,"draws":2}');
    });

    it("StrictMode: 저장값을 복원하고 마운트만으로는 쓰지 않으며 기존 값을 덮어쓰지 않는다", () => {
      store(5, 3, 2);
      const setSpy = vi.spyOn(Storage.prototype, "setItem");
      render(
        <StrictMode>
          <Game random={() => 0} />
        </StrictMode>,
      );
      expect(line()).toBe("승 5 패 3 무 2");
      expect(setSpy).not.toHaveBeenCalled();
      expect(rawStored()).toBe('{"wins":5,"losses":3,"draws":2}');
    });

    it("StrictMode: 라운드 N회 → 저장 N회(중복 저장 없음), 최종 저장값은 화면과 일치한다", async () => {
      store(5, 3, 2);
      const setSpy = vi.spyOn(Storage.prototype, "setItem");
      const user = userEvent.setup({ delay: null });
      render(
        <StrictMode>
          <Game random={() => 0.4} />
        </StrictMode>,
      );
      for (let n = 0; n < 4; n++) await user.click(button("가위")); // 가위 vs 보 → 승
      expect(line()).toBe("승 9 패 3 무 2");
      expect(setSpy).toHaveBeenCalledTimes(4);
      expect(JSON.parse(rawStored() as string)).toEqual({ wins: 9, losses: 3, draws: 2 });
    });

    it("StrictMode: 초기화는 0/0/0을 한 번 저장하고 새로고침 후에도 유지된다", async () => {
      store(5, 3, 2);
      const setSpy = vi.spyOn(Storage.prototype, "setItem");
      const user = userEvent.setup();
      render(
        <StrictMode>
          <Game random={() => 0} />
        </StrictMode>,
      );
      await user.click(button("전적 초기화"));
      expect(setSpy).toHaveBeenCalledTimes(1);
      expect(line()).toBe("승 0 패 0 무 0");

      cleanup();
      render(
        <StrictMode>
          <Game random={() => 0} />
        </StrictMode>,
      );
      expect(line()).toBe("승 0 패 0 무 0");
    });

    it("복원 직후 빠른 연속 입력 3회 → 복원값 5/3/2에 정확히 +3 (합계 13)", async () => {
      store(5, 3, 2);
      const random = vi.fn(() => 0);
      const user = userEvent.setup({ delay: null });
      renderGame(random);
      await user.click(button("가위"));
      await user.click(button("바위"));
      await user.click(button("보"));
      expect(random).toHaveBeenCalledTimes(3);
      expect(sumOf()).toBe(13);
    });
  });

  describe("AC-013: 초기화 버튼의 키보드 조작", () => {
    it("Tab 순서는 가위 → 바위 → 보 → 전적 초기화이고 Shift+Tab은 역순이다", async () => {
      const user = userEvent.setup();
      renderGame();
      await user.tab();
      expect(document.activeElement).toBe(button("가위"));
      await user.tab();
      expect(document.activeElement).toBe(button("바위"));
      await user.tab();
      expect(document.activeElement).toBe(button("보"));
      await user.tab();
      expect(document.activeElement).toBe(button("전적 초기화"));
      await user.tab({ shift: true });
      expect(document.activeElement).toBe(button("보"));
    });

    it("초기화 버튼은 네이티브 button이며 비활성화되지 않고 tabindex 조작이 없다", () => {
      renderGame();
      const el = button("전적 초기화") as HTMLButtonElement;
      expect(el.tagName).toBe("BUTTON");
      expect(el.type).toBe("button");
      expect(el.disabled).toBe(false);
      expect(el.hasAttribute("tabindex")).toBe(false);
    });

    it("Enter로 초기화할 수 있다(입력 1회 = 초기화 1회)", async () => {
      store(5, 3, 2);
      const setSpy = vi.spyOn(Storage.prototype, "setItem");
      const user = userEvent.setup();
      renderGame();
      for (let n = 0; n < 4; n++) await user.tab();
      expect(document.activeElement).toBe(button("전적 초기화"));
      await user.keyboard("{Enter}");
      expect(line()).toBe("승 0 패 0 무 0");
      expect(setSpy).toHaveBeenCalledTimes(1);
    });

    it("Space로 초기화할 수 있다", async () => {
      store(5, 3, 2);
      const user = userEvent.setup();
      renderGame();
      for (let n = 0; n < 4; n++) await user.tab();
      await user.keyboard(" ");
      expect(line()).toBe("승 0 패 0 무 0");
      expect(status()).toBe(INITIAL_MESSAGE);
    });
  });
});
