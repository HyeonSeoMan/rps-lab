# Data Model: 자동 대결과 전적 통계 (RPS Lab v2)

Phase 1 산출물이다. 타입은 설계 수준의 시그니처이며 구현 코드가 아니다. 저장소 스키마의 세부는 [contracts/storage-contract.md](contracts/storage-contract.md)를 따른다.

## 1. 핵심 타입

### 재사용 (v1, 변경 없음)
- `Choice = "rock" | "paper" | "scissors"`, `Outcome = "win" | "lose" | "draw"`, `judge(user, computer)`, `pickComputerChoice(random)` — `src/lib/rps.ts`
- `Score = { wins, losses, draws }` (각 값은 0 이상의 안전한 정수), `Round = { user, computer, outcome }`, `applyOutcome(score, outcome)` — `src/lib/game-state.ts`

### 신규

```ts
// 확정 전 대결(저장 대상). outcome은 저장하지 않고 judge()로 항상 계산한다(AC2-026).
type BattleDraft = { user: Choice; computer: Choice; at: number }   // at: epoch ms, 표시용

// 확정된 대결 = IndexedDB `battles`에 저장된 레코드
type BattleRecord = BattleDraft & { seq: number }                     // seq: 1부터, 확정 순서

type AutoSettings = {
  pick: "fixed" | "random"        // 내 손 방식
  hand: Choice                    // pick === "fixed"일 때만 의미
  run: "instant" | "animated"
  count: 10 | 100 | 1000
}

type StoreErrorKind = "unavailable" | "read" | "write" | "corrupt" | "version"
                    | "skipped"            // 실패 게이트가 닫혀 저장을 시도하지 않음(저장소 상태 오류가 아님)
class StoreError extends Error { kind: StoreErrorKind; cause?: unknown }
```

### 앱 수준 저장소 객체 (`QueuedBattleStore`)
`BattleStore` 위에 **FIFO 저장 큐, 실패 게이트, `whenIdle()`, `recover()`** 를 얹은 모듈 단위 단일 인스턴스다. 페이지 컴포넌트가 아니라 앱이 생명주기를 소유하므로 페이지 이동에도 이미 수락된 쓰기가 폐기되지 않는다. 인터페이스와 규칙은 [contracts/storage-contract.md 2·3절](contracts/storage-contract.md)이 기준이다. 훅은 게임 페이지 마운트 때 게이트 상태(`gate()`)를 읽어 초기 `storage`를 정한다.

## 2. 저장소 엔터티 (IndexedDB)

| 저장소 | 키 | 값 | 설명 |
|---|---|---|---|
| `battles` | `seq`(number, keyPath) | `{ seq, user, computer, at }` | **진실의 원천**. 개별 기록. 인덱스 없음(최신순 = 키 역순) |
| `meta` | `"stats"` | `{ wins, losses, draws }` | 파생 캐시. 항상 `battles`와 같은 트랜잭션에서 갱신 |
| `meta` | `"probe"` | 임의 값 | 저장 다시 시도에서만 쓰고 지움 |

### 불변식 (Spec: `전체 대결 횟수 = 승 + 패 + 무 = 저장된 개별 기록 수`)
1. `meta.stats.wins + losses + draws === battles.count()`
2. 모든 `battles` 레코드의 결과는 `judge(user, computer)`로 정해진다(결과를 저장하지 않으므로 어긋날 수 없다).
3. `seq`는 `battles` 안에서 유일하며 쓰기 시점에 `마지막 seq + 1`이다. 초기화 후에는 1부터 다시 시작한다.
4. 기록은 불변이다. 수정·부분 삭제 API가 없고 삭제는 `clearAll`뿐이다.
5. 위 1~4는 **하나의 `readwrite` 트랜잭션** 안에서만 바뀐다. 트랜잭션 `complete` 이전에는 어떤 값도 화면 전적에 반영하지 않는다("확정").

### 검증 규칙
| 대상 | 규칙 | 위반 시 |
|---|---|---|
| `BattleRecord` 읽기 | `seq`는 양의 안전한 정수, `user`·`computer`는 `Choice`, `at`는 유한한 숫자 | `StoreError("corrupt")` |
| `meta.stats` 읽기 | 세 값 모두 0 이상의 안전한 정수 | 연결당 첫 `loadStats`에서 기록 스캔으로 재계산(복구). 스캔 중 레코드가 손상이면 `StoreError("corrupt")` |
| 통계 합 | 불변식 1 | 재계산 복구. 같은 연결에서는 다시 검증하지 않음 |
| 저장소 사용 불가 | `indexedDB` 없음, `open` 실패, 버전 충돌 | `StoreError("unavailable" \| "version")` |

> 손상 상태의 탈출구: 읽기가 `corrupt`로 계속 실패해도 **전적 초기화(`clearAll`)는 레코드 내용을 읽지 않으므로 동작**한다(FR2-019). 초기화 후에는 정상이다.

## 3. 파생 값 (순수 함수, `src/lib/stats.ts`)

| 값 | 정의 | 경계 |
|---|---|---|
| `total(score)` | `wins + losses + draws` | |
| `winRate(score)` | `total === 0 ? 0 : wins / total * 100` | 0건이면 `0` (0으로 나누기 없음, AC2-024) |
| `formatPercent(x)` | `x.toFixed(1) + "%"` | P-2. 0건은 `"0.0%"` |
| `ratios(score)` | 구간별 `count / total`(반올림하지 않음). 0건이면 모두 0 | 막대 폭은 실제 비율(AC2-065). 범례 퍼센트의 합이 100.0%가 아닐 수 있음 |
| `pageCount(total, size=20)` | `max(1, ceil(total / size))` | 0건이어도 `1` |

## 4. 화면 상태 (게임 페이지 세션)

`useGameSession`이 `useReducer`로 보관하는 상태. reducer(`src/lib/game-session.ts`)는 **순수**이며 난수·저장소·타이머를 모른다.

```ts
type StorageStatus =
  | { phase: "loading" }                                           // 최초 읽기 전: 전적·선택 버튼 없음(skeleton)
  | { phase: "ready" }
  | { phase: "unavailable"; cause: "read" | "write";               // P-14 저장 불가 상태
      retry: "idle" | "retrying" | "failed" }

type RunState =
  | { phase: "idle" }
  | { phase: "saving"; total: number }                             // 즉시 결과: 진행 표시줄·중지 없음 (P-6)
  | { phase: "animating"; total: number; done: number; stopping: boolean }

type RunSummary = { kind: "completed" | "stopped" | "aborted"; total: number; done: number; tally: Score }

type SessionState = {
  storage: StorageStatus
  stats: Score | null                       // null = 읽지 못함/읽는 중. 0/0/0과 구분된다(AC2-058)
  mode: "manual" | "auto"
  settings: AutoSettings
  last: { round: Round; saved: boolean } | null   // saved=false: 연습/저장 실패 결과(P-12)
  run: RunState
  summary: RunSummary | null
  reset: "idle" | "confirming" | "resetting"
  notice: null | "recovered" | "reset-failed"
  announcement: string                      // 결과 영역 role="status" 문장(단일 대표 live region, D1 승인: UI Contract 6절)
}
```

### 상태 전이 (reducer 액션)

| 액션 | 조건 | 결과 |
|---|---|---|
| `LOADED(stats)` | `storage=loading ∧ 게이트 열림` | `ready`, `stats` 설정 |
| `LOADED_UNAVAILABLE(cause, stats)` | `storage=loading ∧ 앱 수준 게이트가 닫힘`(이전에 저장 실패·읽기 실패가 있었고 아직 재시도에 성공하지 못함) | `unavailable(cause)`, `retry=idle`. `cause=write`이면 읽은 `stats` 표시, `cause=read`이면 읽기를 시도하지 않고 `stats=null` |
| `LOAD_FAILED` | `storage=loading` | `unavailable(read)`, `stats=null` |
| `COMMITTED(round, stats)` | 수동 대결 저장 확정(어느 `run` 상태에서 도착해도 수용) | `stats` 갱신, `last={round, saved:true}`, 낭독 문장 갱신. `notice="recovered"`는 해제(승인됨, UI Contract 5절). 큐 순서대로 도착하므로 `last`는 항상 더 나중에 확정된 결과가 된다(G-11) |
| `PRACTICED(round)` | `unavailable`에서 수동 대결 | `stats` 불변, `last={round, saved:false}` |
| `SAVE_FAILED(round)` | 수동 저장 실패 | `unavailable(write)`, `stats` 불변, `last={round, saved:false}` |
| `RUN_STARTED(settings)` | `run=idle ∧ storage=ready ∧ stats≠null ∧ reset=idle` — **훅이 먼저 `whenIdle()`로 큐 유휴를 확인한 뒤** dispatch하고, 그 사이 중복 시작 요청은 무시(G-3). 선행 `COMMITTED`/`SAVE_FAILED`는 이미 도착한 뒤 | `run=saving` 또는 `animating`, `summary=null`, 낭독 문장 1 또는 2 |
| `RUN_PROGRESS(done, last, stats)` | `run≠idle` | `done`, `stats`, `last={…, saved:true}` 갱신. 첫 진행에서 `notice="recovered"` 해제 |
| `RUN_STOP_REQUESTED` | `run=animating` | `stopping=true` (새 묶음 시작 안 함) |
| `RUN_FINISHED(result)` | 실행 종료 | `run=idle`, `summary` 설정, 낭독 문장 3·4·5. `aborted`면 `unavailable(write)`. `stats`는 마지막 확정 값. **`stopping` 중 저장 실패가 있었다면 `aborted`가 우선**하고 `stopped`로 기록하지 않는다(G-8). 즉시 결과도 같은 규칙(G-9) |
| `RESET_REQUESTED` | `run=idle ∧ reset=idle ∧ retry≠retrying` | `confirming` |
| `RESET_CANCELLED` | `confirming` | `idle`, 데이터 불변(AC2-060) |
| `RESET_CONFIRMED` | `confirming` | `resetting` (새 대결 시작 불가, AC2-061) |
| `RESET_SUCCEEDED` | `resetting` | `stats=0/0/0`, `last=null`, `summary=null`, `reset=idle`. `storage`는 바꾸지 않음. `notice="recovered"` 해제 |
| `RESET_FAILED` | `resetting` | `reset=idle`, `notice="reset-failed"`, 나머지 불변(AC2-043) |
| `RETRY_STARTED` | `unavailable ∧ retry≠retrying ∧ run=idle ∧ reset=idle` | `retry=retrying` (훅이 `store.recover()` 호출) |
| `RETRY_SUCCEEDED(stats)` | `retrying` | **앱 수준 실패 게이트 해제**, `ready`, `stats`, `last`가 `saved=false`면 `null`, `notice="recovered"` (AC2-070, G-2). `recovered`는 다음 확정 대결·초기화 성공·페이지 이동(세션 폐기)에서 해제되고 `MODE_SET`·`SETTINGS_SET`으로는 해제되지 않음 |
| `RETRY_FAILED` | `retrying` | `retry=failed`, 상태 유지. 낭독: `role="alert"` `저장을 다시 시도했지만 실패했어요. 연습 대결은 계속할 수 있어요.` |
| `MODE_SET(mode)` · `SETTINGS_SET(patch)` | `run=idle ∧ reset≠resetting` | 값 변경. 실행 중에는 무시(FR2-009). `notice`는 유지 |

**가드(무시되는 입력)**: 실행 중·초기화 중의 모드 전환·설정 변경·수동 대결·초기화·새 시작은 reducer가 상태를 바꾸지 않는다. **초기화 중에는 저장 다시 시도를, 재시도 중에는 초기화 요청을 무시한다(G-6).** 컴포넌트는 같은 조건으로 버튼을 비활성화하되, reducer 가드가 최종 방어선이다.

**전적이 바뀌는 경로는 4개뿐이다**: `LOADED`/`RETRY_SUCCEEDED`(저장소에서 읽음), `COMMITTED`/`RUN_PROGRESS`(트랜잭션 확정 후 저장소가 돌려준 값), `RESET_SUCCEEDED`. 화면 쪽에서 `+1` 같은 임의 가산은 없다(임시 전적 금지, OQ-4).

### 자동 대결 한 건의 생성 (순수, `src/lib/auto-run.ts`)

```
draftBattle(settings, random, now) =
  user     = settings.pick === "fixed" ? settings.hand : pickComputerChoice(random)   // P-5: 균등 1/3
  computer = pickComputerChoice(random)                                                // v1과 동일
  return { user, computer, at: now() }
```
난수 호출 순서는 고정(사용자 → 컴퓨터)이라 시드 난수로 재현 가능하다(AC2-010·011).

## 5. 기록 페이지 상태

```ts
type HistoryState =
  | { phase: "loading" }
  | { phase: "error"; error: "read" | "corrupt" | "unavailable" }
  | { phase: "ready"; stats: Score; rows: BattleRecord[]; pageIndex: number;
      anchors: number[]            // 각 페이지 시작 기준 seq(첫 페이지는 undefined 대신 빈 스택)
      hasNext: boolean }
```
- 다음: 현재 페이지 마지막 행의 `seq`를 `anchors`에 쌓고 그보다 작은 `seq`부터 읽는다. 이전: `anchors`를 꺼낸다.
- 오래된 응답 방지: 요청 번호가 최신일 때만 반영한다.
- 페이지 라벨 `p / pageCount(stats 합)`. 읽는 중 기록이 늘어도 화면이 깨지지 않으며 최신 반영은 새로고침 시점이다(P-9).

## 6. 낭독 문장 (순수, `src/lib/announce.ts`)

단일 `role="status"` 모델(D1 승인)이므로 결과 영역의 대표 live region 하나가 아래 문장을 전달하며, `announce.ts`가 상태 전이 시점에 문장을 만들어 `announcement`에 넣는다. 문장 원문, 변수 정의, 낭독 시점, 낭독 책임표는 [contracts/ui-contract.md 6절](contracts/ui-contract.md)이 기준이다.

- 수동 대결: v1 형식 `나: {내 선택} · 컴퓨터: {컴퓨터 선택} — {승리!|패배|무승부}`. 저장되지 않은 결과는 ` (저장되지 않음 · 연습 대결)`을 붙인다.
- 자동 실행·초기화: 승인된 6개 문장(시작, 처리·저장 중, 중지, 완료, 저장 실패 중단, 초기화 완료). `{N}`은 전체 횟수, `{k}`는 확정된 횟수, `{a}·{b}·{c}`는 **이번 실행**의 승·패·무다.
- 재시도 중·복구: 이미 승인된 안내 문장을 재사용한다. 재시도 실패: `저장을 다시 시도했지만 실패했어요. 연습 대결은 계속할 수 있어요.`(승인, `role="alert"`).
- 시각 요약 박스와 같은 입력(`RunSummary`)에서 수치를 만들어 **의미와 수치가 일치**함을 단위 테스트로 검증한다.
