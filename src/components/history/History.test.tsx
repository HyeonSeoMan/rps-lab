import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import History from "./History";
import { createQueuedStore } from "@/lib/save-queue";
import { createMemoryStore, type MemoryStore } from "@/test-utils/memory-store";
import type { BattleDraft } from "@/lib/battle";
import { judge, type Choice } from "@/lib/rps";

afterEach(() => cleanup());

const HANDS: Choice[] = ["rock", "paper", "scissors"];
/** n건: 순번 i는 (내 손 i%3, 컴퓨터 (i*7+1)%3). at은 고정 시각. */
const make = (n: number): BattleDraft[] =>
  Array.from({ length: n }, (_, i) => ({ user: HANDS[i % 3], computer: HANDS[(i * 7 + 1) % 3], at: new Date(2026, 10, 5, 18, 30).getTime() + i * 60000 }));

function env(n: number) {
  const mem: MemoryStore = createMemoryStore(make(n));
  return { mem, store: createQueuedStore(mem) };
}
const settled = async () => {
  await waitFor(() => expect(screen.queryByRole("status", { name: "기록을 불러오는 중" })).toBeNull());
};
const rowSeqs = () =>
  within(screen.getByRole("table", { name: "전체 대결 기록" }))
    .getAllByRole("row")
    .slice(1)
    .map((r) => Number(r.querySelector("td")?.textContent));
const summaryNumbers = () => {
  const stats = within(screen.getByRole("list", { name: "누적 전적" })).getAllByRole("listitem").map((li) => li.textContent);
  return stats;
};

describe("기록·통계 페이지", () => {
  it("통계 제목·요약·승/패/무 카드·비율 막대 범례가 저장된 기록과 일치한다(FR2-011·FR2-017·FR2-024)", async () => {
    const e = env(30);
    render(<History store={e.store} />);
    await settled();
    const recs = e.mem.records();
    const w = recs.filter((r) => judge(r.user, r.computer) === "win").length;
    const l = recs.filter((r) => judge(r.user, r.computer) === "lose").length;
    const d = 30 - w - l;
    expect(screen.getByRole("heading", { level: 2, name: "통계" })).toBeTruthy();
    expect(summaryNumbers()).toEqual([`승 ${w}`, `패 ${l}`, `무 ${d}`]);
    expect(screen.getByText("총 대결").nextElementSibling?.textContent).toBe("30회");
    expect(screen.getByText("승률 (무승부 포함)").nextElementSibling?.textContent).toBe(`${((w / 30) * 100).toFixed(1)}%`);
    expect(screen.getByText(`승 ${((w / 30) * 100).toFixed(1)}%`)).toBeTruthy();
    expect(screen.getByText(`패 ${((l / 30) * 100).toFixed(1)}%`)).toBeTruthy();
    expect(screen.getByText(`무 ${((d / 30) * 100).toFixed(1)}%`)).toBeTruthy();
    expect(w + l + d).toBe(30);
    expect(screen.getByText("저장된 대결").nextElementSibling?.textContent).toBe("30회");
    // 막대 폭 = 실제 비율, 장식이라 aria-hidden
    const bar = document.querySelector('[aria-hidden="true"] > i') as HTMLElement;
    expect(bar.parentElement?.getAttribute("aria-hidden")).toBe("true");
    const widths = [...bar.parentElement!.children].map((i) => parseFloat((i as HTMLElement).style.width));
    expect(widths[0]).toBeCloseTo((w / 30) * 100, 5);
    expect(widths[1]).toBeCloseTo((l / 30) * 100, 5);
    expect(widths[2]).toBeCloseTo((d / 30) * 100, 5);
  });

  it("0건: 빈 상태 문구, 0회/0.0%, 빈 막대, 범례 0.0%(AC2-024)", async () => {
    render(<History store={env(0).store} />);
    await settled();
    expect(screen.getByText("아직 대결 기록이 없어요.", { exact: false })).toBeTruthy();
    expect(screen.getByText("총 대결").nextElementSibling?.textContent).toBe("0회");
    expect(screen.getByText("승률 (무승부 포함)").nextElementSibling?.textContent).toBe("0.0%");
    expect(screen.getByText("승 0.0%")).toBeTruthy();
    expect(document.querySelector('[aria-hidden="true"] > i')).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "기록 페이지 이동" })).toBeNull();
  });

  it("읽는 중에는 로딩(role=status, aria-busy)과 '—'가 보이고 이미 수락된 저장이 반영된 뒤 읽는다", async () => {
    const e = env(0);
    const resume = e.mem.pauseWrites();
    const w = e.store.recordBattles([{ user: "rock", computer: "scissors", at: 1 }]);
    render(<History store={e.store} />);
    const loading = screen.getByRole("status", { name: "기록을 불러오는 중" });
    expect(loading.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("기록을 불러오는 중이에요…")).toBeTruthy();
    expect(screen.getByText("저장된 대결").nextElementSibling?.textContent).toBe("—");
    resume();
    await w;
    await settled();
    expect(screen.getByText("저장된 대결").nextElementSibling?.textContent).toBe("1회");
  });

  it("최신순 20건 표(th scope=col), 일시 형식, 결과는 텍스트로도 구분된다(FR2-012·FR2-013, P-1)", async () => {
    const e = env(55);
    render(<History store={e.store} />);
    await settled();
    const table = screen.getByRole("table", { name: "전체 대결 기록" });
    const heads = within(table).getAllByRole("columnheader");
    expect(heads.map((h) => [h.textContent, h.getAttribute("scope")])).toEqual([
      ["#", "col"], ["시간", "col"], ["나", "col"], ["컴퓨터", "col"], ["결과", "col"],
    ]);
    const seqs = rowSeqs();
    expect(seqs).toHaveLength(20); // 전체를 한 번에 렌더링하지 않는다
    expect(seqs).toEqual(Array.from({ length: 20 }, (_, i) => 55 - i));
    const first = within(table).getAllByRole("row")[1];
    const rec = e.mem.records()[54];
    expect(within(first).getAllByRole("cell")[1].textContent).toMatch(/^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}$/);
    const label = { win: "승리", lose: "패배", draw: "무승부" }[judge(rec.user, rec.computer)];
    expect(within(first).getAllByRole("cell")[4].textContent).toBe(label);
    // 카드 목록도 같은 정보·순서(표시 전환은 CSS)
    const cards = screen.getByRole("list", { name: "전체 대결 기록" });
    expect(within(cards).getAllByRole("listitem")).toHaveLength(20);
    expect(within(cards).getAllByRole("listitem")[0].textContent).toContain(`#55`);
    expect(within(cards).getAllByRole("listitem")[0].textContent).toContain(label);
  });

  it("페이지네이션: 55건 = 3페이지, 누락·중복 없이 이전/다음, 경계 버튼 비활성(FR2-013)", async () => {
    const user = userEvent.setup();
    const e = env(55);
    render(<History store={e.store} />);
    await settled();
    const nav = screen.getByRole("navigation", { name: "기록 페이지 이동" });
    const prev = () => within(nav).getByRole("button", { name: "이전" }) as HTMLButtonElement;
    const next = () => within(nav).getByRole("button", { name: "다음" }) as HTMLButtonElement;
    expect(nav.textContent).toContain("1 / 3");
    expect(prev().disabled).toBe(true);
    const all: number[] = [...rowSeqs()];
    await user.click(next());
    await waitFor(() => expect(nav.textContent).toContain("2 / 3"));
    all.push(...rowSeqs());
    expect(prev().disabled).toBe(false);
    await user.click(next());
    await waitFor(() => expect(nav.textContent).toContain("3 / 3"));
    all.push(...rowSeqs());
    expect(rowSeqs()).toHaveLength(15);
    expect(next().disabled).toBe(true);
    expect(all).toEqual(Array.from({ length: 55 }, (_, i) => 55 - i));
    await user.click(prev());
    await waitFor(() => expect(nav.textContent).toContain("2 / 3"));
    expect(rowSeqs()).toEqual(Array.from({ length: 20 }, (_, i) => 35 - i));
    await user.click(prev());
    await waitFor(() => expect(nav.textContent).toContain("1 / 3"));
    expect(rowSeqs()[0]).toBe(55);
  });

  it("정확히 20건이면 다음 페이지가 없다", async () => {
    render(<History store={env(20).store} />);
    await settled();
    expect(screen.getByRole("navigation", { name: "기록 페이지 이동" }).textContent).toContain("1 / 1");
    expect((screen.getByRole("button", { name: "다음" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("같은 틱에 '다음'을 여러 번 눌러도 페이지를 건너뛰지 않는다(요청 번호)", async () => {
    const e = env(55);
    render(<History store={e.store} />);
    await settled();
    const next = screen.getByRole("button", { name: "다음" });
    act(() => {
      next.click();
      next.click();
      next.click();
    });
    await waitFor(() => expect(screen.getByRole("navigation", { name: "기록 페이지 이동" }).textContent).toContain("2 / 3"));
    expect(rowSeqs()[0]).toBe(35);
  });

  it("조회 오류: role=alert와 '저장 다시 시도', 통계는 '—', 카드별 읽기 실패 문구(AC2-058)", async () => {
    const user = userEvent.setup();
    const e = env(5);
    e.mem.fail.read = 1;
    render(<History store={e.store} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("기록을 불러오지 못했어요");
    expect(alert.textContent).toContain("저장소를 읽는 중 문제가 생겼어요.");
    expect(screen.getByText("총 대결").nextElementSibling?.textContent).toBe("—");
    expect(screen.getByText("승률 (무승부 포함)").nextElementSibling?.textContent).toBe("—");
    expect(summaryNumbers().map((t) => t?.replace("—", ""))).toEqual([
      "승 기록을 불러오지 못했어요", "패 기록을 불러오지 못했어요", "무 기록을 불러오지 못했어요",
    ]);
    expect(e.store.gate()).toEqual({ closed: true, cause: "read" }); // 게임 페이지에서도 저장 불가(읽기)로 시작
    // 재시도 성공 → 기록 표시, 게이트 해제
    await user.click(within(alert).getByRole("button", { name: "저장 다시 시도" }));
    await waitFor(() => expect(screen.getByText("저장된 대결").nextElementSibling?.textContent).toBe("5회"));
    expect(e.store.gate()).toEqual({ closed: false });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("목록 조회만 실패하면(통계 읽기는 성공) 오류를 보이되 저장 게이트는 닫지 않아 게임 저장을 막지 않는다(계약 3.2)", async () => {
    const e = env(5);
    const original = e.mem.listBattles;
    let fail = true;
    e.mem.listBattles = async (q) => {
      if (fail) throw new Error("list failed");
      return original(q);
    };
    render(<History store={e.store} />);
    await screen.findByRole("alert");
    expect(e.store.gate()).toEqual({ closed: false });
    await e.store.recordBattles([{ user: "rock", computer: "rock", at: 1 }]); // 저장이 막히지 않음
    expect(e.mem.records()).toHaveLength(6);
    fail = false;
  });

  it("조회 오류 후 재시도도 실패하면 오류가 유지된다", async () => {
    const user = userEvent.setup();
    const e = env(5);
    e.mem.fail.read = 1;
    e.mem.fail.probe = 1;
    render(<History store={e.store} />);
    await user.click(await screen.findByRole("button", { name: "저장 다시 시도" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "저장 다시 시도" }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(e.store.gate().closed).toBe(true);
  });

  it("언마운트 후 도착한 응답은 무시된다(오류·경고 없음)", async () => {
    const e = env(5);
    const resume = e.mem.pauseWrites();
    const w = e.store.recordBattles([{ user: "rock", computer: "rock", at: 1 }]);
    const view = render(<History store={e.store} />);
    view.unmount();
    resume();
    await w;
    await act(async () => {
      await e.store.whenIdle();
    });
  });
});
