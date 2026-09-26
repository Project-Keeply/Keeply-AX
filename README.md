# Keeply-AX

기획자가 Discord에서 자연어로 기능의 구현 현황을 질문하면, GitHub의 이슈·PR·코드를 근거로 구현 내용과 진행 상태를 설명하는 AX 툴입니다.

## 동작 흐름

```
Discord /ask
  → relay (Cloudflare Worker): 서명 검증, 즉시 "확인 중" 응답, workflow_dispatch 호출
  → agent (GitHub Actions): 질문 의도 분석 → 근거 수집 → 구현 상태 판정 → 답변 생성
  → Discord followup 메시지로 답변 전송
```

## 폴더 구조

```
keeply-ax/
├── apps/
│   ├── relay/        # Cloudflare Worker (Discord 요청 중계)
│   └── agent/        # GitHub Actions에서 실행되는 파이프라인
└── packages/
    └── shared/       # 공용 타입 (구현 상태, 근거, dispatch 입력값)
```

## 구현 상태 기준

| 상태 | 기준 |
|---|---|
| 기본 브랜치 반영 | 기본 브랜치에서 관련 코드 또는 병합된 PR을 확인 |
| 작업 진행 중 | 열린 PR의 변경 코드 또는 진행 중 이슈를 확인 |
| 계획 또는 작업 대기 | 관련 이슈만 있고 코드·PR 근거는 확인하지 못함 |
| 구현 여부 확인 불가 | 탐색 범위에서 관련 코드·PR·이슈를 찾지 못함 |
| 배포 확인됨 | 배포 시스템 연동으로 대상 환경 반영까지 확인 |

## 로컬 실행

```bash
nvm use
pnpm install
pnpm typecheck
```

## 기술 스택

- TypeScript, pnpm workspace, Node 22
- Cloudflare Workers, GitHub Actions
- Claude Haiku 4.5 (`claude-haiku-4-5`)
- 대상 저장소: `Project-Keeply/Keeply-Server`, `Project-Keeply/Keeply-client`
