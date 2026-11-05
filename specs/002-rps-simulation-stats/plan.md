# Implementation Plan: 자동 대결과 전적 통계 (RPS Lab v2)

**Branch**: `002-rps-simulation-stats` (디렉터리 이름으로만 사용) | **Date**: 2026-11-05 | **Spec**: [spec.md](spec.md) (Approved 2026-11-05)

**Input**: Feature specification from `specs/002-rps-simulation-stats/spec.md`. 시각·상태별 UI 기준은 `docs/references/rps-lab-v2-ui.html`(사용자 승인 완료). **기능 동작과 데이터 처리 규칙은 Spec이 우선**한다.

## Summary

v1(수동 가위바위보, localStorage 전적) 위에 **수동/자동 대결 토글, 자동 대결(즉시 결과·애니메이션·중지), 누적 통계, 전체 기록 페이지, 전적 초기화 확인, 저장 실패 시 연습 대결과 복구**를 추가한다. 서버·계정·외부 DB 없이 브라우저 IndexedDB가 전적과 개별 기록의 **유일한 영속 저장소**다. 설계의 핵심은 다섯 가지다.

1. **기록이 진실의 원천, 카운터는 같은 트랜잭션의 파생 캐시.** 개별 기록과 승/패/무 카운터를 한 `readwrite` 트랜잭션에서 갱신하고, 트랜잭션 **커밋 이후에만** 화면 전적에 반영한다(= "확정"). 불변식 `전체 = 승+패+무 = 기록 수`가 구조적으로 성립하고, 연결당 1회 검증·복구가 어긋남을 바로잡는다.
2. **순수 로직과 비동기 흐름의 분리.** 판정·난수 주입(v1 `rps.ts`)은 그대로 재사용하고, 상태 전이는 순수 reducer, 순차 저장 큐와 자동 실행 반복은 React를 모르는 모듈로 둔다. UI는 `BattleStore` 인터페이스에만 의존하므로 jsdom에서 IndexedDB 없이 전 흐름을 테스트한다. (Constitution VI, VII)
3. **묶음 저장 + 묶음 사이 취소.** 자동 대결은 묶음(애니메이션은 틱당 `ceil(N/100)`건, 즉시는 100건) 단위의 원자적 트랜잭션으로 저장한다. 중지·이동·`pagehide`는 모두 `AbortController` 하나로 모이고 **묶음 사이에서만** 반영되어 부분 저장이 없다.
4. **키셋 페이지네이션.** 기록 조회는 항상 20(+1)건만 읽어 규모와 무관하다.
5. **저장 실패는 게임을 막지 않는다.** 저장 불가 상태에서는 저장되지 않는 연습 대결을 허용하고, 사용자가 명시적으로 "저장 다시 시도"에 성공해야 기록이 재개된다(P-14).

기술 스택은 v1 그대로(Next.js App Router + React + TypeScript)이며 **런타임 의존성을 추가하지 않는다.** 개발 의존성 `fake-indexeddb` 1개는 사용자 승인 방향이 정해졌다(실제 설치는 구현 단계). **저장 큐·실패 게이트·연결은 페이지가 아니라 앱 수준 저장소가 소유**해 앱 내 이동 중에도 수락된 저장이 폐기되지 않는다. 배포는 **Next.js 정적 내보내기를 GitHub Actions로 GitHub Pages(무료)에 올리는 구조**이며 별도 서버·유료 서비스가 없다([16절](#16-배포-설계-github-pages)).

## Technical Context

**Language/Version**: TypeScript (strict), Node.js v22.22.1

**Primary Dependencies**: `next` 16.4.5, `react` / `react-dom` 19.3.0 (기존). **런타임 추가 의존성 없음**

**Dev Dependencies**: 기존(`vitest` 5, `@testing-library/*`, `jsdom` 29, `eslint-config-next`) + **`fake-indexeddb` ^6.2.7** (어댑터 테스트 한정, 승인 방향 확정 2026-11-05, 설치는 구현 단계)

**Storage**: 브라우저 IndexedDB, DB `rps-lab` v1, 저장소 `battles`·`meta`. 계약은 [contracts/storage-contract.md](contracts/storage-contract.md). localStorage·서버 저장 없음

**Testing**: Vitest(jsdom) 단위·컴포넌트 + `fake-indexeddb` 어댑터 테스트 + 수동 검증(M-01~M-14, [quickstart.md](quickstart.md))

**Target Platform**: 최신 Chrome·Safari·Firefox·Edge (모바일·데스크톱)

**Deployment**: GitHub Pages(무료). Next.js 정적 내보내기(`output: "export"`, `trailingSlash: true`, 배포 빌드에서만 `basePath: "/rps-lab"`) + GitHub Actions. 별도 서버·유료 데이터베이스·유료 호스팅·유료 도메인 없음. 상세와 호환성 실험 결과는 16절

**Project Type**: web-application (단일 Next.js 프로젝트, 프런트엔드 전용). 라우트 2개: `/`, `/history`

**Performance Goals**: **수치는 P-8에 따라 측정 후 확정**(미확정). 설계 목표는 구조적이다: 기록 조회 비용 O(페이지 크기), 통계 읽기 O(1), 저장 비용 O(묶음 크기), 연결당 1회 `count()` 검증

**Constraints**: 320px~1280px+ 가로 스크롤 없음, 모든 버튼 ≥ 44×44 CSS px, 서버 요청·로그인 없음, 자동 대결 중 UI 응답성 유지, JS 비활성 미지원, 정적 내보내기 비호환 기능(Route Handler, Server Action, 동적 라우트, 리다이렉트·헤더 설정, 기본 `next/image` 로더) 사용 금지

**Scale/Scope**: 화면 2개, 기록 수만~10만 건급, 자동 대결 1회 최대 1,000건

## Constitution Check

*GATE: Phase 0 이전 통과 필수. Phase 1 설계 후 재검토 완료.*

| 원칙 | 판정 | 근거 |
|---|---|---|
| I. 기술 스택 | PASS | Next.js App Router, React, TypeScript. 다른 프레임워크 없음 |
| II. 단순성 | PASS (1건 정당화) | 런타임 의존성·상태 라이브러리·UI 라이브러리 없음(배포도 추가 런타임 의존성 없음). 새 추상화는 `BattleStore` 인터페이스, 앱 수준 저장 큐, 자동 실행 모듈이며 필요성을 Complexity Tracking에 문서화. 개발 의존성 `fake-indexeddb`는 승인 방향 확정 |
| III. 승인된 Spec 기준 | PASS | 사용자 대면 동작은 Spec 그대로. 최종 HTML의 문구와 D1·D2·D3·D5는 사용자 승인 완료(15절). GitHub Pages 배포는 Spec 요구사항이 아니라 Plan 범위의 인프라 결정이며 Plan에만 유지한다. FR2-023·AC2-054의 "네트워크 요청"은 D5 (a)로 해석했고 원문과의 관계는 15.2에 보고했다(Spec 미수정) |
| IV. 식별자·인수 조건 | PASS | FR2-001~025, AC2-001~071, SC2-001~007을 테스트 이름에 그대로 사용. 추적표 14절 |
| V. 승인 게이트 | PASS | Spec 최종 승인(2026-11-05) 확인 후 작성. Tasks·구현은 이 Plan 승인 이후 |
| VI. 로직/UI 분리 | PASS | `src/lib/*`는 React·Next·DOM에 의존하지 않음. IndexedDB 접근은 어댑터 한 파일에만 있고 인터페이스 뒤에 있음. 난수·시계·타이머·저장소는 주입 |
| VII. 테스트 검증 | PASS | 모든 AC를 자동 테스트 또는 수동 절차(M-xx)에 연결(14절). 수동 결과는 `verification.md`에 기록 |
| VIII. 품질 기준 | PASS | `typecheck`, `lint`, `test`에 더해 정적 내보내기 빌드(`next build`)가 모두 통과해야 완료. 배포 CI도 같은 게이트를 통과해야 게시한다 |
| IX. 요구사항 변경 통제 | PASS | FR·AC·SC·P-1~P-14의 의미 변경 없음. D2 A안 승인에 따라 FR2-010·AC2-020 문구만 사용자 승인 후 최소 수정(2026-11-05). P-11 원문은 유지 |
| X. 에이전트 비용 효율성 | PASS | 메인 에이전트 1개. 아래 "에이전트 사용 정책" |

Phase 1 설계 후 재검토: 위 판정 변경 없음. 설계 중 새로 생긴 위반 없음.

---

## 1. 현재 v1 아키텍처와 재사용할 부분

v1 흐름: `app/page.tsx`(서버) → `Game`(복원 게이트 `useSyncExternalStore`) → `GameBoard`(`useState`로 localStorage 동기 읽기 → `useReducer` → 변경 시 effect로 저장).

| v1 요소 | v2 처리 | 이유 |
|---|---|---|
| `rps.ts` (`judge`, `pickComputerChoice(random)`, `CHOICES`) | **무변경 재사용** | FR2-005. 사용자 랜덤 손도 같은 함수로 균등 1/3(P-5) |
| `game-state.ts` `Score`·`Round`·`applyOutcome` | 유지 | 전적 타입·가산 규칙 재사용 |
| `game-state.ts` `gameReducer`·`createInitialState` | **제거**, 새 세션 reducer로 대체 | v1 reducer는 "즉시 가산 + 동기 복원"이 전제. v2는 "저장 확정 후 반영" |
| `score-storage.ts` + 테스트 | **제거** | OQ-3: v1 localStorage 전적은 읽지도 이전하지도 않음 |
| `Game.tsx` 복원 게이트 | **제거** | v2의 초기 상태는 항상 `loading`이고 읽기는 effect에서 비동기로 시작하므로 서버/첫 하이드레이션 렌더가 같다 ([research.md R-12](research.md)) |
| `GameBoard.tsx` 결과 영역 구조(`role="status"` 1개, 시각 영역 `aria-hidden`) | **구조 유지**, 컴포넌트로 분리 | AC2-049 |
| 선택 버튼 `onClick` 단일 핸들러, 잠금·디바운스 없음 | 유지 | v1 FR-006/011, AC2-055 |
| `Game.module.css` | 새 토큰 기반 CSS Modules로 재구성 | 최종 HTML의 토큰·반응형 반영 |
| `Game.test.tsx` (897줄) | 수동 대결 AC(AC-001~004, 008, 009, 013, 014, 022)는 **단언 유지**, 준비 코드만 변경. 저장 방식 AC(017~021)는 v2 테스트로 대체 | AC2-048 |

**v1 승인 문서(`specs/001-rps-game/*`)는 변경하지 않는다.**

## 2. v2 컴포넌트 및 모듈 구성

```text
app/layout.tsx ── <AppHeader/> (h1, 탐색 Link, aria-current)
├─ app/page.tsx        → <Game store? random?/>          ("use client")
│    Game ── useGameSession(store, random) ── sessionReducer (순수)
│            ├─ getBrowserBattleStore()     앱 수준 QueuedBattleStore (FIFO 저장 큐·실패 게이트·연결을 소유, 모듈 단일 인스턴스)
│            └─ runAutoBattles(...)        자동 실행 반복 (프레임워크 무관, 주입: 큐로 감싼 store·random·now·wait·signal)
│       GameBoard ── ModeToggle · StorageNotice · BattleArena(role="status") ·
│                    ManualPanel | AutoPanel(+RunProgress, RunSummary) · ScoreCards · ResetControl(+ResetDialog)
└─ app/history/page.tsx → <History store?/>              ("use client")
     History ── useHistory(store) (reducer + 요청 번호)
        StatsPanel(ScoreCards, RatioBar, 범례) · RecordList(표 + 카드) · Pager · 상태 메시지(빈/로딩/오류)

src/lib (React·Next·DOM 무의존; 단 idb-battle-store.ts만 indexedDB 사용)
  rps.ts · game-state.ts(축소)            재사용
  battle.ts        BattleDraft/BattleRecord, 형식 검증
  stats.ts         total, winRate, ratios, formatPercent, pageCount
  auto-run.ts      설정 타입, draftBattle, 묶음 크기·간격 상수
  auto-runner.ts   runAutoBattles
  save-queue.ts    createQueuedStore (FIFO 큐·실패 게이트·whenIdle·recover를 얹는 데코레이터)
  game-session.ts  sessionReducer, 상태·액션 타입
  announce.ts      낭독 문장 생성
  battle-store.ts  BattleStore 인터페이스, StoreError
  idb-battle-store.ts  IndexedDB 구현(스키마·마이그레이션·트랜잭션)
src/test-utils/memory-store.ts   테스트 전용 메모리 저장소(+실패·지연 주입). 앱 번들에 포함되지 않음
```

**의존 방향**: 컴포넌트 → 훅 → 순수/비동기 모듈 → `QueuedBattleStore`(앱 수준) → `BattleStore` 인터페이스 ← IndexedDB 어댑터. 화살표 반대 방향 import는 금지한다. 저장소 구현은 `Game`/`History`의 `store` prop(기본값 `getBrowserBattleStore()`, 모듈 단위 단일 연결)으로 주입하며, 서버 컴포넌트는 함수를 넘기지 않는다.

## 3. 수동 게임과 자동 시뮬레이션의 상태 관리

상태는 **순수 reducer 하나**([data-model.md 4절](data-model.md))에 있다. 훅은 비동기 결과를 액션으로 바꿔 dispatch할 뿐 상태를 따로 갖지 않는다(ref 제외). **저장 큐·실패 게이트·연결은 페이지가 아니라 앱 수준의 `QueuedBattleStore`가 소유**한다(모듈 단위 단일 인스턴스, [storage-contract 3절](contracts/storage-contract.md), [research R-17](research.md)).

- **로드**: 마운트 effect에서 저장소의 `gate()`를 읽는다. 게이트가 열려 있으면 `whenIdle()` 뒤 `loadStats()` → `LOADED`/`LOAD_FAILED`(실패하면 게이트를 닫음). 게이트가 닫혀 있으면(이전에 저장 실패·읽기 실패가 있었고 재시도에 성공하지 못함) `LOADED_UNAVAILABLE`로 **저장 불가 상태에서 시작**한다(P-14, G-2). 이 전에는 skeleton(선택 버튼·전적 없음, `aria-busy`)이며 서버 렌더와 첫 하이드레이션 렌더가 모두 `loading`이라 불일치가 없다. StrictMode의 이중 effect는 실행마다 `cancelled` 플래그로 이전 결과를 무시한다.
- **수동 대결**(FR2-002): 클릭 핸들러가 **동기적으로** 컴퓨터 선택·대결 초안을 만든다(입력은 유실되지 않음, AC2-055). 정상이면 앱 수준 큐에 올리고 커밋 후 `COMMITTED(round, stats)`로 화면에 반영한다(**화면 표시 시점 = 저장 확정 시점**). 저장 불가이면 저장 없이 `PRACTICED`. 큐에서 앞선 저장이 실패하면 게이트가 닫혀 뒤따르던 항목은 `skipped`로 거절되고 연습으로 처리된다(G-2). **페이지가 언마운트되어도 이미 수락된 저장은 폐기되지 않고 커밋된다**(결과는 표시되지 않음, G-4). 브라우저 종료·새로고침 시 미커밋 기록의 저장 완료는 보장하지 않는다.
- **자동 대결**: 시작 요청 → `whenIdle()`로 큐 유휴 확인(G-3, 대기 중 중복 요청 무시) → 저장 불가·초기화 중이면 거절 → `RUN_STARTED` → `runAutoBattles`에 **큐로 감싼 저장소**를 주입해 실행(G-1). 실행 중 저장 실패·게이트도 자동 실행의 저장 실패 정책(`aborted`)으로 처리한다([6절](#6-자동-실행-101001000회-처리-전략)).
- **가드**: 실행 중·초기화 중에는 reducer가 모드 전환·설정 변경·수동 대결·초기화·새 시작을 무시한다. **초기화 중에는 저장 다시 시도를, 재시도 중에는 초기화를 막는다(G-6).** 컴포넌트는 같은 조건으로 `disabled`를 걸지만 최종 방어선은 reducer다(FR2-009, AC2-018·019·061).
- **전적이 바뀌는 경로는 4개뿐**: 저장소에서 읽음(`LOADED`/`RETRY_SUCCEEDED`), 커밋 후 저장소가 돌려준 값(`COMMITTED`/`RUN_PROGRESS`), 초기화 성공. 화면에서 임의로 `+1`하지 않는다(OQ-4).
- **`last` 갱신 순서(G-11)**: 큐 FIFO 순서가 확정 순서이고 액션은 그 순서대로 도착한다. 자동 시작 전 큐에 있던 수동 저장은 정상 반영되고(전적·`last`), 이후 자동 진행이 `last`를 갱신한다. `last`는 메모리에만 있고 새로고침·이동 시 사라진다(AC2-035). `saved=false`이면 "저장되지 않음·연습"이 함께 표시되고 전적을 바꾸지 않는다(P-12).
- **낭독(D1)**: 대표 live region 하나가 낭독하고 `announcement`는 `announce.ts`가 만든다. 같은 사건은 한 영역만 낭독한다([UI Contract 6절](contracts/ui-contract.md)).

**대안 비교**는 [research.md R-04](research.md)에 있다. 선택안(순수 reducer + 프레임워크 무관 비동기 모듈 + 앱 수준 저장소)이 v1 호환성, 테스트 가능성, 복잡도의 균형이 가장 좋다.

## 4. IndexedDB 저장 구조, 스키마, 마이그레이션 전략

상세 계약은 [contracts/storage-contract.md](contracts/storage-contract.md). 요약:

- DB `rps-lab` v1. `battles`(keyPath `seq`, 값 `{seq, user, computer, at}`, 인덱스 없음)와 `meta`(`"stats"` = `{wins, losses, draws}`). 결과는 저장하지 않고 `judge()`로 계산해 AC2-026이 구조적으로 성립한다.
- **트랜잭션**: 기록 저장은 `battles`+`meta` 한 `readwrite` 트랜잭션(① 카운터 읽기 ② `seq=마지막 키+1` 부여 후 전부 `add` ③ 카운터 `put`), **`oncomplete` 후에만 resolve**. 초기화도 두 저장소를 한 트랜잭션에서 비운다.
- **정합성 검증**: 연결의 첫 `loadStats`가 `승+패+무 === count()`를 확인하고 어긋나면 기록을 스캔해 카운터를 복구한다(FR2-020: 전적은 기록 기준). 비교는 [research.md R-02](research.md).
- **마이그레이션**: `onupgradeneeded`에서 번호순 단계 함수를 실행한다. 버전 1 단계는 저장소 생성뿐이고 **데이터 이전은 없다**(OQ-3). 이후 변경은 새 단계를 추가하는 방식이며 배포된 단계는 수정하지 않는다. 낮은 코드가 높은 DB를 열면(`VersionError`) 읽기 불가로 처리하고 데이터를 건드리지 않는다.
- **v1 localStorage**: 키 `rps-lab:score`를 읽지도 쓰지도 지우지도 않는다. `score-storage.ts`는 제거한다(AC2-045~047).

## 5. 저장 실패 시 연습 모드 전환과 복구

| 트리거 | 감지 | 결과 상태 |
|---|---|---|
| 초기 읽기 실패(`StoreError` 어느 종류든) | `LOAD_FAILED` + **게이트 닫힘(read)** | `unavailable(read)`, `stats=null`(0/0/0 표시 금지, AC2-058). 읽기 실패 안내 + 연습 대결 허용 |
| 수동 저장 실패(`write`) | `SAVE_FAILED` + **게이트 닫힘(write)** | `unavailable(write)`. 실패한 결과는 `saved=false`로 표시(P-12), 전적·기록 불변, 저장 실패 안내 |
| 자동 대결 중 저장 실패 | `RUN_FINISHED(aborted)` + 게이트 닫힘 | 실행 중단, 확정된 묶음까지만 반영, `unavailable(write)`. 실패한 묶음은 어디에도 없음(AC2-057). 중지 요청과 겹쳐도 `aborted`가 우선(G-8) |

**저장 불가 상태의 규칙**(P-14): ① 새 수동 대결은 모두 연습으로 처리하고 대결마다 자동으로 저장을 재시도하지 않는다 ② 자동 대결은 시작할 수 없고 안내한다(AC2-071) ③ 전적 초기화는 시도할 수 있으며 실패하면 일부만 지워지지 않고 안내한다 ④ 복구 전의 연습·실패 대결은 소급 저장하지 않는다.

**실패 게이트**(G-2): 큐는 쓰기 실패(`write`)나 초기 읽기 실패가 나면 게이트를 닫는다. 닫힌 동안 큐에 아직 시작하지 않은 쓰기는 저장을 시도하지 않고 `skipped`로 거절된다(수동 → 연습 처리, 자동 묶음 → `aborted`). 게이트는 **`RETRY_SUCCEEDED` 시점에만** 열린다.

**복구**(FR2-025): "저장 다시 시도" → `RETRY_STARTED`(초기화 중이면 불가, G-6) → `store.recover()`: 큐가 빌 때까지 기다린 뒤 연결을 새로 열고 → 통계 읽기(검증) → `meta` 임시 키 쓰기·삭제 → 모두 성공하면 **게이트를 열고** `RETRY_SUCCEEDED(stats)`: `ready`, 복구 안내, 연습 결과(`saved=false`)는 지워 중립 화면(AC2-070). 실패하면 `retry=failed`로 상태를 유지하고 앱은 깨지지 않는다(AC2-069). 기록 조회 오류 상태의 재시도도 같은 `recover()`를 쓴다. 판정 범위의 한계는 [research.md R-14](research.md).

**앱 내 이동과 새로고침**: 저장 불가 상태는 앱 수준 게이트가 기억하므로 **앱 내 페이지 이동 후 복귀해도 유지**된다(`LOADED_UNAVAILABLE`). 새로고침은 새 JS 컨텍스트라 게이트를 새로 만들고 저장소를 다시 확인한다(Spec: 새로고침 후 저장소를 다시 확인해 정한다). *이전 초안의 "이동 후 복귀하면 저장소를 다시 읽는다"를 P-14("명시적 재시도 성공 전까지")와 G-2에 맞게 바꾼 것이다.*

**낭독 책임**: 수동 저장 실패는 `role="alert"` 저장 안내가, 자동 중단은 대표 status의 5번 문장이 담당하고 같은 사건을 두 영역이 낭독하지 않는다. 상세는 [UI Contract 5·6절](contracts/ui-contract.md).

## 6. 자동 실행 10/100/1000회 처리 전략

**상수**(`auto-run.ts`, P-8 측정 후 조정 가능): 애니메이션 틱 간격 70ms. 묶음 크기 — 애니메이션 `max(1, N/100)`, 즉시 100.

| 횟수 | 애니메이션 | 즉시 결과 |
|---|---|---|
| 10 | 틱 10회 × 1건, 약 0.7초 | 묶음 1개 |
| 100 | 틱 100회 × 1건, 약 7초 | 묶음 1개 |
| 1,000 | 틱 100회 × 10건, 약 7초 (표시는 묶음의 마지막 대결) | 묶음 10개 |

**반복 알고리즘**(`runAutoBattles`, 프레임워크 무관, **큐로 감싼 `QueuedBattleStore`를 주입받음**):
0. (호출 전, 훅) `whenIdle()`로 큐 유휴 확인 → `RUN_STARTED`. 대기 중 중복 시작 요청은 무시.
1. 남은 횟수가 있고 `signal`이 중지되지 않았으면 다음 묶음을 만든다(`draftBattle` × 묶음 크기, 난수·시계 주입).
2. `await store.recordBattles(묶음)` — **커밋 후** 반환된 통계를 받는다. 실패하거나 게이트가 닫혀 `skipped`이면 **`aborted`로 종료**한다(이 묶음은 저장되지 않음). **중지 요청이 이미 들어와 있어도 저장 실패가 우선해 `aborted`로 기록한다(G-8).**
3. 진행(`done`, 마지막 대결, 통계)을 알린다. 진행 횟수는 항상 **확정된 수**다(AC2-014).
4. 애니메이션이면 `wait(70ms, signal)`(중지 시 즉시 깨어남). 즉시 결과는 대기 없이 다음 묶음.
5. 종료 시 `completed` / `stopped` / `aborted`와 이번 실행의 승·패·무 합계를 돌려준다. **즉시 결과도 앱 내 이동·`pagehide`로 중단되며 이미 커밋된 묶음까지만 확정 기록으로 남는다(G-9).**

즉시 결과는 묶음마다 IndexedDB 커밋을 기다리므로 메인 스레드를 길게 점유하지 않고 화면이 멈추지 않는다(FR2-006). 대안(1건씩 저장, 전체 1회 저장)과 비교는 [research.md R-05·R-06](research.md).

## 7. 즉시 실행과 애니메이션 실행의 차이

| 항목 | 즉시 결과 | 애니메이션 |
|---|---|---|
| 진행 표시줄·"n / N회" | 없음(P-6) | 있음 |
| 중지 버튼 | 없음 | 있음 |
| 실행 상태 표시 | "저장하며 실행하는 중…" + `aria-busy`, 시작 버튼 비활성(중복 시작 방지, AC2-062) | "대결 진행 중…", 진행 표시줄 갱신 |
| 대결 화면 표시 | 완료 후 마지막 확정 대결 1건 | 틱마다 확정된 마지막 대결 |
| 묶음 크기 | 100 | `max(1, N/100)` |
| 대기 | 없음 | 70ms/틱 |
| 전적 갱신 | 묶음 커밋마다 내부 갱신, 완료 시 화면 반영(진행 중 표시 변화 최소) | 틱마다 갱신 |
| 종료 요약 | 완료/중단 요약 | 완료/중지/중단 요약 |
| 낭독(대표 status) | 시작 시 2번 문장, 완료 4번 / 중단 5번 | 시작 시 1번 문장, 중지 3번 / 완료 4번 / 중단 5번 (대결마다 낭독하지 않음) |
| 코드 경로 | **같은 `runAutoBattles`** — 옵션(묶음 크기, 대기 여부)만 다름 | 위와 동일 |

두 방식이 같은 실행 모듈을 쓰므로 "정확히 N건, 누락·중복 없음"의 검증이 한 곳에서 이뤄진다.

## 8. 실행 중 중지, 화면 이동, 새로고침 처리

| 사건 | 처리 | 결과 |
|---|---|---|
| 중지 버튼(애니메이션) | `RUN_STOP_REQUESTED`(`stopping`, 버튼 비활성) + `abort()` | 새 묶음 시작 안 함. **이미 시작된 묶음은 끝까지 저장**되어 확정되면 포함, 아니면 완전 제외. 부분 반영 없음(AC2-016). 마지막 묶음이 확정되는 순간의 중지는 완료로 처리하고 이중 반영하지 않음 |
| 중지 중 저장 실패(G-8) | 실행 모듈이 실패를 우선 | `stopped`가 아니라 **`aborted`**로 기록, 낭독은 5번 문장 |
| 앱 내 이동(`/history` 등) | 게임 페이지 언마운트 cleanup에서 `abort()`(**애니메이션·즉시 결과 모두**, G-9). 큐에 수락된 수동 저장은 폐기하지 않음(G-4) | 새 묶음 시작 안 함, **이미 커밋된 묶음까지만** 남음. 도착하는 결과는 무시. 돌아와도 재개 없음(AC2-059) |
| 새로고침·탭 닫기 | JS 상태가 사라짐. 진행 중이던 묶음은 커밋됐거나 아님 | 저장 완료분만 남음, 설정·진행 상태 복원 없음(AC2-038, OQ-2). **커밋되지 않은 기록의 저장 완료는 보장하지 않음** |
| `pagehide` | `abort()` (즉시·애니메이션 모두) | 모든 "페이지 떠남"이 같은 의미 |
| bfcache 복원(뒤로가기·앞으로가기, G-10) | `pagehide`에서 이미 `abort()`되어 실행은 되살아나지 않음. 복원 뒤 진행 중이던 묶음이 늦게 끝나면 `stopped`/`aborted`로 정리 | 재개 없음. 수동 검증 M-10 |
| 초기화 중 이탈(G-5) | `clearAll`은 취소하지 않음. 트랜잭션은 이탈해도 **전부 적용되거나 전혀 적용되지 않음** | 이탈이 성공적 완료를 보장한다는 뜻이 아님. 다음 진입 때 저장소를 읽어 확인 |
| 탭이 백그라운드로 감(`visibilitychange`) | 아무것도 하지 않음 | 브라우저가 타이머를 늦출 수 있으나 정합성은 유지(Spec 엣지 케이스) |

재개 코드를 만들지 않으므로 "자동 재개 금지"가 구조적으로 보장된다. 근거: [research.md R-07](research.md).

## 9. 통계 집계 및 기록 페이지네이션

- **통계**: 카운터는 `meta.stats`에서 O(1)로 읽는다. 총 대결 = 합, 승률 = `wins/total*100`(무승부 포함), `toFixed(1)`, 0건은 `0.0%`(P-2, AC2-023·024). 비율 막대 폭은 반올림하지 않은 실제 비율, 범례는 같은 값의 퍼센트 텍스트(AC2-065). 계산은 `stats.ts` 순수 함수.
- **페이지네이션**(OQ-5): `listBattles({before, limit: 20})`이 `seq` 역순 커서로 `limit+1`건을 읽어 `hasMore`를 판단한다. "다음"은 현재 페이지 마지막 `seq`를 앵커로 쌓고 "이전"은 앵커를 꺼낸다. 읽는 양이 건수와 무관하고 중간에 기록이 늘어도 누락·중복이 없다(AC2-027). 페이지 라벨은 `p / pageCount(total)`.
- **상태**: 불러오는 중·빈 상태·오류를 각각 안내한다(AC2-029). 오래된 응답은 요청 번호로 버린다.
- **화면 최신성(다중 탭, P-9)**: 정합성과 구분한다. 통계는 마운트, 자신의 쓰기 응답, 초기화 성공, 재시도 성공, 새로고침에서 저장소 기준으로 갱신한다. 탭 재활성화 자동 갱신 등은 UX 변경이라 적용하지 않고 선택 제안으로만 둔다([storage-contract 3.5](contracts/storage-contract.md)).
- 비교와 근거는 [research.md R-02·R-03](research.md).

## 10. 전적 초기화와 데이터 일관성

1. "전적 초기화" 클릭 → `RESET_REQUESTED`(실행 중·재시도 중이면 불가) → **화면 내 확인 대화상자**(U5). 확인 전에는 통계·기록·마지막 결과가 바뀌지 않는다(AC2-044).
2. 취소(버튼 또는 `Esc`) → 변경 없음(AC2-060).
3. "전체 삭제" → `RESET_CONFIRMED`(`resetting`: 새 대결·자동 시작·저장 다시 시도 불가, AC2-061, G-6) → 앱 수준 큐에서 `clearAll()` 실행. **큐가 FIFO라 진행 중이던 저장이 끝난 뒤 초기화**된다.
4. `clearAll`은 `battles`와 `meta`를 **한 트랜잭션**에서 비운다. 성공 → `0/0/0`, 기록 0건, 마지막 결과·요약 초기화, 낭독 6번 문장(AC2-041·042). 실패 → 아무것도 바뀌지 않고 `role="alert"` 안내(AC2-043). 진행 중에는 낭독하지 않는다.
5. 자동 대결 실행 중에는 초기화 버튼이 비활성이다(먼저 중지, P-4, AC2-019).
6. 초기화 중 페이지 이탈은 트랜잭션 원자성(전부 또는 전무)만 보장하며 완료를 보장한다는 뜻이 아니다(G-5).
7. 손상 상태에서도 `clearAll`은 레코드를 읽지 않으므로 동작해 탈출구가 된다.
8. 다중 탭에서 한 탭이 초기화하면 다른 탭의 이어지는 저장은 초기화 이후의 저장소에 `seq=1`부터 쌓이며 반환 통계는 저장소 기준이다(P-9).

## 11. 반응형 UI 및 접근성

- **스타일**: CSS Modules + `globals.css`의 CSS 변수 토큰(최종 HTML `:root`의 보정 색상 포함, U2). 컨테이너 쿼리는 앱 루트 폭 기준(U4: 600px 이하). 컨테이너 쿼리는 컨테이너 자신의 스타일을 못 바꾸므로 패딩은 안쪽 요소가 가진다.
- **레이아웃**: 데스크톱 헤더 오른쪽 탐색, 600px 이하에서는 제목 아래(U6). 선택 버튼은 데스크톱 흰 배경+테두리, 모바일 연한 채움(U1). 기록은 표와 카드 두 마크업을 렌더하고 CSS로 하나만 보인다(접근성 트리 중복 없음, [research.md R-09](research.md)).
- **접근성**: 네이티브 `button`/`a`, 상태는 `aria-pressed`·`aria-busy`·`progressbar`, 오류는 `role="alert"`, 진행·완료는 `role="status"`. 포커스 링 3px `#4e80df`, 오프셋 2px. 모든 버튼 ≥ 44px. 확인 대화상자는 `alertdialog`로 4가지 요구(포커스 이동, 포커스 유지·배경 `inert`, `Esc`, 포커스 복원)를 직접 구현한다([UI Contract 4절](contracts/ui-contract.md), 근거 [R-08](research.md)).
- **동작 줄이기**(P-13): CSS 전환·스피너·스켈레톤을 끈다([research.md R-16](research.md)).
- **승/패/무 색상 카드**(D2 A안, 게임·기록 두 페이지 공통 컴포넌트, 텍스트 라벨 유지)와 비율 막대 색(승=녹색, 패=빨간색, 무=회색)은 UI Contract 9절을 따른다.
- **상단 탐색**: `usePathname()`이 끝 슬래시를 포함(`/history/`)하므로 활성 판정은 정규화해 비교하고, 경로 문자열을 화면에 출력하지 않는다(404 페이지 하이드레이션 경고 방지, 16절).
- **낭독**: 단일 대표 live region(D1)과 `alert` 책임표는 UI Contract 6절.
- 대비는 U2 승인 색상으로 일반 4.5:1, 큰 글자 3:1. 버튼 테두리 대비는 승인된 현 상태를 유지하고 구현에서 식별성을 검증한다(15절 D3).

## 12. 테스트 전략과 성능 검증

모든 테스트 이름은 `AC2-0xx: …` / `FR2-0xx: …` / `SC2-0xx: …`로 시작해 Spec과 grep으로 추적한다. 파일은 소스 옆에 둔다.

| 계층 | 파일 | 의존 | 검증 |
|---|---|---|---|
| 순수 단위 | `rps.test.ts`(기존), `battle`·`stats`·`auto-run`·`announce`·`game-session`·`save-queue` `.test.ts` | 없음 | 9조합·분포, 초안 생성(고정/랜덤 손, 시드), 퍼센트·0건·비율, reducer 전이·가드·전적 변경 경로 4개, 낭독 문장, 큐 순서·실패 후 연습 처리 |
| 실행 로직 | `auto-runner.test.ts` | 메모리 저장소, 가짜 타이머 | 10/100/1,000회 정확히 N건, 묶음 크기, 중지 시 k건, 진행 횟수=확정 수, 저장 실패 중단, 중지·완료 경합, 묶음 원자성 |
| 저장소 어댑터 | `idb-battle-store.test.ts` | **`fake-indexeddb`(승인 시)** | 커밋 후 resolve, 쓰기 중 예외 주입 시 두 저장소 불변, 카운터 복구, 키셋 순회(55건), **읽은 레코드 수가 건수와 무관**(커서 이동 횟수 스파이), 초기화 원자성, 연결 2개 동시 쓰기, 손상 레코드, 버전 처리 |
| 불변식 속성 | `invariants.test.ts` | 메모리 저장소 + 어댑터 | 수동·자동·중지·초기화·저장 실패·재시도를 시드 난수로 섞은 뒤 `승+패+무 = 기록 수`(SC2-002) |
| 컴포넌트 | `Game.test.tsx`, `History.test.tsx`, `AppHeader.test.tsx` | 메모리 저장소 주입, `next/navigation` 모킹 | 모드 토글·자동 UI 표시 규칙, 흐름 AC, 비활성·가드, 저장 실패·연습·재시도·복구, 확인창 포커스(jsdom 한계는 UI Contract 4절), 결과 영역 `role="status"` 1개, 기록 페이지 상태 4종·페이지네이션·표/카드 동일 데이터·막대 접근성, 서버 렌더에 전적·버튼 없음 |
| 수동 | `verification.md` | 실브라우저·기기 | M-01~M-14([quickstart.md](quickstart.md)): 레이아웃·터치·표/카드 전환·키보드·확인창 실제 `inert`·스크린리더·네트워크·성능·실제 저장 실패·새로고침/이동·다중 탭·대비·동작 줄이기·브라우저별 |

**주입과 실패 만들기**: 저장소는 `store` prop으로 주입하고, 메모리 저장소는 "N번째 쓰기 실패", "지연", "읽기 실패"를 설정할 수 있다. 난수·시계·`wait`도 주입한다.

**v1 테스트 이관**: 기존 수동 대결 AC 테스트는 단언을 유지하고 `renderGame()` 도우미(메모리 저장소 주입, 로드 완료 대기)만 바꾼다. AC-017~021(localStorage 전제)은 AC2-034~047·058 등 v2 테스트로 대체하며 대응표를 verification에 남긴다.

**jsdom 한계**(조사 결과, [research.md](research.md)): `indexedDB`, `showModal`, `inert`, `matchMedia`, `ResizeObserver`, 레이아웃·컨테이너 쿼리가 없다. 따라서 ① IndexedDB는 어댑터 테스트와 메모리 저장소로 나눠 검증하고 ② `inert`·표/카드 전환·터치 크기는 수동(M-01~M-05)이며 ③ 자동 테스트는 속성·키보드 이벤트·포커스 이동까지만 확인한다.

**성능 검증**(P-8): 방법은 [quickstart.md 4절](quickstart.md). 규모 1,000 / 10,000 / 100,000건, 지표 5종, 5회 이상 중앙값·최댓값. 절대 수치는 측정 후 사용자와 합의한다. 자동화 가능한 규모 독립성은 어댑터 테스트의 커서 이동 횟수로 결정적으로 검증한다. 제품 코드에는 `performance.mark/measure`만 최소 추가한다(RK-15).

**이번 보완으로 추가되는 자동 검증**
- `save-queue.test.ts`: FIFO 순서, 게이트 닫힘 후 미시작 쓰기 `skipped`, `whenIdle()`, `recover()` 성공에서만 게이트 열림, **언마운트(소비자 해제) 후에도 수락된 쓰기가 커밋됨**, 팩토리로 테스트 간 격리.
- `auto-runner.test.ts`: 시작 전 큐 유휴 확인, 실행 중 게이트 닫힘 → `aborted`, **`stopping` 중 저장 실패 → `aborted` 우선**, 즉시 결과의 `abort()`(이탈) 시 커밋된 묶음까지만 남음.
- `game-session.test.ts`: `LOADED_UNAVAILABLE`, G-6 상호 배제 가드, `RETRY_SUCCEEDED`에서 `notice`와 `last` 처리, `RUN_FINISHED` 우선순위.
- `idb-battle-store.test.ts`: 트랜잭션 오류가 연결을 닫지 않음, `close`/`versionchange` 뒤 새 요청만 재연결, 진행 중 요청 유지, `recover()` 순서.
- `AppHeader.test.tsx`: `usePathname`이 `/`, `/history/`(끝 슬래시)를 돌려줄 때 `aria-current`가 올바름.
- `announce.test.ts`: 승인된 6개 문장 원문, 요약 박스와 같은 입력에서 수치 일치.
- 정적 내보내기 산출물 검사(Quickstart D-01): `out/index.html`, `out/history/index.html`, `out/404.html` 존재와 자산 경로 접두사.

**품질 게이트**: `npm run typecheck`, `npm run lint`, `npm test`, **정적 내보내기 빌드**(`next build`) 모두 통과. `eslint-disable`·`localStorage` 사용 없음을 `grep`으로 확인한다.

## 13. 예상 위험과 대응 방안

| ID | 위험 | 영향 | 대응 |
|---|---|---|---|
| RK-1 | 브라우저의 저장소 퇴출·제한(Safari의 장기 미사용 데이터 정리, 시크릿 모드, 용량 압박)으로 기록이 사라지거나 쓰기가 실패 | 사용자 기록 소실 | 쓰기 실패는 저장 불가 흐름이 처리. **퇴출 자체는 v2 범위 밖으로 수용 확정(2026-11-05)** |
| RK-2 | v1 `Game.test.tsx` 897줄을 비동기 로드 모델로 이관하는 작업량·회귀 | 일정, v1 AC 회귀 | 단언은 유지·준비 코드만 변경, 이관 대응표 작성, 이관을 구현 초반 단계에 배치 |
| RK-3 | jsdom이 `inert`·레이아웃·IndexedDB를 지원하지 않음 | 자동 검증 범위 제한 | 계층 분리(어댑터/메모리 저장소), 수동 M-01~M-05로 보완, 한계를 verification에 명시 |
| RK-4 | 연결당 `count()` 검증이 10만 건에서 느릴 수 있음 | 첫 화면 지연 | M-08 측정. 느리면 검증을 지연·생략(카운터가 트랜잭션으로만 바뀌어 일반 경로는 안전)하고 불일치 복구는 별도 계기로 이동 |
| RK-5 | 백그라운드 탭의 타이머 지연으로 애니메이션이 느려짐 | 체감 시간 | Spec이 허용(정합성 유지). 틱 사이에 상태가 없어 지연이 데이터에 영향 없음 |
| RK-6 | 다중 탭 화면 stale, 한 탭 초기화와 다른 탭 자동 대결 경합 | 화면 값 불일치 | 저장은 IndexedDB 직렬화로 유실·중복 없음. 반환 통계는 저장소 기준. 실시간 동기화는 비범위(P-9). M-11로 확인 |
| RK-7 | 묶음 저장은 "한 대결씩 저장"이 아님 | AC 해석 | 각 묶음이 원자적이라 AC2-016·037(전부/전무, 부분 반영 없음)을 만족. 실패 영향은 묶음 하나(최대 100건)로 한정. 해석 논쟁 시 묶음 크기를 1로 줄일 수 있음(성능 영향) |
| RK-8 | 재시도 거짓 복구(읽기·작은 쓰기는 되지만 이후 쓰기 실패) | 복구 직후 재실패 | 복구 판정에 쓰기 프로브 포함([research.md R-14](research.md)). 재실패 시 AC2-039·057 흐름이 다시 적용(허용) |
| RK-9 | StrictMode 이중 effect, 언마운트 후 도착하는 비동기 결과 | 중복 로드, 상태 갱신 경고 | 실행마다 취소 플래그·요청 번호, 언마운트 시 `abort`, StrictMode 테스트 |
| RK-10 | 표/카드 이중 DOM, 컨테이너 쿼리로 jsdom에서 전환 검증 불가 | 접근성 트리 중복, 테스트 한계 | `display:none`으로 한쪽만 노출, 같은 데이터에서 파생, 전환은 M-03 |
| RK-11 | live region이 여러 곳에서 낭독되어 이중 낭독·폭주 | 보조기술 사용성 | D1 승인(단일 대표 live region + `alert` 책임표), 자동 중 대결마다 갱신 금지 테스트, M-06 |
| RK-12 | 성능 수치 미확정(P-8) | 기준 부재 | 방법 승인됨. 측정 후 사용자와 합의. 상수(`70ms`, 묶음 크기)는 한 파일에 모아 조정 용이 |
| RK-13 | `fake-indexeddb` 설치·호환 문제 | 어댑터 자동 검증 약화 | 승인 방향 확정. 구현 단계에서 설치·동작 확인, 문제 시 사용자에게 보고 |
| RK-14 | 브라우저별 IndexedDB 실패 양상 차이(용량 초과 오류 이름·타이밍) | 일부 환경에서 안내가 늦음 | 모든 쓰기 오류를 `write`로 정규화, M-14로 브라우저별 확인 |
| RK-15 | `.specify/feature.json`이 v1을 가리킴 | Tasks 단계 스킬이 v1 경로를 잡음 | **해결**: v2 경로로 변경함(2026-11-05, git 무시 파일) |
| RK-16 | AC2-054·FR2-023 원문("동작을 위한 서버/네트워크 요청이 없다")과 정적 파일 요청(JS 청크·`__next*.txt`)의 해석 긴장(R-22) | 문자 그대로 읽으면 이동 클릭 시 요청이 위반으로 보일 수 있음 | **D5 (a) 승인**: 같은 출처 정적 파일 허용 + `prefetch={false}`. Spec 미수정, M-07에 판정 기준 기록, 긴장은 15.2에 보고 |
| RK-17 | GitHub Pages 출처(`hyeonseoman.github.io`)를 이 계정의 모든 프로젝트 사이트가 공유 | 다른 사이트가 IndexedDB `rps-lab`에 접근 가능, DB 이름 충돌 | 개인정보 미저장, DB 이름 고유 유지, 필요 시 사용자 도메인 분리는 범위 밖 |
| RK-18 | Pages의 응답 캐시와 배포 직후 버전 불일치(이전 HTML이 새 배포에서 사라진 청크를 참조) | 배포 직후 일시적 오류·빈 화면 | 새로고침으로 복구, D-xx에서 확인. 캐시 시간은 문서로 확인하지 못해 실제 헤더로 확인 |
| RK-19 | `basePath`·`trailingSlash` 설정 오류로 자산·링크 404 | 배포본 깨짐 | 배포 빌드 산출물 검사(D-01), 정적 서버 사전 확인(Quickstart 7.2) |
| RK-20 | `usePathname`의 끝 슬래시, 404 페이지 하이드레이션 경고 | 활성 링크 오표시, 콘솔 오류 | 정규화 비교, 경로 의존 출력 금지, `AppHeader.test` |
| RK-21 | Pages 무료 제약: 비공개 저장소 가능 여부 미확인, 한도, 상업적 SaaS 금지 | 배포 불가·정책 위반 | 저장소 공개 여부를 사용자가 확인(15절). 한도는 현재 규모(1MB 미만)에 여유, 학습용이라 금지 조항 해당 없음 |
| RK-22 | Actions 배포 실패·롤백 절차 미검증 | 장애 복구 지연 | 16.2의 확인 절차·롤백, D-11에서 리허설 |
| RK-23 | 로컬 개발 주소와 배포 주소 차이(basePath) | 로컬에서만/배포에서만 깨짐 | basePath는 배포 빌드에서만 환경변수로 지정, 로컬에서도 배포 빌드 확인 가능 |
| RK-24 | 모듈 단일 인스턴스(앱 수준 저장소)의 테스트 간 상태 누수, 게이트 수명 | 테스트 간섭 | 팩토리로 새 인스턴스 주입, 새로고침이 새 컨텍스트임을 문서화 |
| RK-25 | **큐 맨 앞 쓰기가 오래 걸리거나 막히면**(다른 탭의 긴 트랜잭션 등) 뒤의 쓰기와 `whenIdle()` 대기가 함께 지연 | 화면이 "저장 중"에 머무름, 자동 시작이 늦어짐 | 정상 환경에서는 짧음. 쓰기 타임아웃은 **현재 추가하지 않음**(구현·검증 단계에서 측정 후 필요 시 재검토) |
| RK-26 | bfcache 복원 시 타이머·연결 상태 | 복원 뒤 오래된 화면·연결 | `pagehide` 중지 + 연결 무효화 시 재연결, M-10 수동 검증 |

## 14. Spec의 FR·AC·SC와 설계 요소의 추적 관계

### 14.1 FR → 설계 요소

| FR | 설계 요소 (Plan 절) | 주요 검증 |
|---|---|---|
| FR2-001 | `ModeToggle`, reducer `MODE_SET`, `aria-pressed` (3, 11) | Game.test |
| FR2-002 | 수동 흐름: 동기 초안 → 저장 큐 → `COMMITTED`, v1 `rps.ts` (3) | Game.test, save-queue.test |
| FR2-003 | `GameBoard`의 모드별 렌더(수동 버튼 vs 자동 패널) (2) | Game.test |
| FR2-004 | `AutoPanel`, `AutoSettings`, `draftBattle` (2, 6) | auto-run.test, Game.test |
| FR2-005 | `rps.ts` 재사용, 주입 난수, 호출 순서 고정 (1, 6) | rps.test, auto-run.test |
| FR2-006 | `runAutoBattles` 즉시 경로(묶음 100), 실행 상태 표시 (6, 7) | auto-runner.test, Game.test |
| FR2-007 | 애니메이션 경로(70ms, 묶음 `N/100`), `progressbar` (6, 7) | auto-runner.test, Game.test |
| FR2-008 | `AbortController`, `stopping`, 묶음 사이 취소 (8) | auto-runner.test |
| FR2-009 | reducer 가드 + `disabled` (3) | game-session.test, Game.test |
| FR2-010 | 저장소가 돌려준 통계만 표시, `ScoreCards`(색상 카드, D2 A안) (3, 9, 11) | Game.test, invariants.test, M-01 |
| FR2-011 | `stats.ts`, `StatsPanel` (9) | stats.test, History.test |
| FR2-012 | `BattleRecord`, `recordBattles`, `seq`·`at` (4) | idb-battle-store.test |
| FR2-013 | `listBattles` 키셋, `RecordList`(표+카드), `Pager`, 상태 3종 (9) | store.test, History.test, M-03 |
| FR2-014 | 키셋 O(20), 통계 O(1), 묶음 저장 (4, 9, 12) | store.test(커서 횟수), M-08 |
| FR2-015 | `AppHeader` + 라우트 `/`·`/history` (2) | AppHeader.test |
| FR2-016 | IndexedDB 영속, 마지막 결과는 메모리만 (3, 4) | store.test, Game.test |
| FR2-017 | 트랜잭션 원자성, 순차 큐, 취소 규칙, 검증·복구 (3~5, 8) | store.test, invariants.test |
| FR2-018 | `StoreError` 정규화, 연습 모드, `last.saved`, 알림 (5) | Game.test, auto-runner.test |
| FR2-019 | `ResetDialog`, `clearAll` 원자성, 가드 (10) | Game.test, store.test, M-05 |
| FR2-020 | IndexedDB 단일 저장소, `score-storage` 제거, localStorage 미사용 (1, 4) | Game.test(스파이), grep |
| FR2-021 | v1 구조 유지, v1 AC 테스트 단언 유지 (1) | v1 이관 테스트 |
| FR2-022 | 네이티브 요소, 44px, 컨테이너 쿼리, 낭독 규칙 (11) | Game.test, M-01·02·04·06 |
| FR2-023 | 서버 코드·fetch 없음, IndexedDB만 | M-07, grep |
| FR2-024 | `RatioBar`(aria-hidden) + 범례 텍스트 (9, 11) | stats.test, History.test, M-06 |
| FR2-025 | 재시도 흐름(재연결+프로브), 복구, 자동 불가 (5) | Game.test, game-session.test |

### 14.2 AC → 검증

`Game`=`Game.test.tsx`, `History`=`History.test.tsx`, `Header`=`AppHeader.test.tsx`, `store`=`idb-battle-store.test.ts`, `runner`=`auto-runner.test.ts`, `inv`=`invariants.test.ts`, `M-xx`는 [quickstart](quickstart.md)의 수동 절차.

| AC | FR | 검증 | 핵심 |
|---|---|---|---|
| AC2-001 | 001,003,021 | Game | 첫 렌더 직접 모드, 선택·결과·전적·초기화 위치 |
| AC2-002 | 001 | Game | 토글 마우스·키보드, `aria-pressed`, 선택 구분 |
| AC2-003 | 002 | Game | v1 AC-002·003 유지 |
| AC2-004 | 002,012 | Game, store | 대결 1회 → 기록 1건, 해당 항목·총 +1 |
| AC2-055 | 002,012,017 | Game, save-queue | 연속 N입력 → N건, 유실·중복 없음(저장 지연 주입) |
| AC2-005 | 003 | Game | 직접 모드에 자동 UI 없음 |
| AC2-006 | 003 | Game | 자동 모드: 설정 표시·선택 버튼 없음·결과·전적·초기화 유지 |
| AC2-007 | 004 | Game | 고정/랜덤, 랜덤이면 손 선택 UI 없음 |
| AC2-008 | 004 | Game | 즉시/애니메이션 선택 |
| AC2-009 | 004 | Game | 10/100/1,000 선택·표시 |
| AC2-010 | 004,005 | auto-run | 고정 손 유지, 랜덤 손 분포(시드) |
| AC2-011 | 005 | rps, auto-run | 9조합·균등 난수 주입 |
| AC2-012 | 006 | runner, Game | 즉시 N회 → N건, 최종 전적·마지막 결과 |
| AC2-013 | 006 | Game | 완료 후 시작 버튼 재사용 |
| AC2-062 | 006,009 | Game | 처리 중 상태·중복 시작 방지·해제 |
| AC2-014 | 007 | runner, Game | 순서 표시, 진행 횟수=확정 수, 70ms, 묶음 |
| AC2-015 | 007 | runner, Game | 끝까지 N건, 표시·중지 사라짐 |
| AC2-016 | 008 | runner | 중지 → k건만, 진행 중 묶음 전부/전무 |
| AC2-017 | 008 | runner, game-session | 불변식, 마지막 결과=마지막 확정 |
| AC2-018 | 009 | game-session, Game | 실행 중 조작 무시·비활성 |
| AC2-019 | 009,019 | Game | 실행 중 초기화 불가 |
| AC2-020 | 010 | Game, M-01 | 합산 전적(색상 카드 구조·위치는 Game, 스타일은 M-01 화면 확인) |
| AC2-021 | 010,012 | inv | 합 = 기록 수 |
| AC2-022 | 011 | stats, History | 총·승·패·무·승률 표시 |
| AC2-023 | 011 | stats | 3/1/1 → 60.0% |
| AC2-024 | 011 | stats, History | 0건 → 0.0% |
| AC2-025 | 012 | store, History | 선택·결과·순번·일시, 수동/자동 구분 없음 |
| AC2-026 | 012 | store | 결과 = `judge(두 선택)` (결과 비저장) |
| AC2-027 | 013 | store | 키셋 순회 누락·중복 없음 |
| AC2-028 | 013 | store, History | 최신순 20건, 이전/다음, 경계 비활성, 전체 렌더 안 함 |
| AC2-029 | 013 | History | 빈·로딩·오류 안내 |
| AC2-032 | 015 | Header | 탐색 2영역, 현재 위치 |
| AC2-033 | 015 | History | 승률·통계·기록 존재 |
| AC2-063 | 013 | History, M-03 | 넓은 화면 표 |
| AC2-064 | 013,022 | History, M-03 | 카드 동일 정보·순서, 가로 스크롤 없음 |
| AC2-065 | 024 | stats, History | 막대 구간=비율, 범례 |
| AC2-066 | 024 | History | 0건 빈 막대·0.0% |
| AC2-067 | 024 | History, M-06 | 숫자 정보 기준, 막대 장식·비포커스 |
| AC2-041 | 019 | Game, store | 초기화 → 0/0/0·기록 삭제·중립 화면 |
| AC2-042 | 019 | store | 새 연결에서도 0 |
| AC2-043 | 019 | store, Game | 실패 시 전부 불변·안내 |
| AC2-044 | 019 | Game, M-05 | 확인 절차, 확인 전 불변 |
| AC2-060 | 019 | Game | 취소 → 불변 |
| AC2-061 | 019 | Game, game-session | 초기화 중 대결 시작 불가 |
| AC2-034 | 016 | store, Game | 재마운트 후 동일 |
| AC2-035 | 016 | Game | 마지막 결과 복원 안 됨 |
| AC2-036 | 017 | inv | 임의 순서에서 불변식 |
| AC2-037 | 017 | store | 전부/전무, 중복 없음 |
| AC2-038 | 017 | runner, M-10 | 새로고침 시 저장분만, 재개 없음 |
| AC2-059 | 017 | Game, M-10 | 언마운트 시 중지, 복귀해도 재개 없음 |
| AC2-039 | 018 | Game | 저장 실패 안내·앱 유지 |
| AC2-040 | 018 | Game, store | 실패/연습은 기록·전적 불포함 |
| AC2-056 | 018 | Game, game-session | 연습 대결, 자동 재시도 안 함 |
| AC2-057 | 018 | runner, Game | 자동 중단·저장분만 |
| AC2-058 | 018 | Game | 읽기 실패 → 0/0/0 아님·안내·연습 가능 |
| AC2-068 | 018 | Game, announce | '저장되지 않음' 표시·문장·전적 불변 |
| AC2-069 | 025 | Game | 재시도 중·실패 유지·성공 해제 |
| AC2-070 | 025 | Game, game-session | 복구 후 기록, 소급 없음, 연습 결과 비움 |
| AC2-071 | 025 | Game | 저장 불가 시 자동 시작 불가·안내 |
| AC2-045 | 020 | Game | v1 값 있/없 → 0/0/0 |
| AC2-046 | 020 | Game | v1 값 읽지도 쓰지도 않음(스파이) |
| AC2-047 | 020 | Game | 손상 값도 영향 없음 |
| AC2-030 | 014 | M-08, store | 대량 기록 첫 화면(규모 독립성은 store) |
| AC2-031 | 014 | M-08 | 이동·입력 응답성 |
| AC2-048 | 021 | v1 이관 테스트 | v1 수동 AC 회귀 없음 |
| AC2-049 | 021 | Game | 결과 영역 구조·`role="status"` 1개 |
| AC2-050 | 021 | 문서 검토 | v1 문서 무변경(`git diff`) |
| AC2-051 | 022 | Game, M-04 | 키보드·이름·상태·포커스 |
| AC2-052 | 022 | M-01, M-02 | 320~1280 가로 스크롤 없음, 44px |
| AC2-053 | 022 | announce, Game, M-06 | 요약만 낭독, 오류·완료 안내 |
| AC2-054 | 023 | M-07, grep | 서버 요청 없음 |

### 14.3 SC·P 항목

| SC | 검증 |
|---|---|
| SC2-001 | M-08(즉시 100·1,000회 완료 시간 측정·기록) |
| SC2-002 | `invariants.test.ts`(모든 시나리오 불일치 0건) |
| SC2-003 | M-08 + store 규모 독립성 테스트 |
| SC2-004 | runner 중지 테스트 + M-08 중지 반응 |
| SC2-005 | M-01, M-04 |
| SC2-006 | v1 이관 테스트(회귀 0건) |
| SC2-007 | M-08(긴 작업 측정) |

P-1~P-14는 변경하지 않으며 설계에서 다음과 같이 지킨다: P-1(`seq`·`at`, 순번이 확정 순서) · P-2(`formatPercent`) · P-3(모드별 렌더) · P-4(reducer 가드) · P-5(`pickComputerChoice`) · P-6(즉시: 표시줄·중지 없음, 실행 상태) · P-7(단일 대표 live region, D1 승인) · P-8(방법 승인, 수치 미확정) · P-9(다중 탭 비실시간) · P-10(`RatioBar`, 색 의미: 승=녹색·패=빨간색·무=회색 확정) · P-11(원문 유지, 항목별 승인 결과를 UI Contract 9절에 기록: 승/패/무 색상 카드 A안) · P-12(`last.saved`) · P-13(CSS 동작 줄이기) · P-14(저장 불가 규칙).

### 14.4 동시성 규칙(G-1~G-11)의 문서 위치

| G | 규칙 | 기준 문서 위치 |
|---|---|---|
| G-1 | 자동 실행 모듈에도 큐로 감싼 저장소 주입 | storage-contract 3.1(2), plan 3·6절, data-model 앱 수준 저장소 |
| G-2 | 실패 게이트는 `RETRY_SUCCEEDED`(`recover()` 성공)에서만 해제 | storage-contract 3.2, data-model `RETRY_SUCCEEDED`·`LOADED_UNAVAILABLE`, plan 5절 |
| G-3 | 자동 시작 전 큐 유휴 확인, 실행 중 저장 실패는 자동 실행 정책 | storage-contract 3.2(4), data-model `RUN_STARTED`, plan 3·6절 |
| G-4 | 언마운트가 수락된 수동 저장을 폐기하지 않음, 큐 생명주기는 앱 수준 | storage-contract 3.1, plan 3·8절, research R-17 |
| G-5 | 초기화는 이탈 시 전부 또는 전무(완료 보장 아님) | storage-contract 3.3(4), plan 8·10절 |
| G-6 | 초기화↔재시도 상호 배제 | storage-contract 3.3(5), data-model 가드, plan 3·10절, ui-contract 4절 |
| G-7 | 트랜잭션 오류와 연결 무효화 구분, 세대 번호 불필요 | storage-contract 4절 연결 관리, research R-18 |
| G-8 | `stopping` 중 저장 실패 → `aborted` 우선 | storage-contract 3.3(2), data-model `RUN_FINISHED`, plan 5·6·8절 |
| G-9 | 즉시 결과도 이동·`pagehide` 중단, 커밋된 묶음까지만 | storage-contract 3.3(3), plan 6·8절, research R-07 |
| G-10 | bfcache 수동 검증 | quickstart M-10, plan 8절 |
| G-11 | 확정 순서 = 큐 순서, 시작 전 수동 커밋 정상 반영 | storage-contract 3.4, data-model `COMMITTED`, plan 3절 |
| 다중 탭 | 정합성(보장)과 화면 최신성(실시간 보장 안 함) 구분 | storage-contract 3.5, plan 9절 |

### 14.5 배포와 Spec 추적
GitHub Pages 배포는 Spec의 FR·AC·SC에 대응하지 않는 Plan 범위의 인프라 결정이다. 다만 FR2-016·FR2-020(IndexedDB 영속), FR2-023·AC2-054(서버 없음, **D5 (a) 승인, 15.2 보고**), FR2-022(반응형)와의 호환을 16절에서 검토했다. 새 요구사항은 만들지 않았다.

## 15. 남은 UI Contract 결정과 사용자 승인 사항

### 15.1 승인 기록 (2026-11-05)

| 항목 | 승인 내용 | 반영 위치 |
|---|---|---|
| **D2** 승/패/무 색상 카드 | **A안**: 게임·기록 두 페이지 모두 최종 UI 레퍼런스의 색상 카드. FR2-010·AC2-020은 제안 문구로 변경, **P-11 원문 유지** | spec.md(FR2-010, AC2-020, 남은 차이 표), UI Contract 9절 |
| P-10 색 의미 | 승=녹색, 패=빨간색, 무=회색, 텍스트 라벨 유지(P-10 원문 불변) | UI Contract 3·9절 |
| **D1** 낭독 모델 | 단일 `role="status"`. 6개 문장·그룹 이름("대결 모드", "기록 페이지 이동")·읽기 실패 문구 승인. 시각 문구와 낭독 문구는 의미·수치만 일치하면 됨 | UI Contract 2·3·5·6절, data-model 6절, 아래 D1 |
| **D3** 버튼 테두리 | 현재 상태 유지, 구현 단계에서 식별성 검증 | 아래 D3 |
| `fake-indexeddb` | 개발 의존성 추가 방향 승인(설치는 구현 단계) | Technical Context, Complexity Tracking |
| 저장소 퇴출 위험 | v2 범위 밖으로 수용 | RK-1, storage-contract 8절 |
| `.specify/feature.json` | `feature_directory`를 `specs/002-rps-simulation-stats`로 변경(기존 형식 유지, git 무시 파일) | research.md 환경 사실, RK-15 |
| **D5** AC2-054 판정 | **(a)**: 같은 출처 Next.js 정적 파일 요청 허용, `next/link`에 `prefetch={false}`. Spec 원문은 수정하지 않음 | UI Contract 1절, Quickstart M-07, research R-22, 아래 15.2 보고 |
| 복구됨 안내 해제 | 다음 확정 대결·초기화 성공·페이지 이동에서 해제, **모드 전환만으로는 해제하지 않음** | UI Contract 5절, data-model 전이표, Quickstart M-17 |
| 재시도 실패 낭독 | `저장을 다시 시도했지만 실패했어요. 연습 대결은 계속할 수 있어요.`(`role="alert"`, 낭독 전용) | UI Contract 5·6절, data-model 6절 |
| 배포 범위 | GitHub Pages 배포 설계는 **Plan에만 유지**(Spec 변경 없음). 실제 서비스 주소·경로는 배포 후 확인 | 16절 |
| 선택 제안 | 탭 재활성화 자동 갱신, 쓰기 타임아웃은 **현재 추가하지 않음**(필요 시 구현·검증 단계에서 재검토) | storage-contract 3.5, RK-25 |

### D2 반영 내역 (Spec 문구, 사용자 승인 후 최소 수정)

| 위치 | 변경 전 | 변경 후 |
|---|---|---|
| FR2-010 (261행) | …게임 페이지에서 v1과 같은 위치·스타일로 표시되어야 한다. | …게임 페이지에서 v1과 같은 위치에, 최종 UI 레퍼런스(`docs/references/rps-lab-v2-ui.html`)의 스타일로 표시되어야 한다. |
| AC2-020 (128행) | …v1과 같은 위치·스타일로 표시된다. | …v1과 같은 위치에 최종 UI 레퍼런스의 스타일(승·패·무 색상 카드)로 표시된다. |
| 남은 차이 표 | 색상 카드 행 존재 | 행 삭제, "해결되어 제외" 문단에 추가 |

연동 갱신: Plan 14절 추적 행, Research(결정 이관 현황), UI Contract(9·10절). 영향을 받지 않는 요구사항: AC2-001·FR2-003(위치), FR2-021·AC2-049(구조), AC2-048(v1 수동 AC, v1 Spec에는 색·스타일 조항 없음), AC2-067(막대는 텍스트 범례 유지).

### D1 요약 — 단일 대표 live region (승인)
- 결과 영역 안 `role="status"` 1개가 수동 결과, 자동 실행(시작·처리 중·중지·완료·중단), 초기화 성공, 재시도 중·복구를 낭독한다. 오류는 `role="alert"`가 맡는다. 요약 박스·진행·안내 박스는 live가 아니다.
- **같은 사건은 한 영역만 낭독**한다. 허용된 유일한 중복은 수동 저장 실패 때 결과 문장의 "(저장되지 않음 · 연습 대결)" 꼬리표다(AC2-068). 우선순위: `alert`(assertive)가 먼저, 대표 status(polite)가 이어진다. 자동 중단은 대표 status 5번 문장이 담당하고 저장 안내 박스는 live 없이 표시한다. 책임표는 [UI Contract 6절](contracts/ui-contract.md).

### D3. 버튼 테두리와 상태 표시의 비텍스트 대비 검증 — 승인된 현 상태 유지, 구현 단계 검증 절차

- 대상: 필 버튼 테두리(흰 배경 대비 약 1.25:1), 중지 버튼 테두리(약 1.9:1) 등 WCAG 1.4.11(3:1) 미달 테두리.
- **검증 절차(M-12)**: ① 컨트롤 경계·채움·포커스 링·선택 상태 색의 인접 배경 대비를 계산해 표로 기록 ② 식별성 기준: 모든 버튼은 텍스트 레이블이 있고, 선택 상태는 채움+`aria-pressed`로, 비활성은 투명도+안내 문구로, 포커스는 ≥3:1 링으로 전달 ③ 그레이스케일, Windows 고대비(forced-colors), 200% 확대, 320px에서 컨트롤을 식별할 수 있는지 확인 ④ 식별이 어려운 컨트롤이 나오면 임의로 고치지 않고 **사용자에게 보고하고 테두리 보정안을 제안**.

### D4. 실제 스크린리더·브라우저 검증 필요 항목 (CI로 불가, 구현 완료 시 수동)

- 스크린리더: VoiceOver(macOS Safari), NVDA(Windows Chrome/Firefox). 확인: 수동 결과 문장, 자동 시작·중지·완료 요약 시점, 진행 표시줄 값, 확인창 열림/닫힘 시 포커스·낭독, 저장 실패·복구 알림, 읽기 실패 시 전적 읽힘, 비율 막대 중복 없음(M-06).
- 브라우저: Chrome·Safari·Firefox·Edge 최신판. IndexedDB 실패 양상, `inert`, 컨테이너 쿼리, 확인창 포커스, Safari 시크릿 모드(M-05, M-09, M-14).
- 실기기: 모바일 1대(터치 영역·레이아웃·성능, P-8).

### 15.2 남은 결정과 배포 단계 확인 사항

**남은 필수 결정: 없음.**

**AC2-054 원문과의 관계 (보고, Spec 미수정)**: AC2-054는 "게임·기록·통계 **동작을 위한 서버 요청**이 없고 …"(Manual: Network 탭), FR2-023은 "… **동작을 위한 네트워크 요청**이 없어야 한다"이다. D5 (a)는 같은 출처 Next.js 정적 파일(HTML·JS·CSS·아이콘·`__next*.txt`) 요청을 허용하므로, 이동 클릭 때 생기는 JS 청크·`__next*.txt` 요청을 문자 그대로 읽으면 원문과 긴장이 있다. 완화 요인: ① 데이터 전송·API·쿠키·외부 호스트 요청은 모두 없음(실험으로 확인) ② `prefetch={false}`로 로드 시 자동 요청이 없고 이동 클릭 때만 생김 ③ v1의 같은 취지 문구(FR-010·AC-016)도 앱 로딩용 정적 파일 요청은 위반으로 보지 않았음. 이는 해석의 문제이며 사용자가 (a)를 승인했으므로 **Spec은 수정하지 않았다**. 문구를 명확히 하고 싶으면 별도 요청으로 Spec 변경안을 제안한다.

**배포 단계에서 확인할 사항**(결정이 아니라 확인):

| ID | 항목 | 확인 방법 |
|---|---|---|
| G | GitHub 저장소 공개 여부·Pages 사용 가능 플랜(공식 문서로 무료 플랜의 비공개 저장소 가능 여부를 확인하지 못함) | 저장소 Settings → Pages (T-D3 전) |
| H | 실제 서비스 주소·기본 경로(`https://hyeonseoman.github.io/rps-lab/`, `/rps-lab/`은 예상값) | 배포 후 확인(D-02). basePath 값에 영향 |

**Spec 변경이 필요한 항목**: D2 반영(FR2-010·AC2-020, 완료)을 제외하면 없다.

## 16. 배포 설계 (GitHub Pages)

배포 플랫폼은 사용자가 **GitHub Pages**로 최종 결정했다. 저장소 `HyeonSeoMan/rps-lab`, 기본 브랜치 `master`, 빌드 Next.js 정적 내보내기, CI/CD GitHub Actions, 데이터 저장 기존 IndexedDB. 예상 주소 `https://hyeonseoman.github.io/rps-lab/`, 예상 기본 경로 `/rps-lab/` — **실제 Pages 설정에서 확인할 값**(15.2 H)이다. 이 절은 설계이며 설정 파일, 워크플로, 실제 배포는 만들지 않았다.

### 16.1 현재 프로젝트 호환성 검토

방법: 소스 검색, 설치된 Next 16.4.5의 내장 공식 문서, **저장소 밖 스크래치 복사본에서의 빌드·브라우저 실험**([research R-20](research.md)). 실험은 GitHub Pages를 흉내 낸 서버(근사)이므로 실제 동작은 배포 후 D-xx로 확인한다.

| # | 항목 | 결과 | 근거 | 조치 |
|---|---|---|---|---|
| 1 | `output: "export"` | **가능** | 비호환 요소 검색 0건(`next/image`, Route Handler, Server Action, `cookies/headers`, rewrites·redirects, 동적 라우트 없음). 스크래치 빌드 성공(`LayoutProps` 포함 TypeScript 통과) | `next.config.ts`(현재 빈 설정)에 추가 — 구현 단계 |
| 2 | `basePath: "/rps-lab"` | 적용 가능 | 링크·`_next` 자산·favicon에 `/rps-lab/` 접두사. 값은 빌드 시점에 인라인되어 바꾸려면 다시 빌드 | **배포 빌드에서만 환경변수로 지정**(로컬 개발 주소는 `/` 유지) |
| 3 | `trailingSlash: true` | **필요(권장)** | `history/index.html`이 생성됨. 끄면 `history.html`이 되어 호스트가 확장자 없는 URL을 해석하는 동작에 의존 | 항상 적용 |
| 4 | `/`, `/history` 내보내기 | 가능 | `/` 빌드 성공. `/history`는 v2에 아직 없어 같은 구조의 프로브(클라이언트 컴포넌트·IndexedDB)로 `out/history/index.html` 생성 확인 | v2 구현 후 같은 검사 재실행(D-01) |
| 5 | `/rps-lab/history/` 직접 접근·새로고침 | 정상(에뮬레이션) | `/rps-lab/history` → 301 → `/rps-lab/history/` 200, 새로고침 200, 미존재 경로 404(+`404.html`) | 실제 Pages는 D-03·D-04 |
| 6 | 정적 자산 하위 경로 | 정상 | 모든 JS·CSS·favicon이 `/rps-lab/` 접두사, 404 자산 0건 | D-06 |
| 7 | `next/image` | 미사용 | 검색 0건. 쓰게 되면 기본 로더가 정적 내보내기에서 지원되지 않아 `images.unoptimized` 또는 사용자 로더와 수동 basePath 접두사 필요 | **사용 금지**(필요해지면 별도 승인) |
| 8 | 서버 전용 기능 | 없음 | 공식 문서의 비호환 목록과 대조 | 도입 금지(Constraints) |
| 9 | 로컬 vs 배포 | **차이 있음** | basePath를 무조건 적용하면 `dev`에서 `/`가 404이고 `/rps-lab/`에서만 열림. `next start`는 export와 함께 쓰지 않음 | basePath는 배포 빌드에서만. 로컬에서 배포 빌드를 정적 서버로 확인하는 절차는 Quickstart 7.2 |
| 10 | IndexedDB와 정적 호스팅 | 호환 | 정적 서버에서 열기·쓰기·읽기 성공. HTTPS 출처. **출처 `https://hyeonseoman.github.io`는 이 계정의 다른 Pages 사이트와 공유**(RK-17) | DB 이름 `rps-lab` 유지, 개인정보 미저장 |

**기존 코드와 충돌하는 요소**: 없음. 변경이 필요한 위치는 `next.config.ts`(설정 추가)와 구현 예정인 `AppHeader`(끝 슬래시 정규화)뿐이다. **실험으로 새로 드러난 사항 3가지**: ① `usePathname()`이 `/history/`처럼 끝 슬래시를 포함(RK-20) ② `next/link` 프리페치가 같은 출처 정적 파일에 `fetch`를 보냄(D5 (a) 승인, RK-16) ③ 404 페이지에서 경로 문자열을 직접 출력하면 하이드레이션 경고(React #418)가 남(경로 의존 출력 금지). `/out/`와 `.next/`는 `.gitignore`에 이미 포함되어 있다.

### 16.2 배포 아키텍처

```text
개발자 ── git push master ──▶ GitHub 저장소 (HyeonSeoMan/rps-lab)
                                  │ (push 이벤트 / 수동 실행)
                                  ▼
                    GitHub Actions 워크플로 (예정: deploy-pages.yml)
   checkout → Node 22 → npm ci → typecheck → lint → test
            → next build (정적 내보내기, basePath=/rps-lab) → out/
            → upload-pages-artifact(out/) → deploy-pages (환경 github-pages)
                                  │
                                  ▼
          GitHub Pages (정적 파일, HTTPS) ── https://hyeonseoman.github.io/rps-lab/
                                  │
                                  ▼
       사용자 브라우저: HTML·JS·CSS 로드 → IndexedDB(브라우저 로컬)에 기록 저장
       (서버·DB·로그인·API 호출 없음)
```

- **`master` push와 자동 배포**: `master` push가 워크플로를 자동 실행하고 **게이트(typecheck·lint·test)와 빌드가 통과해야만** 배포한다. PR에서는 빌드 검증만 하고 배포하지 않는다(공식 템플릿도 기본 브랜치 push에서만 배포). 수동 실행(`workflow_dispatch`)을 허용하고 동시 배포는 `concurrency`로 직렬화한다(진행 중 배포를 취소하지 않음).
- **산출물**: `out/`(정적 파일, 약 1MB 미만 예상)만 아티팩트로 올린다. `out/`은 커밋하지 않는다.
- **Pages 설정**(저장소 Settings, 1회 수동, 구현 단계): Source = **GitHub Actions**. 워크플로 권한 `contents: read`, `pages: write`, `id-token: write`(공식 `deploy-pages` 문서 확인). 환경 `github-pages`에는 기본 브랜치만 배포하도록 보호 규칙을 두는 것을 권장.
- **라우팅·하위 경로**: `index.html`과 `history/index.html`을 정적 서빙하고 `trailingSlash`로 슬래시 없는 URL은 Pages가 301로 보낸다. 알 수 없는 경로는 Next 기본 `404.html`. 하위 경로 `/rps-lab/`는 basePath가 링크·자산에 적용한다. 클라이언트 이동은 정적 페이로드를 쓴다.
- **데이터**: 백엔드 없이 IndexedDB만 쓴다. 배포 주소가 바뀌면 출처가 바뀌어 기존 기록이 보이지 않는다(이전 기능 없음).

**빌드·배포 실패 시 확인 절차**

| 증상 | 확인 | 조치 |
|---|---|---|
| 게이트 단계 실패(typecheck·lint·test) | Actions 로그의 실패 단계 | 코드 수정 후 push. 배포는 일어나지 않음(이전 배포본 유지) |
| 빌드 단계 실패 | `next build` 로그. 정적 내보내기 비호환 요소 도입 여부, basePath 환경변수 | 비호환 기능 제거, 설정 수정 |
| 배포 단계 실패 | Settings → Pages Source가 GitHub Actions인지, 워크플로 권한, 환경 보호 규칙, 10분 타임아웃 | 설정 수정 후 "Re-run" |
| 배포 후 404·스타일 깨짐 | 개발자 도구 Network에서 404 자산, URL이 `/rps-lab/` 하위인지, `trailingSlash` | 경로·설정 수정 후 재배포. 캐시가 의심되면 강력 새로고침 |
| 배포 직후 일시적 오류 | 이전 HTML의 오래된 청크 참조(RK-18) | 강력 새로고침, 잠시 대기 |

**롤백**(공식 문서는 롤백 절차를 제공하지 않아 구현 단계에서 리허설로 검증, D-11): ① **권장** — 문제 커밋을 `git revert` 후 `master`에 push해 이력을 보존한 채 자동 재배포 ② 마지막으로 성공한 워크플로 실행에서 "Re-run all jobs"(그 커밋 기준으로 다시 빌드·배포) ③ 긴급 — Settings → Pages에서 게시를 중단. 이전 아티팩트의 보존에는 의존하지 않는다.

**무료 플랜 제약과 운영 주의**
- 공식 문서 확인: 게시 사이트 1GB 이하(산출물은 1MB 미만), 저장소 권장 1GB, 월 100GB 소프트 대역폭, 시간당 10빌드 소프트 제한은 Actions 게시에는 적용되지 않음, 배포 10분 타임아웃, 상업적 SaaS·결제·민감 정보 사이트 금지(이 프로젝트는 학습용, 개인정보 미수집이라 해당 없음).
- **확인하지 못한 항목**: 무료 플랜의 비공개 저장소 가능 여부와 저장소 공개 여부(15.2 G), Actions 배포의 Jekyll 건너뜀, 응답 캐시 시간. 구현 단계에서 확인한다.
- 계정의 다른 Pages 사이트와 출처를 공유한다(RK-17). 응답 헤더·리다이렉트를 제어할 수 없다(정적 내보내기도 `headers`·`redirects`를 지원하지 않음). 서버 로그나 분석은 없다.
- 위험 목록은 13절 RK-16~RK-23, 검증은 Quickstart 7절.

### 16.3 Tasks로 분리할 구현 항목 (이번에는 만들지 않음)

| 항목 | 내용 | 완료 기준 |
|---|---|---|
| T-D1 정적 배포 설정 | `next.config.ts`에 `output: "export"`, `trailingSlash: true`, 배포 빌드에서만 `basePath`. 필요 시 배포 빌드·정적 미리보기용 npm 스크립트(이름은 Tasks에서 확정) | 로컬 `next build` 성공, `out/`에 `index.html`·`history/index.html`·`404.html`, 자산 경로 접두사 확인(D-01) |
| T-D2 경로·정적 자산 처리 | `AppHeader`의 끝 슬래시 정규화, 모든 내부 이동은 `next/link`에 `prefetch={false}` 적용(D5 (a) 승인), 경로 하드코딩 금지, 경로 의존 출력 금지, `next/image` 미사용 유지 | `AppHeader.test` 통과, 정적 서버에서 직접 접근·새로고침·이동·404 없음(D-03~D-06) |
| T-D3 GitHub Actions 워크플로 | `.github/workflows/deploy-pages.yml`: 트리거(master push, 수동), 권한, 게이트→빌드→업로드→배포, `concurrency`, Node 22 고정, 의존성 캐시, PR은 빌드만 | 워크플로 파일 검토 후 첫 배포 성공(사용자 승인 후 push) |
| T-D4 배포 환경 검증 | Quickstart 7절 D-01~D-12 수행·기록 | `verification.md`에 일시·환경·결과 기록 |
| T-D5 실패·롤백 문서화 | README에 배포 절: 주소 확인, 실패 확인 순서, 롤백, 주의사항 | 롤백 리허설 결과 기록(D-11) |

의존 순서: T-D1 → T-D2 → T-D3 → T-D4 → T-D5. T-D1·T-D2는 `/history`가 구현된 뒤(구현 단계 개요 6) 실제 화면으로 재확인한다. 워크플로 생성·push·배포는 사용자 승인 후에만 한다.

### 16.4 배포 검증 계획
[Quickstart 7절](quickstart.md#7-배포-검증-github-pages)의 D-01~D-12: 정적 빌드, 게임 페이지 접근, `/rps-lab/history/` 직접 접근·새로고침, 게임↔기록 이동, 정적 자산 404, 모바일 반응형, IndexedDB 저장·조회·초기화, 자동 실행·중단, 콘솔 오류, 롤백 가능성.

---

## Project Structure

### Documentation (this feature)

```text
specs/002-rps-simulation-stats/
├── spec.md                    # 승인됨
├── plan.md                    # 이 파일
├── research.md                # Phase 0: 기술 선택, 근거, 대안
├── data-model.md              # Phase 1: 타입, 불변식, 상태 전이
├── quickstart.md              # Phase 1: 검증 가이드(M-01~M-14)
├── contracts/
│   ├── storage-contract.md    # IndexedDB 스키마·트랜잭션·오류·마이그레이션
│   └── ui-contract.md         # 요소·role·문구·확인창 요구·잔여 결정
├── checklists/requirements.md
└── tasks.md                   # /speckit-tasks 에서 생성 (이번 단계 제외)
```

### Source Code (repository root) — 구현 단계에서 생성·변경될 구조

```text
src/
├── app/
│   ├── layout.tsx             # 수정: <AppHeader/> 추가
│   ├── page.tsx               # 유지: <Game />
│   ├── history/page.tsx       # 신규: <History />
│   └── globals.css            # 수정: 디자인 토큰(보정 색상)
├── components/
│   ├── AppHeader.tsx          # 신규
│   ├── Game.tsx               # 수정: 세션 훅 + 레이아웃 (복원 게이트 제거)
│   ├── GameBoard.tsx          # 수정: 하위 컴포넌트 조합
│   ├── game/                  # 신규: ModeToggle, StorageNotice, BattleArena, ManualPanel,
│   │                          #       AutoPanel, RunProgress, RunSummary, ScoreCards,
│   │                          #       ResetControl, ResetDialog (+ *.module.css)
│   ├── history/               # 신규: History, StatsPanel, RatioBar, RecordList, Pager (+ css)
│   ├── useGameSession.ts      # 신규
│   ├── useHistory.ts          # 신규
│   └── *.test.tsx             # Game(이관·확장), History, AppHeader
├── lib/
│   ├── rps.ts                 # 무변경
│   ├── game-state.ts          # 축소(Score·Round·applyOutcome)
│   ├── battle.ts · stats.ts · auto-run.ts · auto-runner.ts · save-queue.ts
│   ├── game-session.ts · announce.ts · battle-store.ts · idb-battle-store.ts
│   ├── *.test.ts              # 각 모듈, invariants.test.ts, idb-battle-store.test.ts
│   └── score-storage.ts       # 제거 (+ 테스트)
└── test-utils/
    └── memory-store.ts        # 테스트 전용 메모리 저장소
vitest.config.mts              # 수정: 어댑터 테스트용 setup(fake-indexeddb)
next.config.ts                 # 수정(Tasks T-D1): output "export", trailingSlash true, 배포 빌드에서만 basePath
.github/workflows/deploy-pages.yml  # 신규(Tasks T-D3). 이번 단계에서는 만들지 않음
README.md                      # 수정(Tasks T-D5): 배포·롤백 절
```

**Structure Decision**: v1과 같은 단일 Next.js 프로젝트(`src/`)를 유지한다. 백엔드·모노레포·별도 패키지를 두지 않는다. 비즈니스·비동기 로직은 `src/lib`, 화면은 `src/components`, 테스트는 소스 옆. 테스트 전용 도우미만 `src/test-utils`에 둔다.

## Complexity Tracking

> Constitution II(불필요한 라이브러리·추상화 금지, 필요하면 Plan에 필요성 문서화)에 따라 새 추상화와 의존성의 필요성을 기록한다.

| 추가 항목 | 필요한 이유 | 더 단순한 대안을 기각한 이유 |
|---|---|---|
| `BattleStore` 인터페이스 + 메모리 저장소 | Constitution VI(로직/UI 분리)와 VII(테스트 검증). jsdom에는 IndexedDB가 없어 UI 흐름 테스트를 저장소 없이 해야 하고 실패·지연 주입이 필요 | 컴포넌트가 IndexedDB를 직접 호출하면 모든 UI 테스트가 가짜 IndexedDB에 의존하고 실패 주입이 어려움 |
| 저장 큐(`save-queue.ts`) | 빠른 연속 입력, 자동 묶음, 초기화가 한 순서로 저장돼야 `seq` 순서·AC2-055·초기화 순서가 보장됨 | 호출마다 바로 저장하면 순서 보장이 IndexedDB 내부 스케줄에 의존해 앞선 실패 후 뒤따른 저장을 막기 어려움 |
| 자동 실행 모듈(`auto-runner.ts`) | 중지·취소·저장 실패·묶음 원자성이 이 기능의 최대 위험이라 React 없이 단위 테스트해야 함 | 훅 안에 두면 타이머·취소·상태가 얽혀 경합 검증이 컴포넌트 테스트로만 가능 |
| 카운터 `meta.stats`(파생 캐시) | 매번 전체 스캔은 10만 건에서 비현실적(research.md R-02). 같은 트랜잭션에서 갱신하고 연결당 1회 검증·복구해 정합성 유지 | 인덱스 `count()`는 규모에 따른 비용이 측정 전 불확실. 전체 스캔은 성능 불가 |
| **개발 의존성 `fake-indexeddb`**(승인됨, 설치는 구현 단계) | 데이터 정합성(원자성·초기화·키셋·복구)이 최대 위험이라 어댑터를 자동 검증해야 함. Spec P-8도 가짜 라이브러리 필요 가능성을 명시. 런타임 번들에 포함되지 않음, Apache-2.0, 의존성 없음 | 실브라우저 수동·CDP만으로는 재현·회귀 검증이 어렵고, 직접 만든 가짜 IndexedDB는 트랜잭션 의미를 재구현해야 해 그 자체가 위험(research.md R-10) |

## 에이전트 사용 정책 (Constitution X)

- 구현과 테스트 작성은 **메인 에이전트 하나**가 수행한다.
- 서브에이전트는 사유를 설명할 수 있을 때만 호출한다: ① 구현 완료 후 "FR/AC ↔ 테스트 ↔ 코드" 추적성을 새 컨텍스트에서 읽기 전용으로 교차 검증(선택, 최대 1회) ② 반복 실패한 문제의 독립 원인 분석. 병렬 구현·단순 탐색·문서 작성 목적의 호출은 하지 않는다.

## 구현 단계 개요 (참고용, 확정은 Tasks에서)

의존 순서만 제시한다. Tasks는 이 Plan 승인 후 별도 단계에서 만든다.

1. 순수 모듈과 테스트: `battle`, `stats`, `auto-run`, `announce`, `game-session`, `save-queue`, `battle-store` 인터페이스, 메모리 저장소
2. IndexedDB 어댑터와 어댑터 테스트(승인 시 `fake-indexeddb`)
3. 자동 실행 모듈과 테스트
4. 게임 페이지: 세션 훅, 컴포넌트, v1 수동 대결 테스트 이관(초반에 회귀 확인)
5. 자동 패널, 진행·중지, 저장 불가·연습·재시도, 초기화·확인창
6. 공통 헤더, 기록·통계 페이지(통계·막대·표/카드·페이지네이션·상태)
7. 불변식 속성 테스트, v1 `score-storage` 제거 확인, 수동 검증(M-01~M-14)과 `verification.md`
8. 정적 배포 설정·경로 처리·워크플로·배포 환경 검증·롤백 문서화(16.3, 화면 구현 이후, 워크플로 push·배포는 사용자 승인 후)
