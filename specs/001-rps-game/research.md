# Research: 가위바위보 vs 컴퓨터 (RPS Game)

Phase 0 결과. Spec의 NEEDS CLARIFICATION은 없으며, 아래는 기술 선택과 그 근거다.
정확한 패키지 버전은 설치 시점에 확정한다(Plan P-3).

## R-1. 프레임워크 구성

- **Decision**: Next.js App Router + React + TypeScript(strict). `page.tsx`는 서버 컴포넌트로 두고 상호작용은 `"use client"`인 `Game` 컴포넌트 하나에 둔다.
- **Rationale**: Constitution I이 요구. 서버 기능이 없으므로 클라이언트 컴포넌트 경계는 하나면 충분하다.
- **Alternatives**: Pages Router(스택 요건과 불일치), Vite+React(Constitution I 위반), 전체 페이지를 클라이언트로 선언(경계가 커져 불필요).

## R-2. 상태 관리

- **Decision**: `useReducer` 하나. 상태 `{ score, lastRound }`, 액션 `play | reset`. reducer는 순수 모듈(`game-state.ts`)에 두며 `play`/`reset`은 항상 새 `Score` 객체를 반환한다. 초기 상태는 마운트 시 읽은 저장값으로 만든다(`hydrate` 액션 없음).
- **Rationale**: 상태 전이가 2개뿐이고 순수 함수라 단위 테스트가 쉽다. 빠른 연속 입력 시 reducer가 순서대로 처리하므로 stale closure 위험이 없다(AC-022). 복원이 상태 전이가 아니라 초기값이므로 "복원 전 변경이 복원에 덮어써지는" 경로가 없다.
- **Alternatives**: `useState` 여러 개(연속 입력에서 실수 위험), Zustand/Redux(필요성 없음, Constitution II), `hydrate` 액션 방식(v1: 복원 전 입력·덮어쓰기 위험), `useSyncExternalStore`로 저장소 자체를 구독(저장 불가 시 메모리 폴백 구현이 추가되어 복잡).

## R-3. 난수 주입

- **Decision**: `pickComputerChoice(random: () => number): Choice`. 인덱스 = `Math.min(Math.floor(random() * 3), 2)`. `Game`은 `random?: () => number` prop(기본값 `Math.random`)을 받는다.
- **Rationale**: 테스트에서 고정 값/시드 시퀀스를 넣을 수 있다(AC-002, AC-004). `random()`이 1에 가까운 경계에서도 범위를 벗어나지 않게 보호한다. 균등 확률은 Spec 가정과 일치.
- **Alternatives**: 모듈 전역 mock(`vi.spyOn(Math,'random')`, 결합이 숨겨짐), React Context DI(과한 추상화), 시드 PRNG 라이브러리(의존성 불필요; 테스트용 5줄짜리 LCG는 테스트 파일 안에 둔다).

## R-4. 전적 저장 방식

- **Decision**: `localStorage` 키 1개에 JSON `{wins, losses, draws}` 저장. `parseScore(raw)`는 순수 함수로 검증(세 값 모두 0 이상의 안전한 정수일 때만 채택, 아니면 `null`→0/0/0). I/O 함수는 `Storage`를 인자로 받고 모든 접근을 try/catch로 감싼다.
- **Rationale**: 서버 없이 같은 브라우저에서 유지(FR-007, FR-010). 접근 예외/깨진 값/저장 불가 모두 게임을 중단시키지 않는다(AC-020, AC-021). 일부 환경에서는 `window.localStorage` 접근 자체가 예외를 던지므로 `getBrowserStorage()`가 이를 흡수한다.
- **Alternatives**: `sessionStorage`(탭 종료 시 소실, Q1 위반), IndexedDB(과함), 쿠키(서버로 전송되어 FR-010 위반 소지), 저장 라이브러리(불필요).

## R-5. 저장 시점과 복원 시점 (복원 게이트)

- **Decision**: `Game`이 `useSyncExternalStore(noop, () => true, () => false)`로 클라이언트 준비 여부를 판정한다(서버/하이드레이션 첫 렌더는 `false`). 준비 전에는 전적·버튼이 없는 skeleton만 렌더하고, 준비 후에 `GameBoard`를 마운트한다. `GameBoard`는 `useState(() => loadScore(getBrowserStorage()))`로 마운트 시 한 번 동기적으로 읽어 `useReducer` 초기값으로 쓴다. 저장은 effect에서 `loaded.writable && score !== loaded.score`일 때만 수행한다.
- **Rationale**:
  - 서버 HTML에 전적 값을 출력하지 않으므로 잘못된 0/0/0이 표시되지 않는다(깜빡임 불허 요구).
  - 버튼이 복원 후에만 존재하므로 복원 전 입력이 구조적으로 불가능하다.
  - effect 안 setState가 없어 `react-hooks` lint 경고 위험이 없고 `eslint-disable`이 필요 없다.
  - 마운트 직후 쓰기가 없고, 읽기 예외 시 쓰기를 막아 유효 데이터 덮어쓰기를 방지한다.
- **Alternatives**:
  - v1: 첫 렌더 0/0/0 → effect 복원(깜빡임, 복원 전 입력, effect 안 상태 갱신).
  - `useEffect` + `ready` 플래그로 버튼 비활성화(동작은 가능하나 effect 안 setState·플래그 관리가 필요하고 서버 HTML에 0/0/0이 남음).
  - `next/dynamic`의 `ssr: false`(동작하나 별도 로딩 컴포넌트·경계가 늘고 하이드레이션 게이트보다 이점이 적음).
  - `useLayoutEffect` 복원(서버 HTML에는 여전히 값이 필요하고, 서버 렌더 경고/복잡도).
  - 서버 컴포넌트에서 쿠키로 읽기(서버 저장 금지 취지 위반, FR-010).
- **Verification**: 서버 HTML에 값·버튼이 없는지(`renderToString`), `hydrateRoot` 중 `승 0`이 관측되지 않는지(MutationObserver), 마운트 시 `setItem` 0회, 읽기 예외 시 `setItem` 0회를 테스트한다. 실브라우저 확인은 수동.

## R-6. 스타일링과 반응형

- **Decision**: CSS Modules(Next 내장) + 최소 `globals.css`. 버튼 `min-width/min-height: 44px`, 좁은 화면 우선 레이아웃(모바일 기준 스타일 + `@media (min-width)` 보강), `meta viewport`.
- **Rationale**: 의존성 0. 화면 하나라 유틸리티 CSS 프레임워크의 이점이 없다(Constitution II).
- **Alternatives**: Tailwind(스캐폴드 기본 옵션이지만 불필요한 의존성/설정), CSS-in-JS(런타임 비용, 의존성), UI 라이브러리(불필요).

## R-7. 테스트 도구

- **Decision**: Vitest(+ `@vitejs/plugin-react`, jsdom) + React Testing Library + user-event. 쿼리는 role/이름 기반(테스트용 id 지양).
- **Rationale**: TypeScript/ESM 설정이 단순하고 빠르다. 사용자 관점 쿼리는 접근성(FR-012)과 함께 검증된다. `jest-dom`은 쓰지 않고 기본 단언으로 충분하면 생략해 의존성을 줄인다.
- **Alternatives**: Jest + `next/jest`(설정 무거움), Playwright E2E(실제 브라우저로 AC-010~012를 자동화할 수 있으나 브라우저 바이너리·설정 비용이 MVP에 과함 — 향후 확장 옵션), Cypress(동일 사유).
- **Verification**: AC-010~012, 015, 016은 수동 기록(`verification.md`).

## R-8. 품질 게이트

- **Decision**: `typecheck`(tsc --noEmit), `lint`(eslint), `test`(vitest run) 세 스크립트. 셋 모두 통과해야 완료(Constitution VIII).
- **Rationale**: 요구된 세 기준을 1:1로 매핑. 스캐폴드의 ESLint 설정을 기본값 그대로 사용.
- **Alternatives**: Prettier/Husky 등 추가 도구(요구 기준에 없으며 Constitution II에 따라 보류).

## R-9. 에이전트 운용

- **Decision**: 메인 에이전트 1개. 서브에이전트는 구현 후 추적성 교차 검증 등 독립 검증 가치가 있을 때만(Plan "에이전트 사용 정책").
- **Alternatives**: 구현/테스트 분리 병렬 에이전트(비용 증가, 이 규모에선 이점 없음).
