# Tasks: 가위바위보 vs 컴퓨터 (RPS Game)

**Input**: `specs/001-rps-game/` — [spec.md](spec.md)(Approved), [plan.md](plan.md)(v2 승인), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: 요청됨(Constitution VII). 핵심 로직·저장소는 **테스트 먼저(Red) → 구현(Green)** 순서이고, UI도 각 스토리에서 테스트를 먼저 작성한다. 테스트 이름은 `AC-0xx: ...`로 시작한다.

**형식**: `- [ ] T### [P?] [US?] 설명 (파일 경로)` — `[P]`는 서로 다른 파일이며 미완료 작업에 의존하지 않아 병렬 가능. 각 작업 아래 `완료 기준`을 만족해야 체크한다.

## 진행 규칙 (모든 작업에 적용)

1. **Spec/Plan 변경 금지**: 구현 중 Spec(FR/AC)이나 Plan 변경이 필요해 보이면 **임의로 수정하지 않고 작업을 멈춘 뒤 사용자에게 먼저 보고**한다(Constitution IX).
2. **Git 작업 금지**: 자동 `git commit`/`git push`/브랜치 생성을 하지 않는다. 사용자가 SourceTree에서 변경 사항을 검토하고 직접 커밋한다. 각 Phase 끝의 **검토 지점**에서 변경된 파일 목록을 보고한다.
3. **서브에이전트 미사용**: 메인 에이전트 하나로 진행한다. 필요하다고 판단되면 사유를 설명하고 사용자 동의를 받는다(Plan "에이전트 사용 정책").
4. **`eslint-disable` 금지**: lint 경고는 설계를 먼저 재검토하여 해결한다. 우회가 불가피하면 보고한다.
5. **의존성 최소화**: Plan에 명시되지 않은 패키지를 추가하지 않는다. 필요하면 먼저 보고한다.
6. **작은 단위 검증**: 각 작업 완료 시 해당 테스트/명령으로 기준을 확인한다.
7. **Phase별 보고 후 정지**: 각 Phase 종료 시 (완료 작업 ID, 변경 파일, 테스트·품질 게이트 결과, 발견한 문제와 해결, 다음 Phase 진행 가능 여부)를 보고하고, **사용자 확인 전에는 다음 Phase로 진행하지 않는다.**

## Phase 1: Setup — 프로젝트 초기화

**Purpose**: Next.js(App Router, React, TypeScript)와 테스트 도구 준비. 다른 모든 Phase에 선행.

- [X] T001 저장소 루트(`/Users/hsjeong/Documents/harness-study/rps-lab`)에 Next.js 앱을 생성한다 — 옵션: TypeScript, ESLint, App Router, `src/` 디렉터리, **Tailwind 제외**, npm, import alias `@/*`. 루트에 `.claude/`, `.specify/`, `specs/`가 있어 생성기가 충돌하면 스크래치 디렉터리에 생성한 뒤 해당 폴더를 **덮어쓰지 않고** 복사한다.
  - **사전 보존 절차**: (1) 스캐폴딩 전에 `.claude/`, `.specify/`, `specs/` 및 루트의 기존 파일 전체의 체크섬 목록(`find … -type f | sort | xargs shasum`)을 스크래치 디렉터리에 저장한다. (2) 생성 결과와 기존 루트 파일 사이의 **이름 충돌 목록**(`.gitignore` 등)을 만들어 확인한다. (3) 충돌 파일은 덮어쓰지 않고 병합 방식을 정해 처리하되, Spec Kit 파일이 영향받는 경우 **진행 전에 보고**한다. (4) 스캐폴딩 후 체크섬을 다시 계산해 비교한다.
  - 완료 기준: `package.json`, `tsconfig.json`(strict), ESLint 설정, `src/app/`이 존재. 스캐폴딩 전후 체크섬 비교에서 `.claude/`, `.specify/`, `specs/`(및 기존 루트 파일)가 **한 파일도 변경·삭제되지 않음**. 충돌 목록과 처리 결과를 Phase 1 보고에 포함. 생성된 `.gitignore`에 `node_modules`, `.next`가 포함(SourceTree에 불필요한 파일이 보이지 않도록). 생성 결과가 Plan(P-2)과 어긋나면 **보고**.
- [X] T002 (T001 후) 기본 보일러플레이트를 정리한다 — `src/app/layout.tsx`: `lang="ko"`, 제목 "가위바위보". `src/app/page.tsx`는 임시로 비워둔다(T014에서 `<Game />` 연결). `src/app/globals.css`: 최소 리셋/기본 변수만 남김. 기본 예제 이미지·CSS Module 등 불필요한 파일 삭제.
  - 완료 기준: 예제 콘텐츠·미사용 자산이 남아 있지 않음. `npm run build`가 성공하고 출력 HTML에 viewport 메타가 포함됨.
- [X] T003 (T001 후) 테스트 의존성을 devDependencies로 설치한다: `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`, `@testing-library/dom`(peer), `@testing-library/user-event`. `package.json` scripts에 `"typecheck": "tsc --noEmit"`, `"test": "vitest run"`을 추가한다(`lint`는 스캐폴드 제공 스크립트 확인).
  - 완료 기준: 위 패키지 외 추가 설치 없음. `npm run typecheck`가 오류 없이 종료. `npm run lint` 스크립트가 동작.
- [X] T004 (T003 후) `vitest.config.ts`를 작성한다(실제 파일명: `vitest.config.mts` — ESM 로딩 경고 회피, 보고됨) — `environment: 'jsdom'`, React 플러그인, `@/` alias를 `tsconfig` paths와 동일하게 `src/`로 매핑. 테스트는 `globals` 없이 명시적 import 사용.
  - 완료 기준: `npm test`가 설정 오류 없이 실행되어 "테스트 파일 없음" 외의 오류가 없음(테스트 파일이 없어 종료 코드가 1이면 허용, 설정 오류만 불가).

**검토 지점 1**: 생성/변경 파일 목록을 보고한다. 커밋은 사용자가 SourceTree에서 직접 수행하며, 에이전트는 커밋을 기다리지 않고 다음 Phase로 진행해도 된다.

---

## Phase 2: Foundational — 순수 게임 로직 · 상태 · 저장소 (테스트 먼저)

**Purpose**: UI와 무관한 순수 모듈. 모든 사용자 스토리가 의존한다. (Constitution VI)

**⚠️ 순서**: T005~T007(테스트, 병렬 가능, 모두 Red) → T008 → T009 → T010 → T011.

### 테스트 먼저 (Red)

- [X] T005 [P] `src/lib/rps.test.ts`를 작성한다.
  - `AC-003`: `judge(user, computer)` 9조합 전수 표(가위>보, 바위>가위, 보>바위, 같으면 draw; 결과는 사용자 관점 `win|lose|draw`).
  - `AC-004`: `pickComputerChoice(random)` — 주입값 `0`→`rock`, `0.34`→`paper`, `0.67`→`scissors`, `0.9999999`→`scissors`, `1`→`scissors`(경계 보호 `Math.min(Math.floor(random()*3), 2)`); 시드 고정 의사난수(테스트 파일 내 LCG)로 3,000회 호출 시 세 값 모두 등장.
  - 완료 기준: 파일이 존재하고 `npm test`에서 모듈 부재로 **실패(Red)**한다. 테스트 제목이 `AC-003`, `AC-004`로 시작.
- [X] T006 [P] `src/lib/game-state.test.ts`를 작성한다.
  - `createInitialState(score)` → `{ score, lastRound: null }`.
  - `AC-006`: `play`는 `outcome`에 해당하는 항목만 정확히 +1, 나머지 불변. win/lose/draw 각각.
  - `AC-007`/`SC-003`: 0/0/0에서 N라운드 임의 시퀀스 후 `wins+losses+draws === N`.
  - `FR-004`: `lastRound`는 가장 최근 1개(`{user, computer, outcome}`)만 보관(이력 필드 없음).
  - `FR-008`: `reset` → 새 0/0/0 객체, `lastRound === null`.
  - 불변식: `play`/`reset`은 **항상 새 Score 객체**를 반환하고 입력 state를 변경하지 않는다(저장 effect 참조 비교의 전제).
  - 완료 기준: 파일 존재, `npm test`에서 Red. 제목에 `AC-006`, `AC-007` 포함.
- [X] T007 [P] `src/lib/score-storage.test.ts`를 작성한다 — 가짜 Storage 객체(`getItem`/`setItem`만)를 사용.
  - `parseScore`: 유효 값 채택(`{"wins":5,"losses":3,"draws":2}`), 거부 → `null`: `null` 입력, 잘못된 JSON, JSON이 객체가 아님(배열/숫자/`null`), 키 누락, 음수, 소수, 문자열 값, `Number.MAX_SAFE_INTEGER` 초과(`Number.isSafeInteger`). 추가 키는 무시.
  - `loadScore`: 저장소 `null` → `{score: 0/0/0, writable: false}`; `getItem` 예외 → `{0/0/0, false}`; 키 없음 → `{0/0/0, true}`; 손상 값 → `{0/0/0, true}`; 유효 → `{score, true}`. (`AC-005`, `AC-017`, `AC-020`)
  - `saveScore`: 키 `rps-lab:score`에 `{"wins":n,"losses":n,"draws":n}` JSON으로 저장; `setItem` 예외를 던져도 예외가 밖으로 나오지 않음. (`AC-021`)
  - `getBrowserStorage`: 정상 시 `window.localStorage` 반환; `window.localStorage` 접근 getter가 예외를 던지면 `null`. (`AC-021`)
  - 완료 기준: 파일 존재, `npm test`에서 Red.

### 구현 (Green)

- [X] T008 (T005 후) `src/lib/rps.ts`를 구현한다 — `Choice = 'rock'|'paper'|'scissors'`, `Outcome = 'win'|'lose'|'draw'`, 선택지 순서 `[rock, paper, scissors]`, `judge`, `pickComputerChoice(random: () => number)`(인덱스 `Math.min(Math.floor(random()*3), 2)`). React/Next/DOM을 import하지 않는다.
  - 완료 기준: `npm test src/lib/rps.test.ts` 통과(AC-003, AC-004). 파일에 `react`, `next`, `window`, `document` 문자열이 없음.
- [X] T009 (T006, T008 후) `src/lib/game-state.ts`를 구현한다 — 타입 `Score = {wins:number; losses:number; draws:number}`(각 값 **0 이상의 안전한 정수**), `Round = {user, computer, outcome}`, `GameState = {score, lastRound: Round | null}`, `GameAction = {type:'play'; user; computer} | {type:'reset'}`; 함수 `applyOutcome(score, outcome)`(해당 항목만 +1, 새 객체), `createInitialState(score)`, `gameReducer`(play: `judge`로 판정·`applyOutcome`·`lastRound` 갱신 / reset: **새** 0/0/0 객체와 `lastRound=null`). `hydrate` 액션과 `hydrated` 필드는 두지 않는다. 순수 모듈.
  - 완료 기준: `npm test src/lib/game-state.test.ts` 통과(AC-006, AC-007). React/DOM import 없음.
- [X] T010 (T007, T009 후) `src/lib/score-storage.ts`를 구현한다 — 상수 `STORAGE_KEY = 'rps-lab:score'`, 타입 `StorageLike = Pick<Storage, 'getItem'|'setItem'>`, `parseScore(raw: string|null): Score|null`(세 값 모두 존재하고 `Number.isSafeInteger` 이며 0 이상일 때만 채택, 추가 키 무시), `loadScore(storage: StorageLike|null): {score: Score; writable: boolean}`(저장소 없음·`getItem` 예외 → `writable=false`; 키 없음·손상 → `writable=true`, 0/0/0), `saveScore(storage, score): void`(JSON 저장, `setItem` 예외 흡수), `getBrowserStorage(): Storage|null`(`window.localStorage` 접근 예외 흡수). DOM을 만지는 코드는 `getBrowserStorage`에만 둔다.
  - 완료 기준: `npm test src/lib/score-storage.test.ts` 통과(AC-005, AC-017, AC-020, AC-021 중 단위 범위). `parseScore`/`loadScore`/`saveScore`는 `window`를 직접 참조하지 않음.
- [X] T011 Phase 2 품질 게이트 — `npm run typecheck`, `npm run lint`, `npm test` 실행.
  - 완료 기준: 세 명령 모두 오류 0, `grep -rn "eslint-disable" src` 결과 없음.

**검토 지점 2**: `src/lib/*` 6개 파일 변경 보고. 사용자 검토·커밋(Git 자동 작업 없음).

---

## Phase 3: User Story 1 — 한 라운드 플레이하고 결과 확인 (Priority: P1) 🎯 MVP

**Goal**: 선택 → 컴퓨터 무작위 선택 → 결과 표시.
**Independent Test**: 앱을 열고 버튼을 눌러 양쪽 선택과 판정이 표시된다.
**Covers**: FR-001, FR-002(UI 연결), FR-004, FR-010(fetch 미사용) / AC-001, AC-002 (+AC-016 자동 보조)

- [X] T012 [US1] `src/components/Game.test.tsx`를 만들고 US1 테스트를 작성한다 — `localStorage.clear()`를 각 테스트 전에 수행하고 `random`을 prop으로 주입하는 `renderGame(random)` 헬퍼 사용. 쿼리는 role/이름 기반(`getByRole('button', { name: '가위' })`).
  - `AC-001`: 버튼 "가위", "바위", "보"가 보이고 활성 상태. 접근 가능한 이름이 텍스트와 정확히 일치(이모지는 `aria-hidden`이라 이름에 포함되지 않음). 초기 `role="status"` 영역에 "가위, 바위, 보 중 하나를 선택하세요".
  - `AC-002`: `random=()=>0`(컴퓨터=바위)일 때 "가위" 클릭 → status에 "나: 가위 · 컴퓨터: 바위 — 패배"; 이기는/비기는 조합 각각 1개씩 추가(`승리!`, `무승부`).
  - `AC-016` 자동 보조: 라운드 진행 중 `fetch`가 호출되지 않음(`vi.spyOn(globalThis, 'fetch')`).
  - 완료 기준: `npm test`에서 컴포넌트 부재로 Red.
- [X] T013 [US1] (T009, T012 후) `src/components/GameBoard.tsx`를 구현한다(`"use client"`) — props `random?: () => number`(기본 `Math.random`). `useReducer(gameReducer, createInitialState({wins:0,losses:0,draws:0}))`. 선택 버튼 3개(`<button>`, `onClick`만 사용, 이모지 ✌️✊✋는 `aria-hidden` 장식, 접근 가능한 이름 "가위"/"바위"/"보"). 클릭 핸들러: `pickComputerChoice(random)` 후 `dispatch({type:'play', user, computer})`. 결과 영역 `role="status"`: 초기 "가위, 바위, 보 중 하나를 선택하세요", 진행 후 "나: {선택} · 컴퓨터: {선택} — {승리!|패배|무승부}"(화면 라벨: rock=바위, paper=보, scissors=가위). 버튼 비활성화·디바운스 없음.
  - 완료 기준: AC-001, AC-002 테스트 통과.
- [X] T014 [US1] (T013 후) `src/components/Game.tsx`와 `src/app/page.tsx`를 구현한다 — `Game`(`"use client"`)은 `useSyncExternalStore(subscribeNoop, () => true, () => false)`로 `ready`를 얻고(`subscribeNoop`는 모듈 상수), `<main>` 안에 `<h1>가위바위보</h1>`과 함께 `ready ? <GameBoard random={random}/> : <빈 영역 aria-busy="true"/>`를 렌더한다(skeleton에는 전적·버튼 없음, 텍스트 없음). `page.tsx`는 `<Game />` 렌더. `random` prop을 `GameBoard`에 전달.
  - 완료 기준: `npm test`의 US1 테스트 통과. `npm run build` 성공. `npm run dev`에서 페이지가 열리고 클릭 시 결과가 표시됨(수동 스모크, 결과는 T025에 기록).

**검토 지점 3**: US1 완료(MVP 1단계). 변경 파일 보고.

---

## Phase 4: User Story 2 — 누적 전적 확인 (Priority: P1)

**Goal**: 승/패/무 누적 표시.
**Covers**: FR-005 / AC-005, AC-006, AC-007

- [X] T015 [US2] `src/components/Game.test.tsx`에 US2 테스트를 추가한다.
  - `AC-005`: 저장된 전적이 없는 첫 접속에서 "승 0", "패 0", "무 0"이 표시.
  - `AC-006`: 승/패/무를 각각 만드는 `random`·클릭으로 해당 항목만 1 증가하고 나머지는 불변.
  - `AC-007`: 0/0/0 상태에서 임의 N라운드(예: 7라운드, 결과 혼합) 후 세 값의 합이 N.
  - 완료 기준: `npm test`에서 새 테스트가 Red.
- [X] T016 [US2] (T013, T015 후) `GameBoard.tsx`에 전적 표시를 추가한다 — "승 {wins}", "패 {losses}", "무 {draws}" 세 항목(라벨과 값이 함께 읽히도록 마크업). `state.score`를 사용.
  - 완료 기준: AC-005, AC-006, AC-007 통과, 기존 테스트 계속 통과.

**검토 지점 4**: 변경 파일 보고.

---

## Phase 5: User Story 3 — 연속 플레이 (Priority: P1)

**Goal**: 새로고침·추가 조작·잠금 없이 계속 진행, 빠른 연속 입력도 모두 처리, 입력 1회=라운드 1회.
**Covers**: FR-006, FR-011 / AC-008, AC-009, AC-014, AC-022 (+FR-004 이력 없음 확인)

- [X] T017 [US3] `src/components/Game.test.tsx`에 US3 테스트를 추가하고 실행한다 — 구현 변경 없이 통과해야 하며, 실패하면 `GameBoard.tsx`를 수정한다(버튼 비활성화·디바운스·추가 핸들러 금지).
  - `AC-008`: 한 라운드 후 다시 클릭하면 status가 새 라운드 내용으로 갱신되고, 이전 라운드 문구는 화면에 남지 않으며 status 영역은 항상 1개(이력 목록 없음, FR-004).
  - `AC-009`: 여러 라운드 진행 시 전적이 누적(합계 정확).
  - `AC-014`: 마우스 클릭 1회, `user.pointer` 탭 1회, 키보드 Enter 1회, Space 1회 각각 라운드 1회·전적 합계 +1(중복 이벤트로 2회 처리되지 않음).
  - `AC-022`: 짧은 간격(대기 없이)으로 서로 다른 입력 3회 → 합계 +3, 어떤 입력도 무시되지 않고 마지막 라운드가 status에 표시. 더블 클릭 = 2라운드.
  - **핵심 완료 기준**: 실제 연속 입력 테스트인 **AC-014**(클릭·탭·Enter·Space 각 1회 = 라운드 1회, 전적 +1)와 **AC-022**(대기 없는 서로 다른 입력 3회 = 합계 +3, 무시되는 입력 없음, 더블 클릭 = 2라운드)가 통과해야 한다. AC-008, AC-009도 통과.
  - **보조 검증**(핵심 기준을 대체하지 않음): `GameBoard.tsx`에 `disabled`, `setTimeout`, debounce/throttle, `onPointer*`/`onTouch*`/`onKey*` 핸들러가 없음을 `grep`으로 확인.

**검토 지점 5**: 여기까지가 **MVP(핵심 플레이)**. 변경 파일 보고.

---

## Phase 6: User Story 4 — 모바일·데스크톱 · 키보드 (Priority: P2)

**Goal**: 320px~1280px+ 반응형, 터치 영역 44×44, 키보드 조작.
**Covers**: FR-009, FR-012 / AC-010, AC-011, AC-012, AC-013(선택 버튼 부분), AC-015(스타일 부분)

- [ ] T018 [US4] `src/components/Game.test.tsx`에 키보드 테스트를 추가한다.
  - `AC-013`(선택 버튼): Tab으로 "가위" 버튼에 포커스 이동 → Enter로 라운드 진행; Space로도 진행. 세 선택 버튼이 모두 네이티브 `button` role.
  - 완료 기준: 통과(네이티브 `<button>` 사용으로 구현 변경 없이 통과해야 함). 실패 시 `GameBoard.tsx` 수정.
- [ ] T019 [US4] `src/components/Game.module.css`를 작성하고 `Game.tsx`/`GameBoard.tsx`에 클래스를 적용한다 — 모바일 우선 스타일 + `@media (min-width: …)` 보강. 선택 버튼·초기화 버튼 공통 클래스에 `min-width: 44px; min-height: 44px`. 좁은 화면에서 버튼 줄바꿈, 전적 숫자가 커져도(세 자릿수 이상) 줄바꿈/축소로 수용(`min-width: 0`, `overflow-wrap` 등), 가로 스크롤 유발 고정 폭 금지. skeleton 컨테이너에 게임 화면과 비슷한 `min-height`를 주어 전환 시 레이아웃 이동을 줄인다(Plan P-6). 초기화 버튼은 T022에서 같은 클래스를 사용한다.
  - 완료 기준: CSS에 `44px` 최소 크기 규칙이 존재(`grep -n "44px" src/components/Game.module.css`). `npm run build` 성공. 실제 레이아웃·측정 검증은 T025(수동, AC-010~012, AC-015).

**검토 지점 6**: 변경 파일 보고.

---

## Phase 7: User Story 5 — 전적 유지와 초기화 (Priority: P2)

**Goal**: 같은 브라우저에서 전적 유지, 즉시 초기화, 저장소 예외에도 게임 정상 동작, 잘못된 0/0/0·덮어쓰기 없음.
**Covers**: FR-007, FR-008, FR-010(서버 저장 없음), FR-012(초기화 버튼) / AC-017~AC-021, AC-013(초기화 버튼 부분), AC-005(복원 포함)

- [ ] T020 [US5] `src/components/Game.test.tsx`에 US5 테스트를 추가한다.
  - `AC-017`: (a) `react-dom/server`의 `renderToString(<Game />)` 결과에 전적 값("승 0" 등)과 버튼이 없음(복원 전 입력 불가). (b) `localStorage`에 `{"wins":5,"losses":3,"draws":2}`를 넣고 `hydrateRoot`(서버 HTML 위)로 하이드레이션 → 최종 "승 5/패 3/무 2"이며 `MutationObserver`로 기록한 모든 중간 텍스트에 "승 0"이 **한 번도 나타나지 않음**. (c) 클라이언트 렌더·언마운트 후 재마운트해도 전적 유지, 결과 영역은 초기 안내 문구.
  - `AC-018`: 초기화 클릭 시 즉시 0/0/0, status가 초기 안내 문구로 복귀, `window.confirm`이 호출되지 않음.
  - `AC-019`: 초기화 후 재마운트해도 0/0/0 (저장값이 0).
  - `AC-020`: 손상 값(`"abc"`, 음수, 소수, 키 누락)에서 0/0/0으로 시작하고 게임 진행 가능, 한 라운드 후 저장값이 유효한 JSON으로 대체. `getItem`이 예외를 던지는 경우 0/0/0 시작 + 라운드 진행 후에도 `setItem`이 **호출되지 않음**(유효 데이터 덮어쓰기 방지).
  - `AC-021`: `setItem`이 예외를 던져도 전적이 정상 누적되고 오류 없음; `window.localStorage` getter가 예외를 던져도 동작.
  - 보조: 유효 저장값 마운트 후 상호작용 전 `setItem` 0회; `<StrictMode>`에서도 동일(복원, 마운트 시 `setItem` 0회, 연속 입력 합계 정확); 5/3/2 복원 직후 빠른 3회 입력 → 합계 13.
  - `AC-013`(초기화 버튼): Tab으로 "전적 초기화" 버튼 포커스 → Enter/Space로 초기화.
  - 완료 기준: `npm test`에서 새 테스트가 Red(복원·초기화 미구현). 제목에 해당 AC ID 포함.
- [ ] T021 [US5] (T010, T020 후) `GameBoard.tsx`에 복원·저장을 추가한다 — `const [loaded] = useState(() => loadScore(getBrowserStorage()))`, `useReducer(gameReducer, loaded.score, createInitialState)`. 저장 `useEffect`(deps `[state.score]`)는 `loaded.writable && state.score !== loaded.score`일 때만 `saveScore(storage, state.score)`를 호출(마운트 직후 쓰기 없음, 읽기 예외 시 쓰기 없음). 복원용 effect·`setState`·`dispatch`를 쓰지 않는다. `eslint-disable` 금지.
  - 완료 기준: AC-017, AC-020, AC-021 및 보조 테스트 통과. `npm run lint` 경고 0.
- [ ] T022 [US5] (T019, T021 후) `GameBoard.tsx`에 "전적 초기화" 버튼을 추가한다 — 네이티브 `<button>`, `onClick`에서 `dispatch({type:'reset'})`, 확인 대화상자·undo 없음, T019의 버튼 공통 클래스 사용.
  - 완료 기준: AC-018, AC-019, AC-013(초기화 버튼) 통과. 전체 `npm test` 통과.

**검토 지점 7**: 변경 파일 보고.

---

## Phase 8: 최종 검증 (Polish & Cross-Cutting)

**Purpose**: 품질 게이트, 추적성, 수동 검증. 구현 완료 보고.

- [ ] T023 품질 게이트를 실행한다 — `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
  - 완료 기준: 4개 명령 모두 오류 0. `grep -rn "eslint-disable" src` 결과 없음. `src/lib/rps.ts`, `src/lib/game-state.ts`에 `react|next|window|document` 참조 없음. `package.json` 의존성이 Plan 목록과 일치(추가 패키지 없음).
- [ ] T024 FR/AC 추적성을 검증한다 — `grep -rhoE "AC-0[0-9]{2}" src | sort -u`로 자동 검증 대상 AC(001~009, 013, 014, 017~022)가 모두 테스트 제목에 등장하는지, 수동 대상(010, 011, 012, 015, 016)이 T025 기록 항목에 있는지 확인한다. 아래 "FR/AC 커버리지"와 대조한다.
  - 완료 기준: 누락 AC 0건. 불일치나 Spec/Plan 수정 필요 사항은 수정하지 않고 보고.
- [ ] T025 수동 검증을 수행하고 `specs/001-rps-game/verification.md`에 일시·환경(브라우저/기기/폭)·결과(통과/실패)·비고를 기록한다 — [quickstart.md](quickstart.md) 2번 표 전 항목: AC-010(320px 가로 스크롤 없음), AC-011(1280px+), AC-012(버튼 렌더 크기 ≥ 44×44, 선택 3개 + 초기화), AC-015(`{"wins":999,"losses":1000,"draws":1234}` 입력 후 320px), AC-016(Network 탭에서 게임 중 서버 요청 없음), SC-001(10초 내 첫 라운드), SC-004(1초 내 결과), 깜빡임(저장값 상태에서 반복 새로고침·스로틀링 시 잘못된 0/0/0 없음), 실기기 모바일 1종 탭 1회=1라운드.
  - 완료 기준: 모든 항목에 결과가 기록됨. 실패 항목은 원인과 함께 보고(수정이 Spec/Plan 변경을 요하면 먼저 보고). 실기기 확인이 불가하면 미수행 사유를 기록하고 사용자에게 보고.
- [ ] T026 quickstart 3번 기능 흐름 스모크(6단계)를 수행하고 `verification.md`에 결과를 추가한다.
  - 완료 기준: 6단계 모두 기대대로 동작. 이상 시 보고.
- [ ] T027 완료 보고를 작성한다(코드 외 문서는 만들지 않고 채팅으로 보고) — FR 12개·AC 22개별 검증 결과 표, 계획 대비 변경/이탈 사항, 남은 위험(Plan P-2~P-9), **변경·신규 파일 목록**(SourceTree 검토용). **Git 커밋/Push는 하지 않는다.**
  - 완료 기준: 사용자가 파일 목록과 결과를 보고 SourceTree에서 직접 커밋할 수 있음.

---

## 의존성 및 실행 순서

```text
T001 ─┬─ T002 ───────────────────────────────┐
      └─ T003 ─ T004                          │
                │                             │
   ┌────────────┼────────────┐                │
 T005 [P]     T006 [P]     T007 [P]   (테스트, Red)
   │            │            │                │
 T008 ─────── T009 ───────── T010   (T009는 T006+T008, T010은 T007+T009)
   └────────────┴────────────┘                │
                T011 (게이트)                  │
                │                             │
   US1:  T012 ─ T013 ─ T014 ◄─────────────────┘ (T014는 T002 필요)
   US2:  T015 ─ T016          (T013 후)
   US3:  T017                 (T016 후, 구현 변경 거의 없음)
   US4:  T018, T019           (T013 후; T019는 T016 이후 권장)
   US5:  T020 ─ T021 ─ T022   (T010, T019 후)
   Final: T023 ─ T024 ─ T025 ─ T026 ─ T027
```

- **Setup(T001~T004)** → **Foundational(T005~T011)** → **US1(T012~T014)** → **US2** → **US3** → **US4** → **US5** → **Final**. `GameBoard.tsx`/`Game.test.tsx`는 여러 스토리가 같은 파일을 순차 수정하므로 스토리 간 병렬은 하지 않는다.
- **병렬 가능**: T005, T006, T007(서로 다른 테스트 파일). 그 외는 순차.
- **스토리 독립성**: US1~US3는 저장소 없이 동작(MVP). US4는 스타일, US5는 `GameBoard`에 복원/저장을 덧붙인다. US5의 초기화 버튼은 US4의 버튼 공통 클래스를 재사용한다.

### 예상 구현 순서

1. T001~T004 (환경)
2. T005~T007 (Red) → T008~T010 (Green) → T011 (게이트)
3. T012 → T013 → T014 (플레이 가능, **MVP 1단계**)
4. T015 → T016 (전적), T017 (연속 플레이 검증) → **MVP 완료 지점**
5. T018 → T019 (키보드·반응형)
6. T020 → T021 → T022 (유지·초기화)
7. T023 → T027 (최종 검증·보고)

### 구현 전략

- MVP = Phase 1~5(T001~T017). 이후 Phase 6~7을 추가한다.
- 각 Phase 끝의 검토 지점에서 변경 파일을 보고하고, 커밋은 사용자가 수행한다.
- 막히면 임의로 우회하지 않고 보고한다(Spec/Plan 변경, 새 의존성, `eslint-disable` 필요 등).

## FR/AC 커버리지

### FR → 작업

| FR | 작업 |
|---|---|
| FR-001 선택 | T012, T013, T014 |
| FR-002 컴퓨터 무작위 | T005, T008, T012, T013 |
| FR-003 판정 | T005, T008 |
| FR-004 최근 라운드 표시(이력 없음) | T006, T009, T012, T013, T017 |
| FR-005 누적 전적 | T006, T009, T015, T016 |
| FR-006 연속·무제한·무차단 | T013, T017 |
| FR-007 전적 유지·예외 허용 | T007, T010, T020, T021 |
| FR-008 즉시 초기화 | T006, T009, T020, T022 |
| FR-009 반응형·44px | T019, T025 |
| FR-010 서버·계정 없음 | T012(fetch 보조), T025 |
| FR-011 입력 1회=라운드 1회 | T017 |
| FR-012 키보드 | T018, T020 |

### AC → 작업

| AC | 작업 | 검증 방식 |
|---|---|---|
| AC-001 | T012, T013 | 자동 |
| AC-002 | T012, T013 | 자동 |
| AC-003 | T005, T008 | 자동(단위) |
| AC-004 | T005, T008 | 자동(단위) |
| AC-005 | T007, T010, T015, T016 | 자동 |
| AC-006 | T006, T009, T015, T016 | 자동 |
| AC-007 | T006, T009, T015, T016 | 자동 |
| AC-008 | T017 | 자동 |
| AC-009 | T017 | 자동 |
| AC-010 | T019, T025 | 수동 |
| AC-011 | T019, T025 | 수동 |
| AC-012 | T019, T025 | 수동 |
| AC-013 | T018, T020 | 자동 |
| AC-014 | T017 | 자동 |
| AC-015 | T019, T025 | 수동 |
| AC-016 | T012(보조), T025 | 수동 |
| AC-017 | T007, T010, T020, T021 | 자동 |
| AC-018 | T020, T022 | 자동 |
| AC-019 | T020, T022 | 자동 |
| AC-020 | T007, T010, T020, T021 | 자동 |
| AC-021 | T007, T010, T020, T021 | 자동 |
| AC-022 | T017 | 자동 |

모든 FR 12개와 AC 22개가 하나 이상의 작업에 연결되어 있다. 총 작업 수: 27개 (Setup 4, Foundational 7, US1 3, US2 2, US3 1, US4 2, US5 3, Final 5).
