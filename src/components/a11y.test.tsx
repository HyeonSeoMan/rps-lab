import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import Game from "./Game";
import AppHeader from "./AppHeader";
import History from "./history/History";
import { createQueuedStore } from "@/lib/save-queue";
import { createMemoryStore } from "@/test-utils/memory-store";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
afterEach(() => cleanup());

const env = (n = 0) => {
  const mem = createMemoryStore(Array.from({ length: n }, (_, i) => ({ user: "rock" as const, computer: "paper" as const, at: i })));
  return { mem, store: createQueuedStore(mem) };
};

/** 모든 버튼·링크가 접근 가능한 이름과 네이티브 요소를 가지는지 확인한다(AC2-051, SC2-005). */
function expectNamedControls(root: HTMLElement = document.body) {
  for (const b of within(root).queryAllByRole("button")) {
    expect(b.tagName).toBe("BUTTON");
    expect((b as HTMLButtonElement).type).toBe("button");
    expect(b.hasAttribute("tabindex")).toBe(false);
    expect((b.textContent ?? "").replace(/\s+/g, "").length, `이름 없는 버튼: ${b.outerHTML}`).toBeGreaterThan(0);
  }
  for (const a of within(root).queryAllByRole("link")) expect((a.textContent ?? "").trim().length).toBeGreaterThan(0);
}

describe("접근성 구조 (UI Contract 1~7절)", () => {
  it("게임 페이지(직접): role=status 정확히 1개, alert 없음, 이름 있는 그룹·네이티브 버튼, 토글은 aria-pressed", async () => {
    const e = env();
    render(
      <>
        <AppHeader />
        <Game store={e.store} />
      </>,
    );
    await screen.findByRole("list", { name: "누적 전적" });
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("banner")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "페이지" })).toBeTruthy();
    expect(screen.getByRole("main")).toBeTruthy();
    expect(screen.getByRole("group", { name: "대결 모드" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "손 모양 선택" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "최근 라운드 결과" })).toBeTruthy();
    for (const name of ["직접 대결", "자동 대결"]) expect(screen.getByRole("button", { name }).hasAttribute("aria-pressed")).toBe(true);
    expectNamedControls();
    // 장식 이모지·시각 대결 영역은 접근성 트리에서 숨김
    expect(document.querySelector('[aria-label="최근 라운드 결과"] [aria-hidden="true"]')).not.toBeNull();
  });

  it("게임 페이지(자동): 그룹 이름 3개, 모든 설정 버튼에 aria-pressed, status 1개 유지", async () => {
    const user = userEvent.setup();
    render(<Game store={env().store} />);
    await screen.findByRole("list", { name: "누적 전적" });
    await user.click(screen.getByRole("button", { name: "자동 대결" }));
    for (const name of ["내 손 선택", "실행 방식", "대결 횟수"]) expect(screen.getByRole("group", { name })).toBeTruthy();
    for (const name of ["고정 선택", "매번 랜덤", "즉시 결과", "애니메이션", "10회", "100회", "1,000회"]) {
      expect(screen.getByRole("button", { name }).hasAttribute("aria-pressed"), name).toBe(true);
    }
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expectNamedControls();
  });

  it("진행 표시줄은 현재 값을 전달하고(즉시 결과에는 없음), 확인창은 alertdialog로 이름·설명이 연결된다", async () => {
    const user = userEvent.setup({ delay: null });
    const waiters: Array<() => void> = [];
    const wait = (_: number, s: AbortSignal) => new Promise<void>((r) => (s.aborted ? r() : (waiters.push(r), s.addEventListener("abort", () => r()))));
    render(<Game store={env().store} wait={wait} />);
    await screen.findByRole("list", { name: "누적 전적" });
    await user.click(screen.getByRole("button", { name: "자동 대결" }));
    await user.click(screen.getByRole("button", { name: "애니메이션" }));
    await user.click(screen.getByRole("button", { name: "자동 대결 시작" }));
    const bar = await screen.findByRole("progressbar", { name: "자동 대결 진행" });
    for (const a of ["aria-valuemin", "aria-valuemax", "aria-valuenow", "aria-valuetext"]) expect(bar.hasAttribute(a)).toBe(true);
    await user.click(screen.getByRole("button", { name: "중지" }));
    await screen.findByText("중지했어요.");
    await user.click(screen.getByRole("button", { name: "전적 초기화" }));
    const d = screen.getByRole("alertdialog");
    expect(d.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(d.getAttribute("aria-labelledby")!)?.textContent).toBe("전적을 초기화할까요?");
    expect(document.getElementById(d.getAttribute("aria-describedby")!)?.textContent).toContain("되돌릴 수 없어요");
    expectNamedControls(d);
  });

  it("기록 페이지: h2 두 개, 표 머리글 scope, 이전/다음 탐색 이름, 막대는 aria-hidden, 카드 목록은 list", async () => {
    render(
      <>
        <AppHeader />
        <History store={env(25).store} />
      </>,
    );
    await screen.findByRole("table", { name: "전체 대결 기록" });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["통계", "전체 대결 기록"]);
    expect(screen.getAllByRole("columnheader").every((h) => h.getAttribute("scope") === "col")).toBe(true);
    expect(screen.getByRole("navigation", { name: "기록 페이지 이동" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "전체 대결 기록" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "누적 전적" })).toBeTruthy();
    expect(document.querySelector('[aria-hidden="true"] > i')).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expectNamedControls();
  });

  it("키보드만으로 직접 대결 → 자동 대결 설정·시작 → 확인창 초기화까지 모두 가능하다(AC2-051)", async () => {
    const user = userEvent.setup({ delay: null });
    const e = env();
    render(<Game store={e.store} random={() => 0.4} />);
    await screen.findByRole("list", { name: "누적 전적" });
    // 접근 가능한 이름(aria-hidden 장식 제외)
    const nameOf = (el: Element | null) => {
      const c = el?.cloneNode(true) as HTMLElement | undefined;
      c?.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
      return (c?.textContent ?? "").replace(/\s+/g, " ").trim();
    };
    const tabTo = async (name: string) => {
      for (let i = 0; i < 30 && nameOf(document.activeElement) !== name; i++) await user.tab();
      expect(nameOf(document.activeElement)).toBe(name);
    };
    await tabTo("가위");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(e.mem.records()).toHaveLength(1));
    await tabTo("자동 대결");
    await user.keyboard(" ");
    expect(screen.getByRole("button", { name: "자동 대결" }).getAttribute("aria-pressed")).toBe("true");
    await tabTo("10회");
    await user.keyboard("{Enter}");
    await tabTo("자동 대결 시작");
    await user.keyboard("{Enter}");
    await screen.findByText("자동 대결 10회를 마쳤어요.");
    expect(e.mem.records()).toHaveLength(11);
    await tabTo("전적 초기화");
    await user.keyboard("{Enter}");
    expect(nameOf(document.activeElement)).toBe("취소");
    await user.tab();
    expect(nameOf(document.activeElement)).toBe("전체 삭제");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(e.mem.records()).toHaveLength(0));
    await act(async () => e.store.whenIdle());
  });
});
