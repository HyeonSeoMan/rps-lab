import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import Game from "./Game";
import { createQueuedStore } from "@/lib/save-queue";
import { createMemoryStore, type MemoryStore } from "@/test-utils/memory-store";
import { judge } from "@/lib/rps";
import type { QueuedBattleStore } from "@/lib/battle-store";

const INITIAL_MESSAGE = "가위, 바위, 보 중 하나를 선택하세요";
const AUTO_INITIAL = "자동 대결 설정 후 시작하세요";

const manualContainers: HTMLElement[] = [];
const manualRoots: ReturnType<typeof hydrateRoot>[] = [];
afterEach(async () => {
  for (const root of manualRoots.splice(0)) await act(async () => root.unmount());
  for (const c of manualContainers.splice(0)) c.remove();
  cleanup();
  vi.restoreAllMocks();
});

type Env = { mem: MemoryStore; store: QueuedBattleStore };
const newEnv = (seed = [] as Parameters<typeof createMemoryStore>[0]): Env => {
  const mem = createMemoryStore(seed);
  return { mem, store: createQueuedStore(mem) };
};

/** 애니메이션 틱을 테스트가 수동으로 진행한다. abort되면 대기가 풀린다. */
function manualClock() {
  const waiters: Array<() => void> = [];
  return {
    wait: (_ms: number, signal: AbortSignal) =>
      new Promise<void>((resolve) => {
        if (signal.aborted) return resolve();
        waiters.push(resolve);
        signal.addEventListener("abort", () => resolve());
      }),
    pending: () => waiters.length,
    async tick() {
      await waitFor(() => expect(waiters.length).toBeGreaterThan(0));
      await act(async () => waiters.shift()!());
    },
  };
}

async function renderGame(env: Env = newEnv(), opts: { random?: () => number; wait?: (ms: number, s: AbortSignal) => Promise<void>; strict?: boolean } = {}) {
  const ui = <Game random={opts.random ?? (() => 0)} store={env.store} now={() => 1} wait={opts.wait} />;
  const view = render(opts.strict ? <StrictMode>{ui}</StrictMode> : ui);
  await screen.findByRole("list", { name: "누적 전적" }); // 최초 읽기 완료
  return { ...view, env };
}
const button = (name: string | RegExp) => screen.getByRole("button", { name });
const scoreItem = (label: string) => {
  const li = screen.getAllByRole("listitem").find((el) => el.textContent?.startsWith(`${label} `));
  if (!li) throw new Error(`전적 항목 없음: ${label}`);
  return li.textContent as string;
};
const status = () => screen.getByRole("status").textContent;
const line = () => `${scoreItem("승")} ${scoreItem("패")} ${scoreItem("무")}`;
const num = (l: string) => Number(scoreItem(l).split(" ")[1]);
const total = () => num("승") + num("패") + num("무");
const settle = (env: Env) => act(async () => env.store.whenIdle());
const expectLine = (text: string) => waitFor(() => expect(line()).toBe(text));
const toAuto = async (user: ReturnType<typeof userEvent.setup>) => user.click(button("자동 대결"));

describe("US1: 한 라운드 플레이 (v1 AC 회귀)", () => {
  it("AC-001: 세 선택지가 보이고 선택 가능하며 안내 문장이 있다", async () => {
    await renderGame();
    for (const name of ["가위", "바위", "보"]) expect((button(name) as HTMLButtonElement).disabled).toBe(false);
    expect(status()).toBe(INITIAL_MESSAGE);
  });

  it("AC-001: 선택 버튼의 이모지는 aria-hidden 장식이다", async () => {
    await renderGame();
    for (const name of ["가위", "바위", "보"]) {
      const hidden = button(name).querySelector('[aria-hidden="true"]');
      expect(hidden?.textContent?.trim().length).toBeGreaterThan(0);
    }
  });

  // random=0 → 컴퓨터 바위, 0.4 → 보, 0.9 → 가위
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
  ])("AC-002: 내가 %s, 난수 %s(컴퓨터 %s) → %s", async (mine, value, computer, result) => {
    const user = userEvent.setup();
    await renderGame(newEnv(), { random: () => value });
    await user.click(button(mine));
    await waitFor(() => expect(status()).toBe(`나: ${mine} · 컴퓨터: ${computer} — ${result}`));
  });

  it("AC-016: 라운드 진행 중 네트워크 요청(fetch)이 발생하지 않는다", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const user = userEvent.setup();
    const { env } = await renderGame();
    await user.click(button("가위"));
    await user.click(button("보"));
    await settle(env);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("FR-011: 입력 1회 = 라운드 1회 (클릭·터치·Enter·Space)", async () => {
    const random = vi.fn(() => 0);
    const user = userEvent.setup();
    const { env } = await renderGame(newEnv(), { random });
    await user.click(button("가위"));
    await user.pointer([{ keys: "[TouchA>]", target: button("바위") }, { keys: "[/TouchA]" }]);
    button("보").focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    await settle(env);
    expect(random).toHaveBeenCalledTimes(4);
    expect(total()).toBe(4);
    expect(env.mem.records()).toHaveLength(4);
  });
});

describe("복원 게이트 (서버 렌더·하이드레이션)", () => {
  it("서버 렌더 HTML에는 선택 버튼이 없고 제목과 빈 로딩 영역만 있다", () => {
    const html = renderToString(<Game />);
    expect(html).not.toContain("<button");
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain(INITIAL_MESSAGE);
    expect(html).not.toContain("누적 전적");
  });

  it("하이드레이션 후 저장된 전적이 표시되고 불일치 오류가 없으며 읽는 중에는 0/0/0이 나타나지 않는다", async () => {
    const env = newEnv([
      { user: "rock", computer: "scissors", at: 1 },
      { user: "rock", computer: "scissors", at: 2 },
      { user: "rock", computer: "paper", at: 3 },
    ]);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const container = document.createElement("div");
    document.body.append(container);
    manualContainers.push(container);
    container.innerHTML = renderToString(<Game store={env.store} />);
    const snapshots: string[] = [];
    const observer = new MutationObserver(() => snapshots.push(container.textContent ?? ""));
    observer.observe(container, { childList: true, subtree: true, characterData: true });
    await act(async () => {
      manualRoots.push(hydrateRoot(container, <Game store={env.store} />));
    });
    await waitFor(() => expect([...container.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["승 2", "패 1", "무 0"]));
    observer.disconnect();
    expect(snapshots.some((t) => t.includes("승 0"))).toBe(false);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("읽는 중에는 선택 버튼·전적이 없고(입력 불가), 읽기가 끝나면 나타난다", async () => {
    const env = newEnv();
    const resume = env.mem.pauseWrites(); // 읽기는 영향 없음. 읽기 지연은 whenIdle로 만든다.
    const w = env.store.recordBattles([{ user: "rock", computer: "rock", at: 1 }]);
    render(<Game store={env.store} now={() => 1} />);
    expect(screen.queryByRole("button", { name: "가위" })).toBeNull(); // 큐가 비기 전에는 읽지 않는다
    resume();
    await w;
    expect(await screen.findByRole("button", { name: "가위" })).toBeTruthy();
    expect(line()).toBe("승 0 패 0 무 1");
  });
});

describe("US2: 누적 전적과 기록", () => {
  it("AC-005: 첫 접속은 0/0/0이고 승·패·무는 색상 카드로 라벨이 유지된다", async () => {
    await renderGame();
    expect(line()).toBe("승 0 패 0 무 0");
    expect(screen.getByRole("list", { name: "누적 전적" })).toBeTruthy();
  });

  it.each([
    [0, "승 0 패 1 무 0"],
    [0.4, "승 1 패 0 무 0"],
    [0.9, "승 0 패 0 무 1"],
  ])("AC-006: 난수 %s 라운드는 해당 항목만 정확히 1 증가한다 → %s", async (value, expected) => {
    const user = userEvent.setup();
    await renderGame(newEnv(), { random: () => value });
    await user.click(button("가위"));
    await expectLine(expected);
  });

  it("AC2-004: 대결 1회마다 기록이 정확히 1건 추가되고 결과는 judge()로 계산된다", async () => {
    const values = [0.4, 0, 0.9];
    let i = 0;
    const user = userEvent.setup();
    const { env } = await renderGame(newEnv(), { random: () => values[i++] });
    for (let n = 1; n <= 3; n++) {
      await user.click(button("가위"));
      await waitFor(() => expect(env.mem.records()).toHaveLength(n));
      expect(total()).toBe(n);
    }
    const recs = env.mem.records();
    expect(recs.map((r) => r.seq)).toEqual([1, 2, 3]);
    expect(recs.map((r) => judge(r.user, r.computer))).toEqual(["win", "lose", "draw"]);
    await expectLine("승 1 패 1 무 1");
  });

  it("AC2-055: 빠른 연속 입력 N회는 유실·중복 없이 N건이 순서대로 저장된다", async () => {
    const values = [0, 0.4, 0.9, 0.4, 0, 0.9, 0.4];
    let i = 0;
    const random = vi.fn(() => values[i++ % values.length]);
    const user = userEvent.setup({ delay: null });
    const { env } = await renderGame(newEnv(), { random });
    const names = ["가위", "바위", "보"];
    for (let n = 0; n < 7; n++) await user.click(button(names[n % 3]));
    await settle(env);
    expect(env.mem.records()).toHaveLength(7);
    expect(env.mem.records().map((r) => r.seq)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(total()).toBe(7);
    expect(random).toHaveBeenCalledTimes(7);
  });

  it("같은 틱에 발생한 클릭 5회(동일 act 안)도 모두 처리·저장된다", async () => {
    const random = vi.fn(() => 0.4);
    const { env } = await renderGame(newEnv(), { random });
    const target = button("보");
    act(() => {
      for (let n = 0; n < 5; n++) target.click();
    });
    await settle(env);
    expect(env.mem.records()).toHaveLength(5);
    await expectLine("승 0 패 0 무 5");
  });

  it("타이머가 진행되지 않아도 연속 입력이 모두 처리된다(시간 기반 제한 없음)", async () => {
    const { env } = await renderGame();
    vi.useFakeTimers();
    try {
      fireEvent.click(button("가위"));
      fireEvent.click(button("가위"));
      fireEvent.click(button("가위"));
    } finally {
      vi.useRealTimers();
    }
    await settle(env);
    expect(env.mem.records()).toHaveLength(3);
  });

  it("연속 입력 40회 동안 입력이 차단되지 않고 결과 표시와 전적이 일치한다", async () => {
    let seed = 2024;
    const random = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const user = userEvent.setup({ delay: null });
    const { env } = await renderGame(newEnv(), { random });
    const names = ["가위", "바위", "보"];
    for (let n = 1; n <= 40; n++) {
      await user.click(button(names[(n * 5) % 3]));
      await waitFor(() => expect(total()).toBe(n));
      for (const name of names) expect((button(name) as HTMLButtonElement).disabled).toBe(false);
    }
    expect(env.mem.records()).toHaveLength(40);
  });
});

describe("영속성과 v1 전적 비이전", () => {
  it("새로고침(재마운트) 후 저장된 기록으로 전적이 복원되고 마지막 결과는 복원되지 않는다", async () => {
    const env = newEnv();
    const user = userEvent.setup();
    await renderGame(env, { random: () => 0.4 }); // 가위 vs 보 → 승
    await user.click(button("가위"));
    await user.click(button("가위"));
    await expectLine("승 2 패 0 무 0");
    cleanup();
    await renderGame(env);
    expect(line()).toBe("승 2 패 0 무 0");
    expect(status()).toBe(INITIAL_MESSAGE);
    expect(within(screen.getByRole("region", { name: "최근 라운드 결과" })).getAllByText("?")).toHaveLength(2);
  });

  it("전적은 저장된 기록에서 계산된 값과 항상 같다(합계 == 기록 수)", async () => {
    const user = userEvent.setup({ delay: null });
    const { env } = await renderGame(newEnv(), { random: () => 0.4 });
    for (let n = 0; n < 5; n++) await user.click(button("바위"));
    await waitFor(() => expect(total()).toBe(5));
    expect(total()).toBe(env.mem.records().length);
  });

  it("v1 localStorage 전적(rps-lab:score)은 읽지도 쓰지도 않는다(AC2-045~047)", async () => {
    window.localStorage.setItem("rps-lab:score", JSON.stringify({ wins: 9, losses: 9, draws: 9 }));
    const getSpy = vi.spyOn(Storage.prototype, "getItem");
    const setSpy = vi.spyOn(Storage.prototype, "setItem");
    const user = userEvent.setup();
    const { env } = await renderGame();
    expect(line()).toBe("승 0 패 0 무 0");
    await user.click(button("가위"));
    await settle(env);
    expect(getSpy).not.toHaveBeenCalled();
    expect(setSpy).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("rps-lab:score")).toBe('{"wins":9,"losses":9,"draws":9}');
    window.localStorage.clear();
  });

  it("StrictMode에서도 대결 N회 → 기록 N건(중복 저장 없음)", async () => {
    const user = userEvent.setup({ delay: null });
    const { env } = await renderGame(newEnv(), { strict: true, random: () => 0.4 });
    for (let n = 0; n < 4; n++) await user.click(button("가위"));
    await settle(env);
    expect(env.mem.records()).toHaveLength(4);
    await expectLine("승 4 패 0 무 0");
  });
});

describe("US4: 키보드 접근성 (v1 AC-013)", () => {
  it("세 버튼은 네이티브 button이며 Tab 순서는 직접→자동→가위→바위→보→전적 초기화이고 Shift+Tab은 역순이다", async () => {
    const user = userEvent.setup();
    await renderGame();
    for (const name of ["가위", "바위", "보"]) {
      const el = button(name);
      expect(el.tagName).toBe("BUTTON");
      expect((el as HTMLButtonElement).type).toBe("button");
      expect(el.hasAttribute("tabindex")).toBe(false);
    }
    await user.tab();
    expect(document.activeElement).toBe(button("직접 대결"));
    await user.tab();
    expect(document.activeElement).toBe(button("자동 대결"));
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

  it("라운드 후에도 포커스가 같은 버튼에 남아 키보드만으로 계속 플레이할 수 있다", async () => {
    const random = vi.fn(() => 0);
    const user = userEvent.setup();
    const { env } = await renderGame(newEnv(), { random });
    button("가위").focus();
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(button("가위"));
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    await settle(env);
    expect(random).toHaveBeenCalledTimes(3);
    expect(total()).toBe(3);
    expect(document.activeElement).toBe(button("가위"));
  });
});

describe("결과 영역 구조 (좌우 대결, 단일 role=status)", () => {
  const arena = () => screen.getByRole("region", { name: "최근 라운드 결과" });
  const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it("첫 라운드 전에는 중립적인 초기 화면(물음표, 승패 문구 없음)과 안내 문구", async () => {
    await renderGame();
    const region = arena();
    expect(within(region).getAllByText("?")).toHaveLength(2);
    for (const word of ["승리!", "패배", "무승부"]) expect(region.textContent).not.toContain(word);
    const matches = within(region).getAllByText(INITIAL_MESSAGE);
    expect(matches.filter((el) => el.getAttribute("aria-hidden") === "true")).toHaveLength(1);
    expect(matches.filter((el) => el.getAttribute("role") === "status")).toHaveLength(1);
  });

  it("라운드 후 왼쪽=나, 가운데=결과, 오른쪽=컴퓨터 순서이고 결과는 텍스트와 data-outcome으로 구분된다", async () => {
    const user = userEvent.setup();
    await renderGame(newEnv(), { random: () => 0 });
    await user.click(button("가위")); // 나: 가위 → 패배
    await waitFor(() => within(arena()).getByText("패배"));
    const region = arena();
    const me = within(region).getByText("나");
    const mine = within(region).getByText("가위");
    const outcome = within(region).getByText("패배");
    const cpu = within(region).getByText("컴퓨터");
    const theirs = within(region).getByText("바위");
    expect([before(me, mine), before(mine, outcome), before(outcome, cpu), before(cpu, theirs)]).toEqual([true, true, true, true]);
    expect(outcome.closest("[data-outcome]")?.getAttribute("data-outcome")).toBe("lose");
  });

  it("role=status는 정확히 1개이고 시각용 대결 영역은 aria-hidden이라 중복 낭독이 없다", async () => {
    const user = userEvent.setup();
    await renderGame(newEnv(), { random: () => 0.4 });
    await user.click(button("가위"));
    await waitFor(() => expect(status()).toBe("나: 가위 · 컴퓨터: 보 — 승리!"));
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.queryAllByText("승리!", { ignore: '[aria-hidden="true"], [aria-hidden="true"] *' })).toHaveLength(0);
  });
});

describe("모드 전환 (FR2-001·FR2-003)", () => {
  it("기본은 직접 대결이고 aria-pressed로 선택 상태가 전달된다", async () => {
    await renderGame();
    expect(button("직접 대결").getAttribute("aria-pressed")).toBe("true");
    expect(button("자동 대결").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("group", { name: "대결 모드" })).toBeTruthy();
  });

  it("자동 모드에서는 수동 선택 버튼이 없고 자동 UI가 있으며, 직접 모드에서는 반대다(P-3)", async () => {
    const user = userEvent.setup();
    await renderGame();
    expect(screen.queryByRole("button", { name: "자동 대결 시작" })).toBeNull();
    await toAuto(user);
    expect(screen.queryByRole("group", { name: "손 모양 선택" })).toBeNull();
    expect(button("자동 대결 시작")).toBeTruthy();
    expect(status()).toBe(AUTO_INITIAL);
    await user.click(button("직접 대결"));
    expect(screen.getByRole("group", { name: "손 모양 선택" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "자동 대결 시작" })).toBeNull();
  });

  it("매번 랜덤이면 손 고르기 그룹이 없고, 고정이면 있다(AC2-007)", async () => {
    const user = userEvent.setup();
    await renderGame();
    await toAuto(user);
    await user.click(button("매번 랜덤"));
    expect(screen.queryByRole("group", { name: "고정할 손" })).toBeNull();
    await user.click(button("고정 선택"));
    expect(screen.getByRole("group", { name: "고정할 손" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "내 손 선택" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "실행 방식" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "대결 횟수" })).toBeTruthy();
  });
});

describe("US2: 자동 대결 즉시 결과", () => {
  async function startInstant(count: string | RegExp, env = newEnv(), random: () => number = () => 0.4) {
    const user = userEvent.setup({ delay: null });
    await renderGame(env, { random });
    await toAuto(user);
    await user.click(button(count));
    await user.click(button("자동 대결 시작"));
    return { user, env };
  }

  it.each([
    ["10회", 10],
    ["100회", 100],
    ["1,000회", 1000],
  ])("%s: 정확히 그 횟수의 기록이 저장되고 전적·요약·낭독이 일치한다", async (label, n) => {
    const { env } = await startInstant(label);
    await screen.findByText(`자동 대결 ${n}회를 마쳤어요.`);
    expect(env.mem.records()).toHaveLength(n);
    expect(total()).toBe(n);
    // 난수 0.4: 내 손(매번 랜덤)도 컴퓨터도 보 → 모든 대결이 무승부
    expect(line()).toBe(`승 0 패 0 무 ${n}`);
    expect(status()).toBe(`자동 대결 ${n}회를 완료했어요. 승 0회, 패 0회, 무 ${n}회.`);
    expect(screen.queryByRole("progressbar")).toBeNull(); // 즉시 결과에는 진행 표시줄이 없다(P-6)
  });

  it("실행 중에는 저장 처리 중 상태가 보이고 진행 표시줄·중지가 없으며 입력이 잠긴다(FR2-009, P-6)", async () => {
    const env = newEnv();
    const resume = env.mem.pauseWrites();
    await startInstant("100회", env);
    expect(await screen.findByText("저장하며 실행하는 중…")).toBeTruthy();
    expect(status()).toBe("자동 대결 100회를 처리하고 저장하고 있어요.");
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByRole("button", { name: "중지" })).toBeNull();
    expect((button("직접 대결") as HTMLButtonElement).disabled).toBe(true);
    expect((button("자동 대결") as HTMLButtonElement).disabled).toBe(true);
    expect((button("매번 랜덤") as HTMLButtonElement).disabled).toBe(true);
    expect((button(/저장하며 실행하는 중/) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => resume());
    await screen.findByText("자동 대결 100회를 마쳤어요.");
  });

  it("고정 손이면 모든 대결의 내 손이 그 손이다", async () => {
    const user = userEvent.setup({ delay: null });
    const env = newEnv();
    await renderGame(env, { random: () => 0.4 });
    await toAuto(user);
    await user.click(button("고정 선택"));
    await user.click(button("보")); // 이모지는 aria-hidden이라 이름은 "보"
    await user.click(button("10회"));
    await user.click(button("자동 대결 시작"));
    await screen.findByText("자동 대결 10회를 마쳤어요.");
    expect(new Set(env.mem.records().map((r) => r.user))).toEqual(new Set(["paper"]));
    expect(line()).toBe("승 0 패 0 무 10"); // 보 vs 보(난수 0.4)
  });

  it("수동 대결과 자동 대결이 하나의 전적에 합산된다(FR2-010)", async () => {
    const user = userEvent.setup({ delay: null });
    const env = newEnv();
    await renderGame(env, { random: () => 0.4 });
    await user.click(button("가위")); // 승
    await expectLine("승 1 패 0 무 0");
    await toAuto(user);
    await user.click(button("10회"));
    await user.click(button("자동 대결 시작"));
    await screen.findByText("자동 대결 10회를 마쳤어요.");
    expect(total()).toBe(11);
    expect(env.mem.records()).toHaveLength(11);
    expect(env.mem.records()[0].seq).toBe(1);
  });
});

describe("US3: 애니메이션 자동 대결과 중지", () => {
  async function startAnimated(count = "10회", env = newEnv()) {
    const clock = manualClock();
    const user = userEvent.setup({ delay: null });
    await renderGame(env, { random: () => 0.4, wait: clock.wait });
    await toAuto(user);
    await user.click(button("애니메이션"));
    await user.click(button(count));
    await user.click(button("자동 대결 시작"));
    return { clock, user, env };
  }

  it("진행 횟수와 진행 표시줄이 표시되고 대결마다 낭독하지 않는다(P-7)", async () => {
    const { clock, env } = await startAnimated();
    await waitFor(() => expect(screen.getByRole("progressbar", { name: "자동 대결 진행" }).getAttribute("aria-valuenow")).toBe("1"));
    const bar = screen.getByRole("progressbar", { name: "자동 대결 진행" });
    expect(bar.getAttribute("aria-valuemax")).toBe("10");
    expect(bar.getAttribute("aria-valuetext")).toBe("1회 / 10회");
    expect(screen.getByText("1 / 10회")).toBeTruthy();
    expect(status()).toBe("자동 대결 10회를 시작했어요.");
    await clock.tick();
    await waitFor(() => expect(bar.getAttribute("aria-valuenow")).toBe("2"));
    expect(status()).toBe("자동 대결 10회를 시작했어요."); // 대결마다 바뀌지 않음
    expect(env.mem.records()).toHaveLength(2);
    expect(screen.getByRole("button", { name: "대결 진행 중…" })).toBeTruthy();
  });

  it("끝까지 실행하면 완료 요약과 문장 4가 나온다", async () => {
    const { clock } = await startAnimated();
    for (let i = 0; i < 9; i++) await clock.tick();
    await screen.findByText("자동 대결 10회를 마쳤어요.");
    expect(status()).toBe("자동 대결 10회를 완료했어요. 승 0회, 패 0회, 무 10회.");
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("중지하면 확정된 대결만 반영되고 이후 더 늘지 않는다(AC2-016, SC2-004)", async () => {
    const { clock, user, env } = await startAnimated("100회");
    await clock.tick();
    await clock.tick();
    await waitFor(() => expect(env.mem.records()).toHaveLength(3));
    await user.click(button("중지"));
    await screen.findByText("중지했어요.");
    const saved = env.mem.records().length;
    expect(saved).toBe(3);
    expect(status()).toBe(`자동 대결을 중지했어요. 100회 중 ${saved}회가 저장됐어요. 승 0회, 패 0회, 무 ${saved}회.`);
    expect(total()).toBe(saved);
    await new Promise((r) => setTimeout(r, 20));
    expect(env.mem.records()).toHaveLength(saved);
    expect(screen.queryByRole("progressbar")).toBeNull();
    // 중지 후 다시 입력 가능
    expect((button("자동 대결 시작") as HTMLButtonElement).disabled).toBe(false);
    expect((button("직접 대결") as HTMLButtonElement).disabled).toBe(false);
  });

  it("묶음 저장 중에 중지하면 그 묶음은 끝까지 저장된 뒤 중지되고, 중지 버튼은 비활성이 된다", async () => {
    const env = newEnv();
    const { user, clock } = await startAnimated("1,000회", env);
    await waitFor(() => expect(env.mem.records()).toHaveLength(10));
    const resume = env.mem.pauseWrites();
    await clock.tick(); // 두 번째 묶음이 저장 중(보류)
    await user.click(button("중지"));
    expect((button("중지") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => resume());
    await screen.findByText("중지했어요.");
    expect(env.mem.records()).toHaveLength(20); // 진행 중이던 묶음은 끝까지 저장됨
    expect(total()).toBe(20);
  });

  it("중지 요청 중 저장 실패가 나면 중지가 아니라 저장 실패 중단이 우선한다(G-8)", async () => {
    const env = newEnv();
    const { user, clock } = await startAnimated("1,000회", env);
    await waitFor(() => expect(env.mem.records()).toHaveLength(10));
    const resume = env.mem.pauseWrites();
    env.mem.fail.write = 1;
    await clock.tick(); // 두 번째 묶음이 저장 중(보류), 곧 실패한다
    await user.click(button("중지"));
    await act(async () => resume());
    await screen.findByText("저장 실패로 자동 대결을 중단했어요.");
    expect(screen.queryByText("중지했어요.")).toBeNull();
    expect(status()).toBe("저장에 실패해 자동 대결이 중단됐어요. 10회까지 저장됐어요.");
    expect(env.mem.records()).toHaveLength(10);
  });

  it("화면에서 떠나면(언마운트) 실행이 중단되고 확정된 기록만 남는다(G-9)", async () => {
    const { clock, env, ...rest } = await startAnimated("100회");
    await clock.tick();
    await waitFor(() => expect(env.mem.records()).toHaveLength(2));
    cleanup();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    const n = env.mem.records().length;
    expect(n).toBeLessThan(100);
    await new Promise((r) => setTimeout(r, 20));
    expect(env.mem.records()).toHaveLength(n);
    void rest;
  });

  it("pagehide에서도 같은 방식으로 중단된다", async () => {
    const { clock, env } = await startAnimated("100회");
    await clock.tick();
    await waitFor(() => expect(env.mem.records()).toHaveLength(2));
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    await screen.findByText("중지했어요.");
    const n = env.mem.records().length;
    await new Promise((r) => setTimeout(r, 20));
    expect(env.mem.records()).toHaveLength(n);
  });
});

describe("저장 실패와 읽기 실패 (이번 배치의 최소 동작)", () => {
  it("수동 저장 실패: 전적에 포함하지 않고 연습 대결로 표시하며 이후 입력도 저장하지 않는다(FR2-018, P-14)", async () => {
    const user = userEvent.setup({ delay: null });
    const env = newEnv();
    await renderGame(env, { random: () => 0.4 });
    await user.click(button("가위")); // 승(저장 성공)
    await expectLine("승 1 패 0 무 0");
    env.mem.fail.write = 1;
    await user.click(button("가위"));
    await waitFor(() => expect(status()).toBe("나: 가위 · 컴퓨터: 보 — 승리! (저장되지 않음 · 연습 대결)"));
    expect(line()).toBe("승 1 패 0 무 0"); // 임시 전적 없음
    expect(screen.getByText("저장되지 않음 · 연습 대결").closest('[aria-hidden="true"]')).not.toBeNull();
    await user.click(button("가위")); // 연습 대결(자동 재시도 없음)
    await user.click(button("가위"));
    await settle(env);
    expect(env.mem.records()).toHaveLength(1);
    expect(line()).toBe("승 1 패 0 무 0");
    expect(env.mem.log.filter((l) => l.startsWith("recordBattles"))).toHaveLength(2); // 성공 1 + 실패 1, 이후 시도 없음
  });

  it("저장 불가 상태에서는 자동 대결을 시작할 수 없다(AC2-071)", async () => {
    const user = userEvent.setup();
    const env = newEnv();
    await renderGame(env);
    env.mem.fail.write = 1;
    await user.click(button("가위"));
    await waitFor(() => expect(status()).toContain("연습 대결"));
    await toAuto(user);
    expect((button("자동 대결 시작") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("저장 불가 상태에서는 자동 대결을 시작할 수 없어요. 저장을 복구하면 가능해요.")).toBeTruthy();
  });

  it("자동 대결 중 저장 실패: 확정된 묶음까지만 반영하고 실패 요약·문장 5가 나온다(AC2-057)", async () => {
    const user = userEvent.setup({ delay: null });
    const env = newEnv();
    await renderGame(env, { random: () => 0.4 });
    await toAuto(user);
    await user.click(button("1,000회"));
    const original = env.mem.recordBattles;
    let n = 0;
    env.mem.recordBattles = async (items) => {
      if (++n === 3) env.mem.fail.write = 1;
      return original(items);
    };
    await user.click(button("자동 대결 시작"));
    await screen.findByText("저장 실패로 자동 대결을 중단했어요.");
    expect(env.mem.records()).toHaveLength(200);
    expect(total()).toBe(200);
    expect(status()).toBe("저장에 실패해 자동 대결이 중단됐어요. 200회까지 저장됐어요.");
    expect((button("자동 대결 시작") as HTMLButtonElement).disabled).toBe(true);
  });

  it("최초 읽기 실패: 전적은 0이 아니라 '—'로 표시되고 입력은 연습 대결로 처리된다(AC2-058)", async () => {
    const user = userEvent.setup();
    const env = newEnv();
    env.mem.fail.read = 1;
    await renderGame(env);
    expect(line()).toBe("승 —기록을 불러오지 못했어요 패 —기록을 불러오지 못했어요 무 —기록을 불러오지 못했어요");
    
    expect(screen.getAllByText("—")).toHaveLength(3);
    expect(screen.getAllByText("기록을 불러오지 못했어요")).toHaveLength(3);
    await user.click(button("가위"));
    await waitFor(() => expect(status()).toContain("연습 대결"));
    expect(env.mem.records()).toHaveLength(0);
    expect(env.store.gate()).toEqual({ closed: true, cause: "read" });
  });

  it("앱 내 이동 후 복귀(재마운트)해도 닫힌 게이트가 유지되어 연습 상태로 시작한다(G-2)", async () => {
    const user = userEvent.setup();
    const env = newEnv([{ user: "rock", computer: "scissors", at: 1 }]);
    await renderGame(env);
    env.mem.fail.write = 1;
    await user.click(button("가위"));
    await waitFor(() => expect(status()).toContain("연습 대결"));
    cleanup();
    await renderGame(env);
    expect(line()).toBe("승 1 패 0 무 0"); // 원인 write: 통계는 읽어 표시
    await user.click(button("가위"));
    await waitFor(() => expect(status()).toContain("연습 대결"));
    expect(env.mem.records()).toHaveLength(1);
  });
});

describe("저장 완료와 자동 실행 시작 사이의 경합 (whenIdle, G-3·G-11)", () => {
  it("저장 중인 수동 대결 직후 시작을 눌러도 수동 결과가 먼저 반영된 뒤 실행이 시작된다", async () => {
    const user = userEvent.setup({ delay: null });
    const env = newEnv();
    await renderGame(env, { random: () => 0.4 });
    await toAuto(user);
    await user.click(button("10회"));
    await user.click(button("직접 대결"));
    const resume = env.mem.pauseWrites();
    await user.click(button("가위")); // 저장 중(보류)
    await user.click(button("자동 대결"));
    await user.click(button("자동 대결 시작")); // whenIdle을 기다린다
    expect(screen.queryByText("저장하며 실행하는 중…")).toBeNull(); // 아직 시작 전
    await act(async () => resume());
    await screen.findByText("자동 대결 10회를 마쳤어요.");
    const recs = env.mem.records();
    expect(recs).toHaveLength(11);
    expect(recs[0]).toMatchObject({ seq: 1, user: "scissors" }); // 수동 대결이 먼저
    expect(total()).toBe(11);
  });

  it("선행 수동 저장이 실패하면 저장 불가가 반영된 뒤 시작 요청은 무시된다(자동 기록 0건)", async () => {
    const user = userEvent.setup({ delay: null });
    const env = newEnv();
    await renderGame(env, { random: () => 0.4 });
    const resume = env.mem.pauseWrites();
    env.mem.fail.write = 1;
    await user.click(button("가위"));
    await user.click(button("자동 대결"));
    await user.click(button("10회"));
    await user.click(button("자동 대결 시작"));
    await act(async () => resume());
    await waitFor(() => expect(screen.getByText("저장 불가 상태에서는 자동 대결을 시작할 수 없어요. 저장을 복구하면 가능해요.")).toBeTruthy());
    await settle(env);
    expect(env.mem.records()).toHaveLength(0);
    expect(screen.queryByText("저장하며 실행하는 중…")).toBeNull();
    expect(screen.queryByText(/자동 대결 10회를 마쳤어요/)).toBeNull();
  });

  it("시작 버튼을 연달아 눌러도 실행은 한 번만 된다(중복 시작 무시)", async () => {
    const user = userEvent.setup({ delay: null });
    const env = newEnv();
    await renderGame(env, { random: () => 0.4 });
    await toAuto(user);
    await user.click(button("10회"));
    const start = button("자동 대결 시작");
    act(() => {
      start.click();
      start.click();
      start.click();
    });
    await screen.findByText("자동 대결 10회를 마쳤어요.");
    await settle(env);
    expect(env.mem.records()).toHaveLength(10);
  });
});


describe("US5: 전적 초기화 (확인 후에만, 원자적)", () => {
  const dialog = () => screen.getByRole("alertdialog");
  const seeded = () =>
    newEnv([
      { user: "rock", computer: "scissors", at: 1 },
      { user: "rock", computer: "paper", at: 2 },
      { user: "rock", computer: "rock", at: 3 },
    ]);
  const hasClear = (env: Env) => env.mem.log.includes("clearAll");

  it("버튼은 즉시 초기화하지 않고 확인창을 연다: 제목·본문·접근성 속성, 포커스는 취소 버튼(요건 1)", async () => {
    const user = userEvent.setup();
    const env = seeded();
    await renderGame(env);
    await user.click(button("전적 초기화"));
    const d = dialog();
    expect(d.getAttribute("aria-modal")).toBe("true");
    expect(within(d).getByRole("heading", { name: "전적을 초기화할까요?" })).toBeTruthy();
    expect(d.getAttribute("aria-labelledby")).toBe("reset-title");
    expect(d.textContent).toContain("전체 전적과 모든 대결 기록이 삭제되며 되돌릴 수 없어요. 마지막 대결 결과도 함께 지워져요.");
    expect(document.activeElement).toBe(within(d).getByRole("button", { name: "취소" }));
    expect(hasClear(env)).toBe(false);
    expect(line()).toBe("승 1 패 1 무 1");
  });

  it("Tab·Shift+Tab은 대화상자 안에서 순환하고(요건 2), 배경에 inert가 걸렸다가 닫히면 풀린다", async () => {
    const user = userEvent.setup();
    const view = await renderGame(seeded());
    await user.click(button("전적 초기화"));
    const d = dialog();
    expect(view.container.hasAttribute("inert")).toBe(true); // jsdom은 inert를 구현하지 않으므로 속성만 확인
    for (let i = 0; i < 5; i++) {
      await user.tab();
      expect(d.contains(document.activeElement)).toBe(true);
    }
    for (let i = 0; i < 3; i++) {
      await user.tab({ shift: true });
      expect(d.contains(document.activeElement)).toBe(true);
    }
    await user.keyboard("{Escape}");
    expect(view.container.hasAttribute("inert")).toBe(false);
  });

  it("Esc·취소는 아무것도 바꾸지 않고 닫으며 포커스는 '전적 초기화' 버튼으로 복원된다(요건 3·4, AC2-060)", async () => {
    const user = userEvent.setup();
    const env = seeded();
    await renderGame(env);
    await user.click(button("전적 초기화"));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(button("전적 초기화"));
    await user.click(button("전적 초기화"));
    await user.click(within(dialog()).getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(button("전적 초기화"));
    expect(hasClear(env)).toBe(false);
    expect(env.mem.records()).toHaveLength(3);
    expect(line()).toBe("승 1 패 1 무 1");
  });

  it("전체 삭제: 전적·기록·마지막 결과가 함께 초기화되고 낭독되며 포커스가 복원된다(AC2-041·042)", async () => {
    const user = userEvent.setup();
    const env = seeded();
    await renderGame(env, { random: () => 0.4 });
    await user.click(button("가위"));
    await expectLine("승 2 패 1 무 1");
    await user.click(button("전적 초기화"));
    await user.click(within(dialog()).getByRole("button", { name: "전체 삭제" }));
    await waitFor(() => expect(status()).toBe("누적 전적과 대결 기록을 모두 초기화했어요."));
    expect(line()).toBe("승 0 패 0 무 0");
    expect(env.mem.records()).toHaveLength(0);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(within(screen.getByRole("region", { name: "최근 라운드 결과" })).getAllByText("?")).toHaveLength(2);
    await waitFor(() => expect(document.activeElement).toBe(button("전적 초기화")));
    // 초기화 뒤 새 대결은 seq 1부터 저장된다
    await user.click(button("가위"));
    await waitFor(() => expect(env.mem.records().map((r) => r.seq)).toEqual([1]));
  });

  it("초기화 중에는 진행 안내가 보이고 버튼이 비활성(aria-busy)이며 포커스는 안내로 이동했다가 끝나면 복원된다(AC2-061)", async () => {
    const user = userEvent.setup();
    const env = seeded();
    await renderGame(env);
    const resume = env.mem.pauseWrites();
    await user.click(button("전적 초기화"));
    await user.click(within(dialog()).getByRole("button", { name: "전체 삭제" }));
    const busy = await screen.findByText(/초기화하는 중이에요\. 잠시 기다려 주세요\./);
    expect((button("전적 초기화") as HTMLButtonElement).disabled).toBe(true);
    expect(button("전적 초기화").getAttribute("aria-busy")).toBe("true");
    expect(document.activeElement).toBe(busy);
    expect(busy.closest("[role]")).toBeNull(); // live region 아님
    expect((button("직접 대결") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => resume());
    await waitFor(() => expect(document.activeElement).toBe(button("전적 초기화")));
    expect(line()).toBe("승 0 패 0 무 0");
  });

  it("FIFO: 진행 중이던 저장이 끝난 뒤에 초기화된다", async () => {
    const user = userEvent.setup({ delay: null });
    const env = newEnv();
    await renderGame(env);
    const resume = env.mem.pauseWrites();
    await user.click(button("가위")); // 저장 보류
    await user.click(button("전적 초기화"));
    await user.click(within(dialog()).getByRole("button", { name: "전체 삭제" }));
    await act(async () => resume());
    await waitFor(() => expect(line()).toBe("승 0 패 0 무 0"));
    expect(env.mem.log.filter((l) => l === "clearAll" || l.startsWith("recordBattles"))).toEqual(["recordBattles:1", "clearAll"]);
    expect(env.mem.records()).toHaveLength(0);
  });

  it("초기화 실패는 성공으로 표시하지 않는다: 데이터·전적 불변, role=alert, 다시 시도 가능(AC2-043)", async () => {
    const user = userEvent.setup();
    const env = seeded();
    await renderGame(env);
    env.mem.fail.clear = 1;
    await user.click(button("전적 초기화"));
    await user.click(within(dialog()).getByRole("button", { name: "전체 삭제" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("초기화하지 못했어요");
    expect(alert.textContent).toContain("전적과 기록은 아무것도 지워지지 않았어요");
    expect(line()).toBe("승 1 패 1 무 1");
    expect(env.mem.records()).toHaveLength(3);
    expect(status()).not.toContain("초기화했어요");
    await waitFor(() => expect(document.activeElement).toBe(button("전적 초기화")));
    // 다시 시도하면 성공하고 실패 안내는 사라진다
    await user.click(button("전적 초기화"));
    await user.click(within(dialog()).getByRole("button", { name: "전체 삭제" }));
    await waitFor(() => expect(line()).toBe("승 0 패 0 무 0"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("자동 대결 실행 중에는 초기화할 수 없고 안내가 보인다(P-4)", async () => {
    const user = userEvent.setup({ delay: null });
    const clock = manualClock();
    await renderGame(newEnv(), { wait: clock.wait });
    await toAuto(user);
    await user.click(button("애니메이션"));
    await user.click(button("자동 대결 시작"));
    await screen.findByRole("progressbar");
    expect((button("전적 초기화") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("자동 대결 중에는 초기화할 수 없어요. 먼저 중지하세요.")).toBeTruthy();
    await user.click(button("중지"));
    await screen.findByText("중지했어요.");
    expect((button("전적 초기화") as HTMLButtonElement).disabled).toBe(false);
  });

  it("읽기 실패·손상 상태에서도 초기화로 탈출할 수 있다(FR2-019)", async () => {
    const user = userEvent.setup();
    const env = seeded();
    env.mem.fail.read = 1;
    await renderGame(env);
    expect(screen.getByRole("alert").textContent).toContain("저장된 전적을 불러오지 못했어요");
    await user.click(button("전적 초기화"));
    await user.click(within(dialog()).getByRole("button", { name: "전체 삭제" }));
    await waitFor(() => expect(env.mem.records()).toHaveLength(0));
    await waitFor(() => expect(line()).toBe("승 0 패 0 무 0"));
  });
});

describe("US6: 저장 안내, 연습 대결, 재시도와 복구", () => {
  const alertBox = () => screen.getByRole("alert");
  const failSave = async (env: Env, user: ReturnType<typeof userEvent.setup>) => {
    env.mem.fail.write = 1;
    await user.click(button("가위"));
    await waitFor(() => expect(status()).toContain("연습 대결"));
  };

  it("수동 저장 실패: role=alert 박스(문구·재시도 버튼), 연습 칩, 전적 불변(AC2-034~036)", async () => {
    const user = userEvent.setup();
    const env = newEnv();
    await renderGame(env, { random: () => 0.4 });
    await failSave(env, user);
    const box = alertBox();
    expect(box.textContent).toContain("기록을 저장하지 못했어요");
    expect(box.textContent).toContain("저장 불가 상태예요. 지금부터의 직접 대결은 연습 대결이며 전적과 기록에 반영되지 않아요.");
    expect(within(box).getByRole("button", { name: "저장 다시 시도" })).toBeTruthy();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(line()).toBe("승 0 패 0 무 0");
  });

  it("재시도 성공: 복구됨 안내와 낭독, 연습 결과 제거, 이후 대결은 저장된다(AC2-070, P-14)", async () => {
    const user = userEvent.setup();
    const env = newEnv([{ user: "rock", computer: "scissors", at: 1 }]);
    await renderGame(env, { random: () => 0.4 });
    await failSave(env, user);
    await user.click(button("저장 다시 시도"));
    await screen.findByText("저장이 복구되었어요");
    expect(status()).toBe("저장이 복구되었어요. 지금부터 대결이 기록돼요. 복구 전의 연습 대결은 저장되지 않아요.");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("저장되지 않음 · 연습 대결")).toBeNull();
    expect(within(screen.getByRole("region", { name: "최근 라운드 결과" })).getAllByText("?")).toHaveLength(2);
    expect(line()).toBe("승 1 패 0 무 0");
    expect(env.store.gate()).toEqual({ closed: false });
    await user.click(button("가위"));
    await waitFor(() => expect(env.mem.records()).toHaveLength(2));
    await expectLine("승 2 패 0 무 0");
    expect(screen.queryByText("저장이 복구되었어요")).toBeNull(); // 다음 확정 대결에서 해제
  });

  it("복구됨 안내는 모드 전환으로는 해제되지 않고 초기화 성공에서 해제된다", async () => {
    const user = userEvent.setup();
    const env = newEnv();
    await renderGame(env);
    await failSave(env, user);
    await user.click(button("저장 다시 시도"));
    await screen.findByText("저장이 복구되었어요");
    await user.click(button("자동 대결"));
    await user.click(button("직접 대결"));
    expect(screen.getByText("저장이 복구되었어요")).toBeTruthy();
    await user.click(button("전적 초기화"));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "전체 삭제" }));
    await waitFor(() => expect(screen.queryByText("저장이 복구되었어요")).toBeNull());
  });

  it("재시도 실패: 박스·연습 상태 유지, 숨은 role=alert 문장, 버튼 재활성, 다음 재시도 성공(P-14)", async () => {
    const user = userEvent.setup();
    const env = newEnv();
    await renderGame(env);
    await failSave(env, user);
    env.mem.fail.probe = 1;
    await user.click(button("저장 다시 시도"));
    await waitFor(() => expect(screen.getByText("저장을 다시 시도했지만 실패했어요. 연습 대결은 계속할 수 있어요.")).toBeTruthy());
    const hidden = screen.getByText("저장을 다시 시도했지만 실패했어요. 연습 대결은 계속할 수 있어요.");
    expect(hidden.getAttribute("role")).toBe("alert");
    expect((button("저장 다시 시도") as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("기록을 저장하지 못했어요")).toBeTruthy();
    // 연습 대결은 계속 가능하며 저장되지 않는다
    await user.click(button("가위"));
    await settle(env);
    expect(env.mem.records()).toHaveLength(0);
    await user.click(button("저장 다시 시도"));
    await screen.findByText("저장이 복구되었어요");
  });

  it("재시도 중에는 '다시 시도하는 중…'(aria-busy, 비활성)과 재시도 중 문장이 보이고 초기화는 막힌다(G-6)", async () => {
    const user = userEvent.setup();
    const env = newEnv();
    await renderGame(env);
    await failSave(env, user);
    let release!: () => void;
    const gateP = new Promise<void>((r) => (release = r));
    const origProbe = env.mem.probeWrite;
    env.mem.probeWrite = async () => {
      await gateP;
      return origProbe();
    };
    await user.click(button("저장 다시 시도"));
    const retrying = await screen.findByRole("button", { name: "다시 시도하는 중…" });
    expect((retrying as HTMLButtonElement).disabled).toBe(true);
    expect(retrying.getAttribute("aria-busy")).toBe("true");
    expect(status()).toBe("저장소를 다시 확인하는 중이에요");
    expect((button("전적 초기화") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => release());
    await screen.findByText("저장이 복구되었어요");
  });

  it("초기화 중에는 저장 다시 시도가 비활성이다(G-6)", async () => {
    const user = userEvent.setup();
    const env = newEnv();
    await renderGame(env);
    await failSave(env, user);
    const resume = env.mem.pauseWrites();
    await user.click(button("전적 초기화"));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "전체 삭제" }));
    await screen.findByText(/초기화하는 중이에요/);
    expect((button("저장 다시 시도") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => resume());
    await waitFor(() => expect((button("저장 다시 시도") as HTMLButtonElement).disabled).toBe(false));
  });

  it("자동 대결 저장 실패 중단: 박스는 live 없이 표시되고 낭독은 5번 문장이 맡는다", async () => {
    const user = userEvent.setup({ delay: null });
    const env = newEnv();
    await renderGame(env, { random: () => 0.4 });
    await toAuto(user);
    await user.click(button("1,000회"));
    const original = env.mem.recordBattles;
    let n = 0;
    env.mem.recordBattles = async (items) => {
      if (++n === 2) env.mem.fail.write = 1;
      return original(items);
    };
    await user.click(button("자동 대결 시작"));
    const title = await screen.findByText("기록을 저장하지 못했어요");
    expect(title.closest('[role="alert"]')).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(status()).toBe("저장에 실패해 자동 대결이 중단됐어요. 100회까지 저장됐어요.");
    // 복구하면 다시 실행할 수 있다
    await user.click(button("저장 다시 시도"));
    await screen.findByText("저장이 복구되었어요");
    expect((button("자동 대결 시작") as HTMLButtonElement).disabled).toBe(false);
    expect(total()).toBe(100);
    expect(env.mem.records()).toHaveLength(100); // SC2-002: 합계 == 기록 수
  });

  it("읽기 실패: role=alert 박스와 '—' 전적, 재시도 성공 시 저장된 전적이 표시된다(AC2-058)", async () => {
    const user = userEvent.setup();
    const env = newEnv([
      { user: "rock", computer: "scissors", at: 1 },
      { user: "rock", computer: "scissors", at: 2 },
    ]);
    env.mem.fail.read = 1;
    await renderGame(env);
    const box = alertBox();
    expect(box.textContent).toContain("저장된 전적을 불러오지 못했어요");
    expect(box.textContent).toContain("전적이 0이라는 뜻은 아니에요");
    expect(screen.getAllByText("—")).toHaveLength(3);
    await user.click(within(box).getByRole("button", { name: "저장 다시 시도" }));
    await screen.findByText("저장이 복구되었어요");
    expect(line()).toBe("승 2 패 0 무 0");
  });

  it("읽기 실패 후 재시도도 실패하면 연습 상태가 유지되고 전적은 계속 '—'이다", async () => {
    const user = userEvent.setup();
    const env = newEnv();
    env.mem.fail.read = 2; // 최초 읽기 + 재시도의 읽기
    await renderGame(env);
    await user.click(button("저장 다시 시도"));
    await waitFor(() => expect(screen.getByText("저장을 다시 시도했지만 실패했어요. 연습 대결은 계속할 수 있어요.")).toBeTruthy());
    expect(screen.getAllByText("—")).toHaveLength(3);
    expect(env.store.gate().closed).toBe(true);
  });
});
