import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppHeader, { normalizePath } from "./AppHeader";

let mockPath: string | null = "/";
vi.mock("next/navigation", () => ({ usePathname: () => mockPath }));

afterEach(() => cleanup());

const current = () => within(screen.getByRole("navigation", { name: "페이지" })).queryAllByRole("link").filter((a) => a.getAttribute("aria-current") === "page");

describe("AppHeader", () => {
  it("banner 안에 h1 '가위바위보'와 별도 부제, 탐색 링크 2개가 있다", () => {
    mockPath = "/";
    render(<AppHeader />);
    const banner = screen.getByRole("banner");
    expect(within(banner).getByRole("heading", { level: 1 }).textContent).toBe("가위바위보");
    expect(within(banner).getByText("RPS Lab v2")).toBeTruthy();
    const links = within(screen.getByRole("navigation", { name: "페이지" })).getAllByRole("link");
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["게임", "/"],
      ["기록 · 통계", "/history"],
    ]);
  });

  it.each([
    ["/", "게임"],
    ["/history", "기록 · 통계"],
    ["/history/", "기록 · 통계"], // trailingSlash 배포: usePathname은 끝 슬래시를 포함한다
    [null, "게임"],
  ])("경로 %s → 현재 위치는 %s 하나뿐이다", (path, label) => {
    mockPath = path;
    render(<AppHeader />);
    expect(current().map((a) => a.textContent)).toEqual([label]);
  });

  it("경로 문자열을 화면에 출력하지 않는다(404 하이드레이션 경고 방지)", () => {
    mockPath = "/history/";
    render(<AppHeader />);
    expect(document.body.textContent).not.toContain("/history");
  });

  it("normalizePath", () => {
    expect(normalizePath("/history/")).toBe("/history");
    expect(normalizePath("/history//")).toBe("/history");
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("")).toBe("/");
  });

  it("링크는 프리패치하지 않는다(D5 (a)): 로드 시 fetch가 없다", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<AppHeader />);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
