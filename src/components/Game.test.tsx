import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Game from "./Game";

const INITIAL_MESSAGE = "가위, 바위, 보 중 하나를 선택하세요";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderGame(random: () => number = () => 0) {
  return render(<Game random={random} />);
}

const button = (name: string) => screen.getByRole("button", { name });
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
    const container = document.createElement("div");
    document.body.append(container);
    container.innerHTML = renderToString(<Game random={() => 0} />);
    expect(container.querySelectorAll("button")).toHaveLength(0);

    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, <Game random={() => 0} />);
    });

    expect(container.querySelectorAll("button")).toHaveLength(3);
    expect(container.querySelector('[role="status"]')?.textContent).toBe(INITIAL_MESSAGE);
    expect(errorSpy).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    container.remove();
  });
});

describe("US2: 누적 전적 표시", () => {
  // 전적 항목: 라벨과 값이 함께 읽히는 "승 N" / "패 N" / "무 N"
  const scoreText = (label: "승" | "패" | "무") =>
    screen.getByText(new RegExp(`^${label} \\d+$`)).textContent;
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
