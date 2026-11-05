# Implementation Plan: 가위바위보 vs 컴퓨터 (RPS Game)

**Branch**: `001-rps-game` | **Date**: 2026-11-05 | **Spec**: [spec.md](spec.md) (Approved 2026-11-05)

**Input**: Feature specification from `specs/001-rps-game/spec.md`

## Summary

사용자가 혼자 컴퓨터와 가위바위보를 하는 반응형 웹앱을 Next.js App Router + React + TypeScript로
만든다. 서버·DB·인증이 없는 단일 페이지 클라이언트 앱이다. 설계의 핵심은 세 가지다.

1. **순수 로직 분리**: 판정·컴퓨터 선택·전적 누적·저장값 검증을 React와 무관한 순수 함수로 두고,
   난수(`random: () => number`)와 저장소(`Storage`)는 인자로 주입한다. (Constitution VI)
2. **단순한 상태 관리**: React 내장 `useReducer` 하나로 전적과 최근 라운드를 관리한다. 외부 상태
   라이브러리는 쓰지 않는다. 저장소 복원은 effect가 아니라 **복원이 끝난 뒤에만 게임 화면을 마운트하고
   그 시점에 초기 상태를 읽는 구조**로 처리하여, 잘못된 0/0/0 표시·복원 전 입력·상태 덮어쓰기를 구조적으로
   차단한다. (Constitution II)
3. **추적 가능한 테스트**: 모든 FR/AC를 Vitest + React Testing Library 테스트 또는 기록되는 수동
   절차에 1:1로 연결한다. (Constitution IV, VII)

## Technical Context

**Language/Version**: TypeScript (strict 모드), Node.js LTS (현재 환경: Node v22.22.1, npm 10.9.4 확인됨)

**Primary Dependencies**: `next`, `react`, `react-dom` (최신 안정 버전, 설치 시점에 확정). 런타임 추가 의존성 없음

**Dev Dependencies**: `typescript`, `eslint` + `eslint-config-next`(스캐폴드 기본), `vitest`, `@vitejs/plugin-react`,
`jsdom`, `@testing-library/react`(+ 필요한 peer), `@testing-library/user-event`

**Storage**: 브라우저 `localStorage` 키 1개 (서버 저장 없음). 계약은 [contracts/storage-contract.md](contracts/storage-contract.md)

**Testing**: Vitest(단위 + UI 컴포넌트, jsdom) + 수동 검증 절차(레이아웃·터치 크기·네트워크)

**Target Platform**: 최신 Chrome/Safari/Firefox/Edge의 모바일·데스크톱 브라우저 (Spec 가정)

**Project Type**: web-application (단일 Next.js 프로젝트, 프런트엔드 전용)

**Performance Goals**: 선택 후 1초 이내 결과 표시 (SC-004). 순수 계산이라 별도 최적화 불필요

**Constraints**: 320px~1280px+ 가로 스크롤 없음, 터치 영역 ≥ 44×44 CSS px, JS 비활성 미지원, 서버 요청 없음

**Scale/Scope**: 화면 1개, 컴포넌트 1~3개, 순수 모듈 2개

## Constitution Check

*GATE: Phase 0 이전 통과 필수. Phase 1 설계 후 재검토 완료.*

| 원칙 | 판정 | 근거 |
|---|---|---|
| I. 기술 스택 | PASS | Next.js App Router, React, TypeScript만 사용 |
| II. 단순성 | PASS | 런타임 의존성 추가 없음. 상태 라이브러리·UI 라이브러리·CSS 프레임워크 미도입. 추상화는 순수 모듈 2개와 컴포넌트뿐 |
| III. 승인된 Spec 기준 | PASS | 사용자 대면 동작은 Spec 그대로. UI 문구·이모지는 사용자 승인 완료(2026-11-05) |
| IV. 식별자·인수 조건 | PASS | Spec의 FR-001~012, AC-001~022를 테스트 이름에 그대로 사용 |
| V. 승인 게이트 | PASS | Spec 최종 승인(2026-11-05) 확인 후 작성. 구현은 Plan 검토·Tasks 이후 |
| VI. 로직/UI 분리 | PASS | `src/lib/*`는 React·Next·DOM에 의존하지 않음. 난수·저장소는 주입 |
| VII. 테스트 검증 | PASS | 단위 + UI 테스트, 자동화가 어려운 AC는 수동 절차와 기록 위치 명시 |
| VIII. 품질 기준 | PASS | `typecheck`, `lint`, `test` 세 스크립트 모두 통과해야 완료 |
| IX. 요구사항 변경 통제 | PASS | 요구사항·AC 변경 없음. 필요 시 별도 승인 요청 |
| X. 에이전트 비용 효율성 | PASS | 메인 에이전트(Sonnet) 1개로 진행. 하위 "에이전트 사용 정책" 참조 |

Complexity Tracking: 위반 없음 (기재할 항목 없음).

## Architecture

```text
src/app/page.tsx (Server Component)
  └─ <Game />   src/components/Game.tsx ("use client")  ← 복원 게이트
       ├─ ready = useSyncExternalStore(noop, () => true, () => false)   // 서버·하이드레이션 첫 렌더 = false
       ├─ !ready → <GameSkeleton />   제목 + 빈 영역(전적·버튼 없음, aria-busy)
       └─ ready  → <GameBoard random? />   src/components/GameBoard.tsx   // 클라이언트에서만 마운트
            ├─ const [loaded] = useState(() => loadScore(getBrowserStorage()))   // 마운트 시 1회 동기 읽기
            ├─ const [state, dispatch] = useReducer(gameReducer, loaded.score, createInitialState)
            ├─ onClick → pickComputerChoice(random) → dispatch({type:'play', user, computer})
            ├─ onClick(초기화) → dispatch({type:'reset'})
            └─ useEffect([state.score]) → 저장 조건 충족 시 saveScore(storage, state.score)

src/lib/rps.ts           판정 · 컴퓨터 선택 (순수)
src/lib/game-state.ts    reducer · 전적 누적 · 초기화 (순수)
src/lib/score-storage.ts parseScore(순수) · loadScore · saveScore · getBrowserStorage (예외 흡수)
          서버 요청 없음 · 영속화는 localStorage 한 키뿐
```

### 기존 설계(v1)의 문제점

v1은 "첫 렌더 0/0/0 → 마운트 effect에서 `loadScore` → `hydrate` 액션 → `hydrated` 플래그 후 변경분 저장"이었다.

1. **잘못된 0/0/0 표시 (깜빡임)**: 서버 HTML과 첫 클라이언트 렌더가 0/0/0이라, 저장된 전적이 있어도 잠시 0/0/0이 보였다. 사용자가 허용하지 않은 동작이다.
2. **복원 전 입력 처리 가능**: 복원 effect가 실행되기 전(하이드레이션 직후 ~ effect 사이)에 클릭하면 0 기반으로 `play`가 처리되고, 뒤이은 `hydrate`가 `score`를 통째로 교체해 그 라운드가 유실되거나 전적이 어긋날 수 있었다.
3. **저장 데이터 유실 경로**: (a) 복원 전 상태(0)를 저장하는 실수를 `hydrated` 플래그에 의존해 막았으나 플래그 관리가 추가 상태·분기를 만들었다. (b) 읽기(`getItem`)는 예외로 실패했지만 쓰기(`setItem`)는 성공하는 환경에서, 유효한 기존 전적을 읽지 못한 채 0부터 다시 저장해 **덮어쓸** 수 있었다. (c) 마운트 직후 복원값을 그대로 다시 쓰는 불필요한 쓰기가 있었다.
4. **lint 부담**: effect 안에서 `dispatch`/setState로 복원하는 패턴은 `react-hooks` 규칙에 걸릴 가능성이 있어 `eslint-disable`에 의존하게 될 위험이 있었다.

### 변경한 설계(v2)와 선택 이유

| 문제 | v2 해법 | 이유 |
|---|---|---|
| 잘못된 0/0/0, 복원 전 입력 | **복원 게이트**: `Game`이 `useSyncExternalStore(noop, () => true, () => false)`로 "클라이언트 준비 여부"를 판정한다. 준비 전(서버 렌더·하이드레이션 첫 렌더)에는 전적과 버튼이 **없는** skeleton만 렌더한다. 준비 후에만 `GameBoard`를 마운트한다. | 서버 HTML에는 점수 값이 아예 없어 틀린 0/0/0이 존재하지 않는다. 버튼이 없으므로 복원 전 입력이 구조적으로 불가능하다(플래그 불필요). React가 하이드레이션 감지용으로 권장하는 패턴이라 effect·setState가 없다. |
| 상태 덮어쓰기 | `GameBoard`는 마운트 시 `useState(() => loadScore(...))`로 **한 번 동기적으로** 읽어 `useReducer` 초기 상태로 쓴다. `hydrate` 액션·`hydrated` 플래그는 삭제한다. | 복원과 첫 렌더가 같은 시점이라 "복원 전에 일어난 변경"이라는 개념이 없다. 상태 전이가 `play`/`reset` 둘로 줄어든다. |
| 불필요한 쓰기, 데이터 유실 | 저장 effect는 `loaded.writable && state.score !== loaded.score`일 때만 쓴다. `reducer`는 `play`/`reset`마다 **새 Score 객체**를 반환한다. `loadScore`는 `{ score, writable }`을 반환하며, 저장소가 없거나 `getItem`이 예외를 던지면 `writable=false`로 두고 이번 세션에서는 **저장하지 않는다**. | 변경이 없으면 쓰지 않는다. 읽지 못한 유효 데이터를 0으로 덮어쓰지 않는다. 값이 *유효하지 않을* 때(손상·형식 오류)는 `writable=true`이며 다음 변경 때 정상 값으로 대체된다(AC-020). |
| lint | 복원에 effect·setState가 없다. 저장 effect는 외부 시스템(localStorage)에 쓰기만 한다. | `eslint-disable`을 쓰지 않고 구현 가능. 규칙 위반 시에도 disable로 해결하지 않고 설계를 다시 검토한다(Plan 원칙). |
| 저장소 예외 | `getBrowserStorage`(접근 예외 → null), `loadScore`(`getItem` 예외 흡수), `saveScore`(`setItem` 예외 흡수) 모두 try/catch로 삼킨다. 화면 상태는 메모리로 정상 진행한다. | AC-020, AC-021, FR-007 |

### 핵심 설계 결정

1. **컴퓨터 선택 위치**: 이벤트 핸들러에서 `pickComputerChoice(random)`를 호출하고 결과를
   `dispatch({type:'play', user, computer})`로 넘긴다. reducer는 난수를 모르므로 순수하다. (FR-002, VI)
   핸들러가 state를 읽지 않으므로 빠른 연속 입력에도 stale state 문제가 없다. (FR-006, AC-022)
2. **입력 처리**: 선택지는 네이티브 `<button>`의 `onClick`만 사용한다. 터치/포인터/키 핸들러를 따로 달지 않아
   입력 1회 = 핸들러 1회(FR-011, AC-014)가 되고, 키보드 조작(FR-012)은 기본 제공된다. 복원이 끝난 뒤에는
   라운드 중 비활성화·디바운스·잠금을 하지 않는다. (FR-006, AC-022)
3. **전적 유지**: 위 v2 표 참조. 서버 렌더 시 전적 값은 출력하지 않는다. (FR-007, AC-017)
4. **초기화**: `dispatch({type:'reset'})` → 새 0/0/0 객체 + `lastRound = null`. 객체가 새로 만들어지므로 저장 effect가
   0을 저장하고, 새로고침 후에도 0이다. 확인 절차·undo 없음. (FR-008, AC-018, AC-019)
5. **최근 라운드는 저장하지 않는다** (승인된 가정). reducer 상태에서만 보관하며 이력 목록 없음. (FR-004)
6. **접근성/반응형**: 네이티브 버튼 + CSS Modules. 버튼 `min-width/min-height: 44px`, 좁은 화면 대응, `viewport` 메타.
   결과 영역은 `role="status"`. 이모지는 `aria-hidden`, 접근 가능한 이름은 텍스트. (FR-009, FR-012)

### Spec과의 정합성 확인 (v2 기준)

| 항목 | 결과 |
|---|---|
| FR-006 / AC-022 (연속 입력 무차단) | 충돌 없음. 복원 전에는 버튼이 존재하지 않을 뿐이며, 복원 후에는 잠금·지연이 없다. |
| AC-001 (처음 보면 세 선택지가 보이고 선택 가능) | 충돌 없음. 로딩이 끝난 화면을 기준으로 한다(JS 로드 전에는 어차피 조작 불가). 복원은 하이드레이션 직후 동기적으로 끝난다. |
| AC-005 / AC-017 | 0/0/0 또는 저장값이 **처음 표시되는 값**이 된다. 잘못된 값이 먼저 표시되지 않는다. |
| FR-007 (유지, 예외 시 중단 없음) / AC-020, 021 | 만족. 읽기 예외 시 세션 동안 저장 안 함(유실 방지)은 "저장 불가 시 게임은 계속"과 일치한다. |
| FR-010 | 서버 요청·계정 없음. 변경 없음. |
| Spec 문구 변경 필요 | 없음 |

## Project Structure

### Documentation (this feature)

```text
specs/001-rps-game/
├── spec.md
├── plan.md                    # 이 파일
├── research.md                # Phase 0: 기술 선택, 이유, 대안
├── data-model.md              # Phase 1: 타입, 상태 전이, 검증 규칙
├── quickstart.md              # Phase 1: 구현 후 검증 가이드
├── contracts/
│   ├── ui-contract.md         # 화면 요소, 접근 가능한 이름, 문구(검토 요청)
│   └── storage-contract.md    # 저장 키, 스키마, 오류 처리
├── checklists/requirements.md
└── tasks.md                   # /speckit-tasks 에서 생성 (이번 단계 제외)
```

### Source Code (repository root) — 구현 단계에서 생성될 구조

```text
src/
├── app/
│   ├── layout.tsx             # lang="ko", viewport, 제목
│   ├── page.tsx               # <Game /> 렌더
│   └── globals.css            # 최소 리셋/기본 변수
├── components/
│   ├── Game.tsx               # "use client", 복원 게이트(ready) + GameSkeleton
│   ├── GameBoard.tsx          # "use client", 마운트 시 loadScore, reducer, 이벤트, 저장 effect
│   └── Game.module.css        # 반응형 레이아웃, 44px 터치 영역
└── lib/
    ├── rps.ts                 # Choice/Outcome, judge, pickComputerChoice
    ├── rps.test.ts
    ├── game-state.ts          # GameState, gameReducer, initialState
    ├── game-state.test.ts
    ├── score-storage.ts       # parseScore, loadScore({score,writable}), saveScore, getBrowserStorage
    └── score-storage.test.ts
src/components/Game.test.tsx   # UI 테스트 (AC 흐름)
vitest.config.mts              # jsdom, react 플러그인, alias
```

**Structure Decision**: 단일 Next.js 프로젝트(`src/` 레이아웃)로 하며 백엔드·모노레포·별도 패키지를
두지 않는다. 테스트는 소스 옆에 두어 경로를 단순하게 유지한다. 스캐폴딩(`create-next-app`)이 만드는
설정 파일(tsconfig, eslint 설정, next.config 등)은 기본값을 따른다.

## 테스트 전략 (FR/AC 대응)

모든 테스트 이름은 `AC-0xx: ...` 형식으로 시작하여 Spec과 grep으로 추적한다.

| AC | 연결 FR | 유형 | 위치 | 핵심 검증 |
|---|---|---|---|---|
| AC-001 | FR-001 | UI | Game.test.tsx | 세 버튼이 보이고 활성 상태 |
| AC-002 | FR-001,002,004 | UI | Game.test.tsx | 주입한 난수로 클릭 시 양쪽 선택·결과 표시 |
| AC-003 | FR-003 | 단위 | rps.test.ts | 9조합 전수 표 기반 테스트 |
| AC-004 | FR-002 | 단위 | rps.test.ts | 시드 고정 의사난수로 3,000회 시 세 값 모두 등장 + 경계값(0, 0.999…) 매핑 |
| AC-005 | FR-005 | UI+단위 | Game.test.tsx | 빈 저장소 첫 접속에서 처음 표시되는 값이 0/0/0 |
| AC-006 | FR-005 | 단위+UI | game-state.test.ts | 결과별 해당 항목만 +1 |
| AC-007 | FR-005 | 단위 | game-state.test.ts | N라운드(무작위 시퀀스) 후 합 = N |
| AC-008 | FR-004,006 | UI | Game.test.tsx | 재클릭 시 결과 갱신, 이전 결과 목록 없음 |
| AC-009 | FR-005,006 | UI | Game.test.tsx | 여러 라운드 누적 |
| AC-010 | FR-009 | 수동 | verification 기록 | 320px 가로 스크롤 없음 |
| AC-011 | FR-009 | 수동 | verification 기록 | 1280px 레이아웃 |
| AC-012 | FR-009 | 수동 | verification 기록 | 버튼 렌더 크기 ≥ 44×44 (jsdom은 레이아웃 계산 불가) |
| AC-013 | FR-012 | UI | Game.test.tsx | Tab 이동 + Enter/Space로 선택·초기화 (user-event) |
| AC-014 | FR-011 | UI | Game.test.tsx | 클릭/탭/키 1회 = 라운드 1회, 전적 +1 |
| AC-015 | FR-005 | 수동 | verification 기록 | 999 이상 값 320px 표시 (저장소에 값을 넣어 점검) |
| AC-016 | FR-010 | 수동 | verification 기록 | Network 탭에서 게임 중 서버 요청 없음 |
| AC-017 | FR-007 | UI | Game.test.tsx | (a) `renderToString` 서버 HTML에 전적 값·버튼이 없음 (b) 저장값을 넣고 `hydrateRoot` → 최종 표시가 저장값이고, MutationObserver 기록에 `승 0`이 한 번도 나타나지 않음 (c) 재마운트 시 유지 |
| AC-018 | FR-008 | UI | Game.test.tsx | 초기화 즉시 0/0/0, 결과 영역 초기 상태 |
| AC-019 | FR-007,008 | UI | Game.test.tsx | 초기화 후 재마운트해도 0/0/0 |
| AC-020 | FR-007 | 단위+UI | score-storage.test.ts, Game.test.tsx | null/깨진 JSON/음수/비정수/키 누락 → 0/0/0 + 다음 변경 때 정상 값으로 대체. `getItem` 예외 → 0/0/0이고 **이후 `setItem`을 호출하지 않음**(유실 방지) |
| AC-021 | FR-007 | UI | Game.test.tsx | `setItem` 예외·저장소 접근 예외(`window.localStorage` getter 예외)에서도 전적 누적, 오류 없음 |
| AC-022 | FR-006,011 | UI | Game.test.tsx | 짧은 간격 N회 입력 → N라운드, 전적 +N, 마지막 결과 표시 |

추가 테스트 (설계 보완 반영, AC 보조 검증):

| 테스트 | 유형 | 위치 | 검증 내용 | 관련 |
|---|---|---|---|---|
| 서버 렌더에는 입력 요소가 없음 | UI | Game.test.tsx | `renderToString` 결과에 버튼·전적 값이 없고 skeleton만 존재 → 복원 전 입력 불가 | FR-006, AC-017 |
| 마운트만으로는 쓰지 않음 | UI | Game.test.tsx | 유효 저장값 마운트 후 상호작용 전 `setItem` 호출 0회 | FR-007 |
| StrictMode 마운트 | UI | Game.test.tsx | `<StrictMode>`에서도 저장값 복원, 마운트 시 `setItem` 0회, 연속 입력 후 합계 정확 | FR-007, AC-022 |
| 복원 직후 연속 입력 | UI | Game.test.tsx | 저장값 5/3/2 복원 후 3회 빠른 입력 → 합계 13 (복원값 보존 + 모두 처리) | FR-006, FR-007 |
| 읽기 실패 시 덮어쓰기 금지 | UI | Game.test.tsx | `getItem`만 예외, `setItem` 정상 → 라운드 진행 후에도 `setItem` 호출 0회 | FR-007 |
| `reset`/`play`가 새 객체 반환 | 단위 | game-state.test.ts | 저장 effect의 참조 비교 전제 | FR-008 |
| `loadScore` 결과 구분 | 단위 | score-storage.test.ts | 저장소 없음/`getItem` 예외 → `writable=false`; 키 없음·손상 값 → `writable=true` | FR-007, AC-020 |
| `getBrowserStorage` 예외 | 단위 | score-storage.test.ts | `window.localStorage` 접근이 throw → null | AC-021 |
| lint에 disable 없음 | 게이트 | quickstart | `grep -rn "eslint-disable" src`가 결과 없음 | Plan 원칙 |

- **수동 절차**의 결과는 구현 완료 시 `specs/001-rps-game/verification.md`에 일시·환경·결과로 기록한다. (VII)
- SC-001(10초 내 첫 라운드)과 SC-004(1초 내 표시)는 수동 확인으로 기록한다.
- **jsdom 한계**: CSS 레이아웃·터치 이벤트 합성은 완전히 재현되지 않는다. AC-012/014의 "터치 탭이 클릭을
  함께 발생시켜도 1회" 부분은 핸들러를 `onClick` 하나로 제한한 설계로 보장하고, user-event의 pointer
  시퀀스(`user.pointer`)로 가능한 범위를 검증하며, 실제 모바일 기기 확인은 수동 기록에 포함한다.
- **품질 게이트**: `npm run typecheck` (`tsc --noEmit`), `npm run lint` (ESLint), `npm test` (Vitest run) 모두 통과.

## 에이전트 사용 정책 (Constitution X)

- 구현과 테스트 작성은 **메인 에이전트(Sonnet) 하나**가 수행한다.
- 서브에이전트는 아래처럼 *독립 검증* 가치가 명확할 때만, 사용자에게 사유를 설명하고 호출한다.
  1. 구현 완료 후 "FR/AC ↔ 테스트 ↔ 코드" 추적성을 새 컨텍스트에서 읽기 전용으로 교차 검증 (선택, 최대 1회)
  2. 메인 에이전트가 반복적으로 실패한 문제에 대해 독립적인 원인 분석이 필요한 경우
- 병렬 구현, 단순 파일 탐색, 문서 작성 목적의 서브에이전트 호출은 하지 않는다.

## 검토 요청 항목 처리 결과

| 항목 | 결과 |
|---|---|
| 1. 한국어 UI 문구 (제목, 안내, 결과 문장, 버튼 라벨) | 승인 (2026-11-05) |
| 2. 선택 버튼 이모지 | 승인. 접근 가능한 이름은 텍스트, 이모지는 `aria-hidden` |
| 3. 첫 페인트 0/0/0 깜빡임 | **불허**. v2의 복원 게이트로 해결(위 "변경한 설계") |

## 미결정 사항 / 남은 위험

| ID | 항목 | 현재 방침 | 확정 시점 |
|---|---|---|---|
| P-1 | ~~effect 안 setState lint 경고~~ | 해결: 복원에 effect·setState를 쓰지 않는다. 구현 중 다른 lint 경고가 나도 `eslint-disable`을 기본 해결책으로 쓰지 않고 설계를 먼저 재검토한다 | — |
| P-2 | `create-next-app` 옵션·생성 파일은 설치 시점의 최신 버전에 따라 다름 | 옵션: TypeScript, ESLint, App Router, `src/`, Tailwind 제외, npm. 어긋나면 Plan 갱신 | Tasks/구현 시 |
| P-3 | 패키지 버전 | 설치 시점 최신 안정판, lockfile에 기록 | 구현 시 |
| P-4 | 배포 방식 | Spec 범위 밖. 이번 Plan에서 결정하지 않음 | 필요 시 별도 Spec |
| P-5 | 실기기 수동 검증 범위 | 최소 모바일 1종 + 데스크톱 1종 기록 | 구현 완료 시 |
| P-6 | **skeleton → 게임 화면 전환 시 레이아웃 이동** | skeleton에 게임 화면과 같은 최소 높이를 주어 이동을 최소화한다. 완전 무이동은 목표로 삼지 않는다(전환은 JS 로드 직후 1회). 텍스트 없이 빈 영역이라 틀린 값이 보이지 않는다 | 구현 시 수동 확인 |
| P-7 | **다중 탭 동시 사용 시 마지막 쓰기 우선(last-write-wins)** | 승인된 가정(탭 간 동기화 보장 안 함)의 결과로 한 탭의 라운드가 다른 탭에 덮어써질 수 있다. 위험을 수용하며 해결 설계는 하지 않는다 | 수용 |
| P-8 | **`useSyncExternalStore` 게이트의 테스트 가능성** | RTL `render`는 클라이언트 렌더라 skeleton 단계를 거치지 않는다. 서버 HTML은 `renderToString`, 하이드레이션은 `hydrateRoot`로 검증한다. 실브라우저 하이드레이션 확인은 수동 절차에 포함 | 구현 시 |
| P-9 | 읽기 예외 시 세션 동안 저장하지 않음 | 유실 방지를 우선한 보수적 선택. 이 경우 새로고침하면 전적이 사라지지만 Spec(FR-007: 저장 불가여도 게임 중단 금지)과 충돌하지 않는다 | 수용 |

Spec 변경이 필요한 항목은 없다.
