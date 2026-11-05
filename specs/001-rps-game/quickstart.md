# Quickstart: 구현 후 검증 가이드

구현이 끝난 뒤 기능을 end-to-end로 확인하는 절차다. 지금 단계에서는 실행하지 않는다.
설치·구현은 `/speckit-tasks` 이후에 진행한다.

## 전제

- Node.js LTS, npm
- 프로젝트 루트에 Next.js 앱이 생성되어 있고 아래 스크립트가 존재한다: `dev`, `build`, `typecheck`, `lint`, `test`

## 1. 자동 검증 (품질 게이트, Constitution VIII)

```bash
npm run typecheck
npm run lint
npm test
```

기대: 세 명령 모두 오류 0. 테스트 이름이 AC ID로 시작하는지 확인한다.

```bash
grep -rhoE "AC-0[0-9]{2}" src | sort -u    # 자동화 대상 AC가 모두 등장해야 함
```

수동 대상(AC-010, 011, 012, 015, 016)은 자동 테스트에 없어도 된다.

```bash
grep -rn "eslint-disable" src    # 결과 없어야 함 (lint 우회 금지)
```

## 2. 수동 검증 (결과를 `specs/001-rps-game/verification.md`에 기록)

```bash
npm run dev    # 또는 npm run build && npm start
```

| 항목 | 절차 | 기대 |
|---|---|---|
| AC-010 | 브라우저 폭 320px에서 한 라운드 진행 | 가로 스크롤 없음, 모든 요소 보임 |
| AC-011 | 폭 1280px 이상에서 동일 | 겹침/깨짐 없음 |
| AC-012 | 개발자 도구로 세 선택 버튼과 초기화 버튼 크기 측정 | 각 ≥ 44×44 CSS px |
| AC-015 | 저장소에 `{"wins":999,"losses":1000,"draws":1234}` 입력 후 새로고침, 320px | 숫자 잘림/깨짐 없음 |
| AC-016 | Network 탭을 비우고 여러 라운드·초기화 수행 | 게임 동작에 따른 서버 요청 없음 |
| SC-001 | 처음 보는 사람이 안내 없이 시작 | 10초 내 첫 라운드 완료 |
| SC-004 | 선택 직후 | 1초 내 결과 표시 |
| 깜빡임 | 저장값이 있는 상태로 새로고침을 여러 번 반복(느린 네트워크 스로틀링 포함) | 잘못된 0/0/0이 보이지 않음. 값이 나타나기 전에는 빈 영역 |
| 실기기 | 모바일 1종에서 탭 1회 = 1라운드 확인(AC-014 보조) | 중복 진행 없음 |

기록 항목: 일시, 브라우저/기기, 폭, 결과(통과/실패), 비고.

## 3. 기능 흐름 스모크 (약 2분)

1. 첫 접속: 0/0/0, 안내 문구 표시
2. "바위" 클릭: 양쪽 선택과 결과 표시, 전적 합계 1
3. 빠르게 3회 연속 클릭: 합계 정확히 4
4. 새로고침: 전적 유지(잘못된 0/0/0 없이 표시), 결과 영역은 초기 안내 문구
5. "전적 초기화": 즉시 0/0/0, 새로고침 후에도 0/0/0
6. Tab/Enter(또는 Space)만으로 한 라운드와 초기화 수행

참조: [data-model.md](data-model.md), [contracts/ui-contract.md](contracts/ui-contract.md), [contracts/storage-contract.md](contracts/storage-contract.md)
