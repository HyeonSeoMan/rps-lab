# Data Model: 가위바위보 vs 컴퓨터

타입은 설계 명세이며 구현 코드가 아니다. 위치: `src/lib/`.

## 타입

| 이름 | 정의 | 비고 |
|---|---|---|
| `Choice` | `'rock' \| 'paper' \| 'scissors'` | 화면 라벨: 바위/보/가위 |
| `Outcome` | `'win' \| 'lose' \| 'draw'` | 사용자 관점 |
| `Score` | `{ wins: number; losses: number; draws: number }` | 각 값 0 이상의 안전한 정수 |
| `Round` | `{ user: Choice; computer: Choice; outcome: Outcome }` | 가장 최근 1개만 보관 |
| `GameState` | `{ score: Score; lastRound: Round \| null }` | |
| `GameAction` | `{type:'play'; user: Choice; computer: Choice} \| {type:'reset'}` | 복원은 액션이 아니라 초기값 |
| `LoadResult` | `{ score: Score; writable: boolean }` | `writable=false`면 이번 세션에서 저장하지 않음 |

## 순수 함수

| 함수 | 시그니처(개념) | 규칙 | FR/AC |
|---|---|---|---|
| `judge` | `(user, computer) => Outcome` | 같으면 draw. 가위>보, 바위>가위, 보>바위 → 사용자가 이기면 win, 아니면 lose | FR-003 / AC-003 |
| `pickComputerChoice` | `(random: () => number) => Choice` | 인덱스 `min(floor(random()*3), 2)`로 `[rock, paper, scissors]` 선택 | FR-002 / AC-004 |
| `applyOutcome` | `(score, outcome) => Score` | 해당 항목만 +1, 새 객체 반환 | FR-005 / AC-006,007 |
| `gameReducer` | `(state, action) => GameState` | 아래 전이 표 | FR-004~008 |
| `parseScore` | `(raw: string \| null) => Score \| null` | JSON 파싱 + 검증. 실패 시 null | FR-007 / AC-020 |
| `createInitialState` | `(score: Score) => GameState` | `{ score, lastRound: null }` | FR-007 |
| `loadScore` | `(storage: StorageLike \| null) => LoadResult` | 저장소 없음/`getItem` 예외 → `{EMPTY, false}`; 키 없음·손상 값 → `{EMPTY, true}`; 유효 → `{score, true}` | FR-007 / AC-005,017,020 |
| `saveScore` | `(storage, score) => void` | `setItem` 예외 흡수 | FR-007 / AC-021 |

## 상태 전이

| 현재 → 액션 | 결과 |
|---|---|
| 초기값 | `createInitialState(loaded.score)` → `lastRound = null` |
| any → `play(user, computer)` | `outcome = judge(...)`, `score = applyOutcome(score, outcome)`(새 객체), `lastRound = {user, computer, outcome}` |
| any → `reset` | `score = 새 0/0/0 객체`, `lastRound = null` |

불변식: `play`가 1회 처리될 때마다 `wins + losses + draws`는 정확히 1 증가한다(AC-007, SC-003). `play`/`reset`은 항상 **새 Score 객체**를 반환한다(저장 effect의 참조 비교 전제).

## 저장 규칙 (요약, 상세는 [contracts/storage-contract.md](contracts/storage-contract.md))

- 저장은 `loaded.writable === true`이고 `state.score !== loaded.score`(복원값과 다른 객체)일 때만 한다. 마운트 직후에는 쓰지 않는다.
- `loaded.writable === false`(저장소 없음 또는 `getItem` 예외)면 세션 동안 쓰지 않는다. 유효한 기존 데이터를 덮어쓰지 않기 위함이다.
- `lastRound`는 저장하지 않는다.
- 읽기/쓰기 예외는 삼키고 화면 상태에 영향을 주지 않는다.
