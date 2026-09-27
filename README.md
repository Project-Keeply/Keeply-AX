# Keeply-AX

기획자가 Discord에서 자연어로 기능의 구현 현황을 질문하면, GitHub의 이슈·PR·코드를 근거로 구현 내용과 진행 상태를 설명하는 AX 툴입니다.

## 동작 흐름

```
Discord /ask
  → relay (Cloudflare Worker): 서명 검증, 즉시 "확인 중"(deferred) 응답
     → 백그라운드에서 질문·interaction 정보를 AskPayload로 묶어 AES-256-GCM으로 암호화
     → GitHub workflow_dispatch(ask.yml) 호출 (입력값은 암호화된 payload 문자열 하나뿐)
  → agent (GitHub Actions): payload 복호화 → (현재는) 에코 답변 생성
  → Discord 원본 메시지를 답변으로 수정(edit)
```

이 저장소는 public이므로 workflow_dispatch 입력에 interaction token·질문 원문 등 민감값이 그대로 노출되면 안 됩니다. 그래서 relay는 `AskPayload` 전체를 `payload`라는 단일 입력값으로 암호화해서 넘기고, agent가 같은 키로 복호화합니다.

## 폴더 구조

```
keeply-ax/
├── apps/
│   ├── relay/        # Cloudflare Worker (Discord 요청 중계, payload 암호화·dispatch)
│   └── agent/        # GitHub Actions에서 실행되는 파이프라인 (payload 복호화·답변 전송)
└── packages/
    └── shared/       # 공용 타입 및 payload 암복호화 유틸
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

## relay (Discord 요청 중계 Worker)

`apps/relay`는 Discord Interactions 요청의 Ed25519 서명을 검증하고, 허용된 서버·채널의 `/ask`에 대해 즉시 "확인 중"(deferred) 응답을 반환합니다. 이후 백그라운드(`ctx.waitUntil`)에서 질문을 암호화해 GitHub `workflow_dispatch`를 호출합니다. 허용 목록·GitHub 저장소 정보·Discord 애플리케이션 ID는 `apps/relay/wrangler.toml`의 `[vars]`에서 관리합니다(쉼표로 여러 개 지정 가능).

### 필요한 시크릿·변수

| 위치 | 이름 | 용도 |
|---|---|---|
| relay (Worker secret) | `GITHUB_TOKEN` | `workflow_dispatch` 호출용 fine-grained PAT (Repository: `Keeply-AX`만, 권한: Actions Read and write) |
| relay (Worker secret) | `AX_PAYLOAD_KEY` | AskPayload 암호화 키 |
| Actions secret | `AX_PAYLOAD_KEY` | 위와 **동일한 값**. agent가 payload를 복호화할 때 사용 |
| Actions variable | `DISCORD_APPLICATION_ID` | agent가 원본 메시지를 수정(edit)할 때 사용하는 애플리케이션 ID |

`AX_PAYLOAD_KEY`는 32바이트를 base64로 인코딩한 문자열입니다.

```bash
openssl rand -base64 32
```

relay 쪽 시크릿은 `apps/relay` 안에서 등록합니다.

```bash
cd apps/relay
pnpm exec wrangler secret put GITHUB_TOKEN
pnpm exec wrangler secret put AX_PAYLOAD_KEY
```

Actions 쪽 `AX_PAYLOAD_KEY`(Secret)와 `DISCORD_APPLICATION_ID`(Variable)는 GitHub 저장소의 **Settings → Secrets and variables → Actions**에서 등록합니다. `workflow_dispatch`는 `.github/workflows/ask.yml`이 기본 브랜치(`develop`, `wrangler.toml`의 `GITHUB_REF`와 일치)에 머지되어 있어야 정상적으로 호출됩니다.

### 배포

```bash
pnpm --filter @keeply-ax/relay run deploy
```

배포 후 출력된 Worker URL을 Discord Developer Portal → General Information → **Interactions Endpoint URL**에 등록합니다. 저장 시 Discord가 PING을 보내 서명 검증을 확인합니다.

### 슬래시 커맨드 등록

저장소 루트에 `.env`를 만들고 봇 토큰을 넣은 뒤 등록 스크립트를 실행합니다. (`.env`는 커밋하지 않습니다.)

```bash
# .env
DISCORD_BOT_TOKEN=...
# 선택: DISCORD_APPLICATION_ID, DISCORD_GUILD_ID 로 기본값 덮어쓰기

pnpm --filter @keeply-ax/relay register
```

### 테스트

```bash
pnpm test                               # 전체
pnpm --filter @keeply-ax/relay test     # relay만
pnpm --filter @keeply-ax/agent test     # agent만
pnpm --filter @keeply-ax/shared test    # shared만
```

## agent (GitHub Actions 파이프라인)

`apps/agent`는 `.github/workflows/ask.yml`의 `workflow_dispatch`로 실행됩니다. `AX_PAYLOAD`(암호화된 payload)와 `AX_PAYLOAD_KEY`를 받아 복호화한 뒤, 로그에 interaction token이 남지 않도록 즉시 `::add-mask::`로 마스킹하고, 답변을 만들어 Discord 원본 메시지를 수정합니다. 현재는 실제 근거 수집·구현 상태 판정 없이 질문을 그대로 되돌려주는 에코 답변만 보냅니다(연결 테스트 단계).

## 기술 스택

- TypeScript, pnpm workspace, Node 22
- Cloudflare Workers, GitHub Actions
- Claude Haiku 4.5 (`claude-haiku-4-5`)
- 대상 저장소: `Project-Keeply/Keeply-Server`, `Project-Keeply/Keeply-client`
