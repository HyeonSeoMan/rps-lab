<!--
Sync Impact Report
- Version change: 2.0.0 → 2.1.0 (MINOR: 원칙 III 완화, 원칙 VII 지침 강화)
- Modified principles:
  - III. 승인된 Spec 기준 구현: Spec 외 구현 전면 금지 → 사용자 대면 기능은 Spec,
    기술 세부사항은 승인된 Plan 범위에서 결정 가능, 신규 기능/UX 변경은 사전 승인
  - VII. 테스트 기반 검증: 인수 조건 연결 SHOULD → MUST, 자동 테스트 또는 수동 검증 절차,
    수동 검증 방법과 결과 기록 의무 추가
- Modified sections: Scope Constraints (일회성 "원칙만 정의" 지시 제거)
- Added/Removed sections: none
- Deferred TODOs: 없음
-->
# RPS Lab Constitution

RPS Lab은 Spec-Driven Development(SDD)와 AI 에이전트 하네스를 학습하고 실험하기 위한
프로젝트이다.

## Core Principles

### I. 기술 스택
애플리케이션은 Next.js App Router, React, TypeScript로 구현해야 한다(MUST). 다른
프레임워크나 언어는 사용자의 명시적 승인 없이 도입해서는 안 된다(MUST NOT).

### II. 단순성과 유지보수성 우선
단순성과 유지보수성을 최우선으로 한다. 불필요한 라이브러리와 추상화를 도입해서는 안 된다
(MUST NOT). 새 의존성이나 추상화가 필요하면 Plan에 필요성을 문서화해야 한다(MUST).
근거: 학습·실험 프로젝트에서는 복잡도가 가장 큰 위험이다.

### III. 승인된 Spec 기준 구현
사용자에게 제공되는 기능과 동작은 승인된 Spec을 따라야 한다(MUST). 구현에 필요한 기술적
세부사항은 승인된 Plan의 범위에서 결정할 수 있다(MAY). 새로운 기능이나 사용자 경험 변경은
사전 승인을 받아야 한다(MUST).

### IV. 요구사항 식별자와 인수 조건
모든 기능 요구사항에는 고유 식별자(예: FR-001)를 부여해야 한다(MUST). 각 요구사항에는
검증 가능한 인수 조건을 작성해야 한다(MUST). 인수 조건은 테스트로 판정할 수 있어야 한다.

### V. Spec 승인 게이트 (NON-NEGOTIABLE)
Spec이 사용자에게 승인되기 전에는 해당 기능의 구현을 시작해서는 안 된다(MUST NOT).
승인 여부가 불분명하면 구현 전에 사용자에게 확인해야 한다(MUST).

### VI. 비즈니스 로직과 UI의 분리
게임의 핵심 비즈니스 로직(승패 판정 등)은 UI에서 분리하여 순수 함수로 구현해야 한다
(MUST). 순수 함수는 React, Next.js, 브라우저 API에 의존해서는 안 된다(MUST NOT).
무작위성이 필요하면 외부에서 주입받아야 한다(MUST).

### VII. 테스트 기반 검증
핵심 로직은 단위 테스트로 검증해야 한다(MUST). 주요 사용자 흐름은 UI 테스트로 검증해야
한다(MUST). 각 인수 조건은 자동 테스트 또는 명시적인 수동 검증 절차와 반드시 연결되어야
한다(MUST). 자동 검증이 어려운 조건은 수동 검증 방법과 결과를 기록해야 한다(MUST).

### VIII. 품질 검증 기준
TypeScript 타입 검사, ESLint, 테스트를 품질 검증 기준으로 사용한다. 이 세 가지가 모두
통과해야 기능이 완료된 것으로 간주한다(MUST).

### IX. 요구사항 변경 통제
사용자의 명시적 승인 없이 요구사항이나 인수 조건을 임의로 변경해서는 안 된다(MUST NOT).
변경이 필요하면 변경 내용과 사유를 제안하고 승인을 받은 뒤 Spec에 반영해야 한다(MUST).

### X. 에이전트 비용 효율성
비용 효율성을 고려하여 기본적으로 메인 에이전트 하나로 작업한다. 서브 에이전트는 필요성이
명확할 때만 호출해야 하며(MUST), 호출 사유를 설명할 수 있어야 한다(SHOULD).

## Scope Constraints

- 범위는 가위바위보(RPS) 게임과 관련 학습·실험으로 한정한다.
- 프로젝트 초기화와 구현은 승인된 Spec 및 Plan을 기준으로 진행한다.

## Development Workflow

- 작업 순서는 specify → (사용자 승인) → plan → tasks → implement 이다.
- 구현 완료 전에 타입 검사, ESLint, 테스트가 모두 통과해야 한다.
- 모든 Plan과 리뷰에서 본 Constitution 준수 여부를 확인해야 한다.

## Governance

본 Constitution은 프로젝트의 다른 관행보다 우선한다. 개정은 `/speckit-constitution`으로
수행하며 Sync Impact Report와 버전 갱신을 포함해야 하고, 사용자의 승인을 받아야 한다.
버전은 유의적 버전을 따른다: 원칙 삭제·재정의는 MAJOR, 원칙 추가나 지침의 실질적 확장은
MINOR, 문구 명확화는 PATCH. 준수 여부는 각 Plan 수립 시와 기능 완료 전에 검토한다.

**Version**: 2.1.0 | **Ratified**: 2026-11-05 | **Last Amended**: 2026-11-05
