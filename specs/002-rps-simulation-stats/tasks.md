---
description: "RPS Lab v2 구현 Tasks (자동 대결 · 기록 · 통계)"
---

# Tasks: RPS Lab v2 — 자동 대결 · 기록 · 통계

**Input**: `specs/002-rps-simulation-stats/` 의 spec.md, plan.md, research.md, data-model.md, contracts/(storage·ui), quickstart.md, `docs/references/rps-lab-v2-ui.html`
**Prerequisites**: Spec·Plan 최종 승인됨. 이 문서는 승인된 요구사항·설계를 바꾸지 않는다.
**Tests**: 포함한다(Constitution VII, Plan 12절, Spec의 Auto 검증 항목). 각 모듈은 테스트와 함께 구현하며, 같은 Task에 포함한다.
**Git**: commit/push는 사용자가 SourceTree에서 직접 수행한다. 구현 중 에이전트는 commit/push하지 않는다.
**완료 정의(모든 Task 공통)**: `npm run typecheck && npm run lint && npm test` 통과(Quickstart 2절).

## 형식: `- [ ] T### [P] [US#] 설명 (파일) — 검증: ...`

- **[P]**: 서로 다른 파일이고 미완료 Task에 의존하지 않아 병렬 가능
- 근거 문서 약칭: **DM**=data-model.md, **SC**=contracts/storage-contract.md, **UC**=contracts/ui-contract.md, **QS**=quickstart.md, **R-nn**=research.md, **G-n**=Plan 14.4 동시성 규칙
- 구현 순서: 저장소/데이터 → 게임 엔진/자동 대결 → UI/기록 → 통합 검증/배포
- 구현 선택(CSS 세부, 내부 함수명 등)은 Task 안에서 결정하고 새 승인 항목으로 만들지 않는다. Spec 충돌 또는 사용자 데이터 손실 위험이 있을 때만 보고한다.

## 사용자 스토리 (spec.md)

| ID | 스토리 | 우선순위 |
|---|---|---|
| US1 | 기록되는 수동 대결과 합산 전적 | P1 |
| US2 | 자동 대결 즉시 결과 | P1 |
| US3 | 애니메이션 자동 대결과 중지 | P2 |
| US4 | 기록·통계 페이지 | P1 |
| US5 | 전적 초기화 | P2 |
| US6 | 저장 실패·중단에도 일치하는 기록과 연습 대결 | P2 |
| US7 | 저장된 기록만이 전적의 근거(v1 전적 비이전) | P3 |

---

## Phase 1: Setup

- [x] T001 `fake-indexeddb` 개발 의존성 설치(승인됨, R-10). 어댑터는 `IDBFactory`를 주입받아 테스트가 `fake-indexeddb`의 `IDBFactory`를 직접 넘기므로 전역 setup과 `vitest.config.mts` 변경은 불필요(구현 결정, jsdom 환경 유지) (`package.json`) — 검증: 기존 v1 테스트 전부 통과, 런타임 dependencies 불변
- [x] T002 [P] (UI 구현 단계인 두 번째 배치에서 처리) 디자인 토큰 반영: `docs/references/rps-lab-v2-ui.html`의 `:root` 보정 색상(AA 보정값, win/lose/draw 카드·막대 색)을 CSS 변수로 이식 (`src/app/globals.css`) — 검증: UC 9절 색상 값과 일치, 기존 화면 깨지지 않음
- [ ] T003 [P] (미완료 — 배포 설정 단계에서 처리, 사용자 확인 2026-11-05) 배포 빌드 설정(T-D1): `output:"export"`, `trailingSlash:true`, 배포 빌드(환경 변수 지정 시)에서만 `basePath:"/rps-lab"`, 배포 빌드·정적 미리보기용 npm 스크립트 추가 (`next.config.ts`, `package.json`) — 검증: 일반 `npm run dev/build` 동작 불변, 배포 빌드 시 `out/`에 `index.html`·`history/index.html`·`404.html`는 T038 이후 재확인(Plan 16.3)

---

## Phase 2: Foundational — 저장소/데이터 및 순수 모듈 (모든 스토리의 선행)

**⚠️ 이 단계가 끝나기 전에는 어떤 스토리도 시작하지 않는다.**

- [x] T004 [P] 기록 타입·검증 `src/lib/battle.ts` + 테스트: `BattleDraft`/`BattleRecord`(`{seq,user,computer,at}`), 손 값·형식 검증, 결과는 저장하지 않고 `judge()`로 계산(DM, FR2-012·FR2-020) — 검증: 잘못된 손·형식 거부, 결과 계산이 v1 `rps.ts`와 동일
- [x] T005 [P] 통계 계산 `src/lib/stats.ts` + 테스트: `total`, `winRate`(승 ÷ 전체 × 100, 소수 첫째 자리, 0건이면 `0.0%`), 비율, `formatPercent`, `pageCount`(20건) (FR2-011·FR2-013, P-2) — 검증: 0건·경계값(1/3 등)·합계 100% 표시 규칙, AC2-021~AC2-023
- [x] T006 [P] 자동 실행 설정·상수 `src/lib/auto-run.ts` + 테스트: 설정 타입(내 손 고정/랜덤, 실행 방식, 횟수 10/100/1000), `draftBattle`(v1 균등 난수·`judge` 재사용, 랜덤 손은 각 1/3), 묶음 크기(애니메이션 `max(1,N/100)`/틱 70ms, 즉시 100) (FR2-004·FR2-005, P-5) — 검증: 주입 난수로 결정적 결과, 세 손 균등
- [x] T007 [P] 저장소 인터페이스 `src/lib/battle-store.ts`: `BattleStore`, `QueuedBattleStore`, `StoreError`(`kind`에 `"skipped"` 포함), `Stats` 타입 (DM, SC 2·3절) — 검증: 타입체크, React·DOM 무의존
- [x] T008 테스트 전용 메모리 저장소 `src/test-utils/memory-store.ts`: `BattleStore` 구현 + 실패·지연 주입(앱 번들 미포함) (Plan 12절) — 검증: 인터페이스 계약 테스트(추가·합계·페이지·초기화·실패 주입) 통과 (T007 이후)
- [x] T009 IndexedDB 어댑터 `src/lib/idb-battle-store.ts` + `idb-battle-store.test.ts`(fake-indexeddb): DB `rps-lab` v1, 스토어 `battles`(keyPath `seq`, 인덱스 없음)·`meta`(`"stats"`,`"probe"`), 기록 추가와 카운터 갱신을 같은 readwrite 트랜잭션, 묶음 추가 원자성, 키셋 페이지네이션(`seq` 내림차순 20+1건), 연결 첫 `loadStats`에서 합계 == `count()` 검증·자가 복구, 전체 초기화 원자성, 연결 무효화와 트랜잭션 오류 구분(식별자 비교, G-7), 쓰기 프로브 (SC 1~4절, FR2-016·FR2-017·FR2-020, FR2-025) — 검증: SC 7절 테스트 행 전부, 중간 실패 시 부분 저장 0건 (T004·T007 이후)
- [x] T010 저장 큐·실패 게이트 `src/lib/save-queue.ts` + 테스트: FIFO 쓰기 큐, 실패/초기 읽기 실패 시 게이트 닫힘(대기 쓰기는 `skipped`로 거부), `whenIdle()`, `recover()`(성공 시에만 게이트 열림, 이동으로 열리지 않음, 새로고침으로 초기화), 초기화↔재시도 상호 배제(G-6) (SC 3절, G-1~G-6, FR2-017·FR2-018·FR2-025, AC2-055) — 검증: 연속 입력 N회 순서·유실 0, 실패 후 뒤따른 쓰기가 저장되지 않음 (T007·T008 이후)
- [x] T011 [P] 낭독 문장 생성 `src/lib/announce.ts` + 테스트: UC 6절의 승인된 문장 6개와 읽기 실패·재시도 실패 문구를 `{N},{k},{a},{b},{c}` 치환으로 정확히 생성 (D1) — 검증: 문구 원문과 글자 단위 일치
- [x] T012 앱 수준 저장소 싱글턴 `getBrowserBattleStore()`을 `src/lib/idb-battle-store.ts` 또는 `src/lib/browser-store.ts`에 구현: 모듈 단일 `QueuedBattleStore` 인스턴스, IndexedDB 미지원·접근 불가 시 읽기 실패 상태로 시작(앱이 깨지지 않음) (Plan 2·5절, SC 4절, FR2-018) — 검증: indexedDB 미정의 환경에서 예외 없이 `StoreError` 반환 (T009·T010 이후)
- [x] T013 세션 순수 리듀서 `src/lib/game-session.ts` + 테스트: 상태·액션 타입, DM의 전이표 전체(`LOADED_UNAVAILABLE`, `RETRY_SUCCEEDED`/`RETRY_FAILED`, 실행 중 입력 거부 FR2-009, 실패가 중지보다 우선 G-8, 복구됨 안내 해제 규칙: 다음 확정 대결·초기화 성공·페이지 이동에서 해제, 모드 전환은 해제 안 함, 연습 대결 표시 구분 P-12) (DM, G-3·G-6·G-8, FR2-009·FR2-017·FR2-018·FR2-025) — 검증: 전이표의 모든 행에 대응하는 테스트, 불가능한 전이는 상태 불변 (T004~T007·T011 이후)
- [x] T014 자동 실행 모듈 `src/lib/auto-runner.ts` + 테스트: `runAutoBattles({store,random,now,wait,signal,...})`, 묶음 저장·진행 콜백, 같은 `AbortController`로 중지/언마운트/`pagehide`(G-9: 즉시 실행도 이탈 시 중단), 저장 실패 시 `aborted`가 `stopped`보다 우선(G-8), 중지 시 확정 건만 반영 (SC 3.3절, G-7~G-9, FR2-006~FR2-008, AC2-016·SC2-004) — 검증: 결정적 난수·가짜 타이머로 10/100/1000회, 중단 시 기록 수 == 확정 수 (T006·T008·T010 이후)
- [x] T015 [P] v2에서 쓰는 v1 순수 로직 재사용 범위를 확인: `Score`·`Round`·`applyOutcome`·`rps.ts`가 그대로 재사용 가능함을 확인했고 v1 UI가 아직 `gameReducer`·`createInitialState`를 쓰므로 `game-state.ts` 축소(미사용 export 제거)는 T018(UI 재구성)·T035로 이연, 파일 무변경 (`src/lib/game-state.ts`, `src/lib/game-state.test.ts`) (FR2-005·FR2-021) — 검증: v1 `rps.test.ts`·`game-state.test.ts` 통과, `score-storage` 삭제는 T035

**Checkpoint**: `src/lib` 전체가 UI 없이 테스트로 검증됨. 이후 스토리 시작 가능.

---

## Phase 3: US1 — 기록되는 수동 대결과 합산 전적 (P1) 🎯 MVP

**Goal**: v1 수동 대결을 유지하면서 확정된 대결마다 기록 1건을 IndexedDB에 저장하고, 새로고침 후에도 전적이 유지된다.
**Independent Test**: QS M-01(수동 몇 번 → 합계 = 기록 수 → 새로고침 유지). AC2-001~004, AC2-055, SC2-006.

- [x] T016 [US1] 세션 훅 `src/components/useGameSession.ts`: 리듀서·`getBrowserBattleStore()`(또는 prop 주입)·초기 `loadStats`, 수동 대결 확정 → 큐 저장 → 성공 후 전적 반영, 실행 중·읽기 실패 시 입력 규칙 (FR2-002·FR2-010·FR2-012·FR2-017, FR2-020) — 검증: 메모리 저장소 주입 훅 테스트, 서버 컴포넌트는 함수를 prop으로 넘기지 않음 (T012·T013 이후)
- [x] T017 [P] [US1] 게임 하위 컴포넌트 `src/components/game/`: `ModeToggle`(`aria-pressed`·키보드, FR2-001, AC2-002), `ManualPanel`(선택 버튼 3개, FR2-003), `BattleArena`(`role="status"` 단일 대표 live region, 결과 문장 1개, D1), `ScoreCards`(승/패/무 색상 카드, D2, FR2-010) + 각 `*.module.css` — 검증: UC 요소·role·문구 일치, 레퍼런스 HTML과 시각 비교(QS M-01/M-12), 외부 색만으로 구분하지 않고 텍스트 라벨 유지
- [x] T018 [US1] `src/components/Game.tsx`·`GameBoard.tsx`를 세션 훅 + 하위 컴포넌트 조합으로 재구성(v1의 복원 게이트 제거, v1 레이아웃 위치 유지) (FR2-021, AC2-001·AC2-003·AC2-004) — 검증: T019 통과 (T016·T017 이후)
- [x] T019 [US1] `src/components/Game.test.tsx`에 v1 수동 대결 테스트 이관·확장: 메모리 저장소 주입, v1 AC 회귀 0건(SC2-006), 빠른 연속 입력 N회 유실·중복 없음(AC2-055), 대결 1회당 기록 +1·해당 결과 +1(AC2-004), 새로고침 후 유지(저장소 재생성) — 검증: 전부 통과, 이관 전 v1 테스트 동일 어서션 보존 (T018 이후)

**Checkpoint**: 수동 대결 + 영속 저장 MVP 동작.

---

## Phase 4: US2 — 자동 대결 즉시 결과 (P1)

**Goal**: 자동 모드에서 10/100/1000회를 즉시 실행하고 결과·전적·기록이 정확히 반영된다.
**Independent Test**: QS M-02. AC2-005~AC2-013, AC2-062, SC2-001·SC2-007.

- [x] T020 [P] [US2] `AutoPanel`(내 손 방식·실행 방식·횟수 설정, 시작 버튼, 자동 모드에서 수동 버튼 숨김·수동 모드에서 자동 UI 숨김 P-3, 실행 중 설정 잠금 FR2-009)과 `RunSummary`(완료 요약, 승/패/무 횟수) 구현 (`src/components/game/AutoPanel.tsx`, `RunSummary.tsx`, css) (FR2-003·FR2-004·FR2-006) — 검증: UC 문구·role 일치, 키보드 조작 가능
- [x] T021 [US2] 세션 훅에 자동 실행 연결(`useGameSession.ts`): `auto-runner` 호출, 즉시 실행의 "처리하고 저장하고 있어요" 상태 표시·중복 실행 방지(P-6), 완료 시 요약 낭독 1회(P-7), 낭독 문장 6개 중 시작·완료 사용 (FR2-006·FR2-009·FR2-010·FR2-017) — 검증: 컴포넌트 테스트에서 100·1000회 후 기록 수·전적 합계 일치, 시작·완료 외 대결별 낭독 없음 (T014·T020 이후)
- [x] T022 [US2] 자동 모드 통합 테스트 `src/components/Game.test.tsx` 추가: 즉시 실행 10/100/1000 결과 합계, 실행 중 모드 전환·설정 변경·수동 대결·초기화 불가(FR2-009), 수동+자동 합산(FR2-010) — 검증: 통과 (T021 이후)

---

## Phase 5: US3 — 애니메이션 자동 대결과 중지 (P2)

**Goal**: 애니메이션 실행 중 진행 표시와 중지가 동작하고 확정된 대결만 반영된다.
**Independent Test**: QS M-03. AC2-014~AC2-019, SC2-004.

- [x] T023 [P] [US3] `RunProgress`(진행 횟수 / 전체, 진행 표시줄, 중지 버튼) 구현, "동작 줄이기"(P-13)는 승인된 Plan 11절대로 CSS(전환·스피너 끄기)로 처리하며 JS 분기는 없음 (`src/components/game/RunProgress.tsx`, css) (FR2-007·FR2-008, P-13) — 검증: 진행 표시줄 aria 값·중지 동작은 Game.test.tsx에서 검증, 동작 줄이기는 CSS 미디어 쿼리라 T040 수동 확인
- [x] T024 [US3] 세션 훅·`AutoPanel`에 애니메이션 실행(70ms 틱·묶음)과 중지 연결, 중지 요약 문구(`{N}회 중 {k}회가 저장됐어요…`), 언마운트·`pagehide` 시 같은 `AbortController`로 중단(G-8·G-9) (FR2-007·FR2-008) — 검증: 컴포넌트 테스트에서 중지 후 새 대결 시작 안 됨·기록 수 정지(SC2-004), 중지 후 상태에서 전적 == 기록 수 (T014·T023 이후)

---

## Phase 6: US4 — 기록·통계 페이지 (P1)

**Goal**: `/history`에서 통계·비율 막대·기록 목록(20건 페이지네이션)을 제공한다.
**Independent Test**: QS M-04/M-08. AC2-020~AC2-029, AC2-032·033, AC2-063~067, SC2-003·SC2-005.

- [ ] T025 [P] [US4] 공통 헤더 `src/components/AppHeader.tsx` + `AppHeader.test.tsx`, `src/app/layout.tsx` 수정: `게임` / `기록 · 통계` `next/link`(`prefetch={false}`), `aria-current="page"`, `usePathname()` 끝 슬래시 정규화(Plan 16.1·T-D2), 경로 하드코딩 금지 (FR2-015·FR2-022·FR2-023, D5(a)) — 검증: `/`, `/history`, `/history/` 모두 올바른 현재 위치 표시
- [ ] T026 [US4] 기록 훅 `src/components/useHistory.ts`: 리듀서 + 요청 번호(경합 시 이전 응답 무시), 키셋 페이지(이전·다음), `loadStats`, 로딩·빈·오류 상태 (FR2-011·FR2-013·FR2-014·FR2-017) — 검증: 메모리 저장소로 페이지 이동·연속 클릭 경합 테스트 (T005·T012 이후)
- [ ] T027 [P] [US4] `StatsPanel`(`ScoreCards` 재사용·승률 `formatPercent`)·`RatioBar`(막대 구간이 실제 승/패/무 비율, 퍼센트 범례, 텍스트 라벨, 색 보정값, FR2-024, P-10) (`src/components/history/StatsPanel.tsx`, `RatioBar.tsx`, css) — 검증: 비율 합 100%·0건 처리, 막대 색상 win `#3bb989`·lose `#ed7b83`·draw `#a5afc2`
- [ ] T028 [P] [US4] `RecordList`(데스크톱 표 + 모바일 카드, 순번·일시·내 선택·컴퓨터 선택·결과, 결과는 `judge()`로 계산·색만으로 구분하지 않음, P-1) 와 `Pager`(이전/다음, 현재 페이지, 한 페이지 20건, 비활성 상태) (`src/components/history/RecordList.tsx`, `Pager.tsx`, css) (FR2-012·FR2-013·FR2-014) — 검증: 20건 초과 시 페이지 분리, 전체를 한 번에 렌더링하지 않음
- [ ] T029 [US4] `src/components/history/History.tsx` + `src/app/history/page.tsx` 조합(`store` prop 기본 `getBrowserBattleStore()`)과 `History.test.tsx`: 빈 기록·로딩·오류 상태, 통계 = 기록 일치(합계 == 기록 수), 최신순 정렬, 페이지 이동, 읽기 실패 시 카드별 `승/패/무 기록을 불러오지 못했어요` (FR2-011·FR2-013·FR2-015·FR2-017·FR2-024, AC2-020~AC2-029·AC2-063~067) — 검증: 통과, 320px에서 가로 스크롤 없음은 T040에서 수동 확인 (T025~T028 이후)

---

## Phase 7: US5 — 전적 초기화 (P2)

**Goal**: 확인 후에만 전적·기록·마지막 결과를 함께 초기화한다.
**Independent Test**: QS M-05. AC2-041~AC2-044, AC2-060·061.

- [ ] T030 [P] [US5] `ResetControl` + `ResetDialog`(커스텀 `role="alertdialog"`, 4요건: 열림 시 포커스 이동, `inert`로 배경 트랩, Esc 닫기, 닫으면 여는 버튼으로 포커스 복원; 취소 시 아무것도 변경 안 함) (`src/components/game/ResetControl.tsx`, `ResetDialog.tsx`, css) (FR2-019·FR2-022, D4) — 검증: jsdom에 `showModal`/`inert` 없음에 맞춘 구현, 키보드·포커스 테스트
- [ ] T031 [US5] 세션 훅에 전체 초기화 연결: 초기화 중 `aria-busy` 상태, 큐의 FIFO 안에서 수행(앞선 쓰기 후), 성공 시 전적·기록·마지막 결과 동시 초기화와 낭독 `누적 전적과 대결 기록을 모두 초기화했어요.`, 실패 시 상태 불변·오류 안내, 포커스 처리(초기화 후 상태 문단 → 버튼 복원), 초기화↔재시도 상호 배제(G-6) (FR2-019, FR2-017) — 검증: 컴포넌트 테스트: 취소 무변경, 성공 후 0/0/0·기록 0건, 실패 시 유지 (T010·T030 이후)

---

## Phase 8: US6 — 저장 실패·중단에도 일치하는 기록과 연습 대결 (P2)

**Goal**: 저장 실패 시 앱이 깨지지 않고 연습 대결로 전환하며, 명시적 재시도 성공 시에만 복구한다.
**Independent Test**: QS M-06/M-15~M-17. AC2-034~AC2-040, AC2-056~059, AC2-068~071, SC2-002.

- [ ] T032 [P] [US6] `StorageNotice` 구현: 저장 불가 안내, 연습 대결 표시("(저장되지 않음 · 연습 대결)" 구분 P-12, 전적에 포함 안 함), `저장 다시 시도` 버튼(FR2-025), 복구됨 안내와 `role="alert"` 실패 낭독(재시도 실패 문구 승인본, 시각 변경 없음) (`src/components/game/StorageNotice.tsx`, css) (FR2-018·FR2-025, P-12·P-14) — 검증: UC 5절 문구·role 일치
- [ ] T033 [US6] 세션 훅·`auto-runner` 통합: 자동 실행 중 저장 실패 시 중단·`{k}회까지 저장됐어요` 안내·게이트 닫힘, 이후 모든 쓰기는 연습 대결로 처리(전적 불포함·이동/모드 전환으로 열리지 않음), `recover()`로만 복구, 복구됨 안내 해제 규칙(다음 확정 대결·초기화 성공·페이지 이동에서 해제, 모드 전환은 유지), 초기 읽기 실패 시 읽기 불가 상태 (FR2-017·FR2-018·FR2-025, P-14, G-3·G-6·G-8) — 검증: 메모리 저장소 실패 주입 테스트: 실패 시 전적 == 기록 수 유지(SC2-002), 재시도 실패 시 연습 유지, 성공 후 이후 대결 저장 (T013·T031·T032 이후)
- [ ] T034 [US6] 다중 탭·자원 처리 검증 테스트(어댑터): 두 연결에서 동시 쓰기해도 `seq` 중복·유실 없음(데이터 무결성 보장, 화면 실시간성은 보장하지 않음 P-9), 쓰기 중 연결 무효화 후 재시도 (SC 3.5절, FR2-016·FR2-017) — 검증: 어댑터 테스트 통과 (T009 이후)

---

## Phase 9: US7 — v1 전적 비이전 (P3)

**Goal**: 저장된 v2 기록만이 전적의 근거이며 v1의 localStorage 전적은 사용·이전하지 않는다.
**Independent Test**: QS M-09. AC2-045~AC2-054(v1 비이전·호환·배포 요구 포함).

- [ ] T035 [US7] v1 `localStorage` 전적(`score-storage.ts`)을 앱에서 읽거나 쓰지 않도록 확인·제거: `src/lib/score-storage.ts`와 `score-storage.test.ts` 삭제, `Game.tsx`에서 참조 제거, v1 키가 있어도 v2 전적에 영향 없음을 검증하는 테스트 추가(데이터를 삭제·수정하지는 않음) (FR2-020, Spec v1 호환성) — 검증: `src/`에 `score-storage` 참조 0건, 기존 localStorage 값이 있어도 초기 전적 0/0/0 (T018 이후)

---

## Phase 10: 통합 검증 · 접근성 · 배포

- [ ] T036 [P] 불변식 속성 테스트 `src/lib/invariants.test.ts`: 임의의 수동·자동·중지·실패·복구·초기화 연산열에서 승+패+무 == 전체 == 저장 기록 수, `seq` 단조 증가·중복 없음, 판정은 `judge()`와 일치(SC2-002, FR2-017·FR2-020) — 검증: 시드 고정 반복 통과 (T014·T033 이후)
- [ ] T037 [P] 접근성 자동 점검 보강: 컴포넌트 테스트에서 role/라벨/`aria-current`/`aria-pressed`/live region 1개 규칙 확인, 키보드 전용 조작 경로(SC2-005, FR2-022) — 검증: 해당 테스트 통과
- [ ] T038 정적 배포 호환 확인(T-D2): `npm run build`(배포 설정) 후 `out/`의 `index.html`·`history/index.html`·`404.html`, 자산 경로 접두사, 정적 서버에서 직접 접근·새로고침·이동·404 hydration 경고 없음, 내부 링크 `prefetch={false}`로 로드 시 `__next*.txt` 요청 없음, 개발 서버에서 `basePath` 조건부 적용 확인 (Plan 16.1, QS 7.2, D5(a)) — 검증: QS D-01~D-06 기록 (T003·T029 이후)
- [ ] T039 성능 측정 절차 실행 및 기록(P-8: 수치는 측정 후 기록): 즉시 100/1000회 표시 시간, 기록 규모 단계별 기록 페이지 첫 표시·이동 반응, 1000회 중 응답성, 중지 반응 시간 (SC2-001·SC2-003·SC2-004·SC2-007, QS 4절) — 검증: `specs/002-rps-simulation-stats/verification.md`에 일시·환경·측정값 (T022·T024·T029 이후)
- [ ] T040 수동 검증 M-01~M-17 수행과 기록(실제 브라우저·스크린리더 항목 포함: D4, 320~1280px 가로 스크롤 없음 SC2-005, 버튼 테두리 비텍스트 대비 D3 확인, 저장 실패는 개발자 도구로 재현 QS 5절) (QS 3절, SC2-002·SC2-005) — 검증: `verification.md`에 결과, 실패 항목은 수정 후 재검증 (T033 이후 전부)
- [ ] T041 [P] GitHub Actions 워크플로 작성(T-D3): `.github/workflows/deploy-pages.yml` — 트리거 master push·수동, 권한 `contents:read, pages:write, id-token:write`, environment `github-pages`, `concurrency`, Node 22, 체크아웃→`npm ci`→typecheck/lint/test→배포 빌드→`upload-pages-artifact(out/)`→`deploy-pages`, PR은 빌드만 (Plan 16.2) — 검증: YAML 문법·action 버전 확인(실제 배포 push는 사용자가 SourceTree에서 수행) (T038 이후)
- [ ] T042 배포 환경 검증 및 문서화(T-D4·T-D5): 배포 후 실제 주소·경로 확인(미확정 값은 배포 후 기록), QS 7절 D-01~D-12 수행, `README.md`에 배포 절(주소 확인, 실패 확인 순서, 롤백, 주의사항) 추가 (QS 7절, Plan 16.3) — 검증: `verification.md`에 배포 검증 기록. 실제 배포 단계는 사용자 push 이후 수행
- [ ] T043 최종 추적성 점검: FR2-001~025·AC2-xxx·SC2-001~007 ↔ 테스트/검증 기록 대조표를 `verification.md`에 작성하고 누락 시 보강(필요 시 서브에이전트 읽기 전용 교차 검증 최대 1회, Plan 에이전트 정책) — 검증: 누락 0건 (T036~T040 이후)

---

## 의존 관계

```text
Phase 1 (T001~T003)
  └─ Phase 2 (T004~T015)  ← 모든 스토리 선행
       T004,T005,T006,T007,T011,T015 [P]
       T007 → T008 → T009 → T010 → T012
       T004,T006,T008,T010 → T014
       T004~T007,T011 → T013
  └─ US1 (T016~T019) 🎯 MVP → US2 (T020~T022) → US3 (T023~T024)
  └─ US4 (T025~T029)   US1과 독립 진행 가능(저장소만 필요), 단 통합 확인은 US1 이후
  └─ US5 (T030~T031)   US1 이후
  └─ US6 (T032~T034)   US2 이후(자동 실행 중 실패 통합)
  └─ US7 (T035)        US1 이후
  └─ Phase 10 (T036~T043)
```

## 병렬 실행 예

- Phase 2 초반: T004·T005·T006·T007·T011 동시
- US1: T017(컴포넌트)과 T016(훅)은 파일이 달라 병행 가능, T018에서 합류
- US4: T027·T028 병행, T025와 T026도 병행
- Phase 10: T036·T037·T041 병행

## 구현 전략

1. **MVP**: Phase 1~3(수동 대결 + 영속 저장). 여기서 `typecheck/lint/test`와 QS M-01을 통과시킨다.
2. 이어서 US2 → US3 → US4 → US5 → US6 → US7 순으로 증분 추가. 각 단계 끝에서 전체 테스트(회귀 0건, SC2-006)를 확인한다.
3. 마지막에 통합 검증(T036~T040), 배포 설정(T041~T042). 배포 push는 사용자가 수행한다.

## 주의

- 승인된 Spec/Plan/UI 레퍼런스와 충돌하거나 사용자 기록을 잃을 위험이 있을 때만 구현을 멈추고 보고한다. 그 외 세부 선택은 Task 안에서 결정한다.
- 에이전트는 `git commit/push`를 하지 않는다.
- `docs/references/rps-lab-v2-ui.html`, Constitution, v1 Spec은 수정하지 않는다.
