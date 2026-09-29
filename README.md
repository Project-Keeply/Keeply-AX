# Keeply-AX

기획자가 Discord에서 자연어로 기능의 구현 현황을 질문하면, GitHub의 이슈·PR·코드를 근거로 구현 내용과 진행 상태를 설명하는 AX 툴입니다.

## 동작 흐름

```
Discord /ask
  → relay (Cloudflare Worker): 서명 검증, 즉시 "확인 중"(deferred) 응답
     → 백그라운드에서 질문·interaction 정보를 AskPayload로 묶어 AES-256-GCM으로 암호화
     → GitHub workflow_dispatch(ask.yml) 호출 (입력값은 암호화된 payload 문자열 하나뿐)
  → agent (GitHub Actions): payload 복호화 → Claude로 질문 의도 분석(LLM #1)
     → out_of_scope/모호한 질문이 아니면 GitHub 근거 수집(이슈·PR·코드, LLM 미사용) → 규칙 기반 구현 상태 판정
     → 근거·판정을 기획자용 답변으로 정리(LLM #2) → Discord embed
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
| Actions secret | `ANTHROPIC_API_KEY` | agent가 질문 의도 분석(LLM #1)에서 Claude API를 호출할 때 사용 |
| Actions variable | `AX_INTENT_MODEL` | (선택) 의도 분석에 쓸 모델 id. 지정하지 않으면 `claude-haiku-4-5` 사용 |
| Actions variable | `AX_ANSWER_MODEL` | (선택) 기획자용 답변 생성에 쓸 모델 id. 지정하지 않으면 `claude-haiku-4-5` 사용 |
| Actions (기본 제공) | `GITHUB_TOKEN` | GitHub 근거 수집(이슈·PR·PR 변경 파일 조회)에서 사용. 별도 등록 불필요 — Actions가 job마다 자동 발급하는 토큰을 그대로 쓴다 (`ask.yml`의 `permissions: issues: read, pull-requests: read`) |

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

`apps/agent`는 `.github/workflows/ask.yml`의 `workflow_dispatch`로 실행됩니다. `AX_PAYLOAD`(암호화된 payload)와 `AX_PAYLOAD_KEY`를 받아 복호화한 뒤, 로그에 interaction token이 남지 않도록 즉시 `::add-mask::`로 마스킹합니다.

### 질문 의도 분석 (LLM #1)

`apps/agent/src/intents`에서 기획자의 질문을 Claude(`@anthropic-ai/sdk`의 `messages.parse` + `zodOutputFormat`)로 분석해 구조화된 `AskIntent`(질문 유형, 기능명, 확인할 저장소, 검색 키워드, 모호 여부 등)를 얻습니다. 이 단계는 질문에 직접 답하지 않고 분류·추출만 하며, 다음 단계(GitHub 근거 수집)가 이 결과를 입력으로 사용할 예정입니다.

- 결과에 따라 `apps/agent/src/answers/create-intent-answer.ts`가 세 가지 Discord 답변(①의도 확인, ②명확화 재질문, ③범위 밖 안내) 중 하나를 만듭니다.
- `apps/agent/src/intents/project-context.ts`는 Keeply-Server / Keeply-client 코드를 읽고 만든 도메인 용어집 **초안**입니다. 두 저장소의 도메인(패키지, 엔티티, 라우트 등)이 바뀌면 반드시 이 파일도 함께 갱신해야 합니다.
- 로그에는 질문 원문, 분석 결과, API 키를 절대 남기지 않고 토큰 사용량(`의도 분석 완료 (input N / output M tokens)`)만 남깁니다.

#### 평가 스크립트 (로컬 전용)

```bash
ANTHROPIC_API_KEY=... pnpm --filter @keeply-ax/agent run eval:intent
```

10개의 샘플 한국어 질문에 대해 실제 Claude API를 호출해 기대값과 비교하고 정확도·토큰 사용량을 출력합니다. CI에서는 실행하지 않으며, 실행당 약 $0.03(Haiku 4.5, 샘플 10개 기준 추정치)의 비용이 발생합니다.

### GitHub 근거 수집 (`apps/agent/src/evidences`)

의도 분석 결과가 `out_of_scope`이거나 모호(`is_ambiguous`)하면 근거 수집을 건너뛰고 기존 의도 답변을 그대로 보냅니다. 그 외에는 LLM 호출 없이 순수 GitHub REST API(Actions 기본 `GITHUB_TOKEN`)와 워크플로에서 체크아웃해 둔 로컬 저장소(`repos/server`, `repos/client`)만으로 근거를 모읍니다.

1. **이슈·PR 목록 조회** (`get-repository-items.ts`): `/issues`(PR 포함 — `pull_request` 필드로 순수 이슈만 분리), `/pulls`를 각각 페이지네이션해 전부 가져옵니다.
2. **관련도 선별** (`filter-relevant-items.ts`): 제목·라벨(PR은 브랜치명 포함)에 키워드가 하나 이상 있는 항목만 고르고, 본문 매칭은 순위에만 반영합니다(본문에서 지나가듯 언급만 한 항목 제외). 제목(가중치 높음) > 브랜치명 > 라벨 > 본문(가중치 낮음) 순으로 점수를 매겨 이슈·PR 각각 상위 5개를 고릅니다.
3. **열린 PR 변경 파일 조회** (`get-pull-request-files.ts`): 선별된 열린 PR만 `/pulls/{n}/files`로 변경 파일 목록을 가져와 이후 "작업 중 PR에서 변경" 판정에 사용합니다.
4. **코드 검색** (`get-code-matches.ts`): 로컬 체크아웃 디렉터리에서 `ripgrep(rg)`을 키워드별로 실행합니다(`--fixed-strings --ignore-case`, `node_modules`/`build`/`dist`/`test` 등 제외). rg의 "매칭 없음"(exit code 1)은 에러가 아니라 빈 결과로 처리합니다.
5. **코드 관련도 선별 + 스니펫 추출** (`filter-relevant-code.ts`): 파일 단위로 점수를 합산합니다 — 코드 식별자 키워드(예: `NoticeController`, ASCII 문자 포함) 매칭은 높은 가중치, 경로에 키워드 포함 시 가산점, 한글 키워드 매칭은 낮은 가중치를 줍니다(테스트 코드는 4단계에서 검색 대상에서 제외). 매칭 라인 주변 ±5줄을 병합한 스니펫을 파일당 최대 40줄로 추출하고, 각 줄에 실제 줄 번호를 붙이며 떨어진 구간 사이에는 생략 표시를 넣습니다(링크·표시 범위는 첫 구간 기준).
6. **호출 흐름 추적** (`get-call-flow.ts`, 휴리스틱):
   - **Server**: 파일 경로로 계층(controller/service/repository)을 판별하고, 클래스명에서 도메인 접두사(`NoticeController` → `Notice`)를 추출합니다. `{도메인}Controller`/`{도메인}Service`/`{도메인}ServiceImpl`/`{도메인}Repository` 파일이 실제로 존재하고, Controller 파일 내용에 Service 클래스명이, ServiceImpl(또는 인터페이스) 파일 내용에 Repository 클래스명이 등장할 때만 `Controller → Service → Repository` 체인을 만듭니다. 하나라도 확인되지 않으면 빈 배열입니다.
   - **Client**: `entities/{모듈}` 또는 `features/{모듈}` 경로에서 모듈 세그먼트를 뽑아, 그 문자열을 import하는 `pages/`·`app/` 하위 파일을 찾아 `[페이지 파일, 모듈 파일]` 체인을 만듭니다. 못 찾으면 빈 배열입니다.
   - 두 휴리스틱 모두 이름 규칙(관례)과 정적 문자열 매칭에 기반하므로, 관례를 벗어난 코드(다른 네이밍, 동적 import, DI 프레임워크의 리플렉션 기반 연결 등)는 흐름을 못 찾을 수 있습니다.
7. **근거 묶음 생성 + 예산 제한** (`get-evidence-bundle.ts`): 저장소별로 위 단계를 병렬 실행해 `EvidenceBundle`로 합칩니다. 코드 근거는 전체 최대 12개, 스니펫 총 글자수 30,000자를 넘지 않도록 점수 낮은 항목부터 잘라냅니다(`trimCodeEvidencesToBudget`). `checkedRefs`에는 실제로 조회한 저장소·브랜치·HEAD 커밋 SHA를 기록합니다.
8. **대체 텍스트 답변** (`answers/create-evidence-answer.ts`): 구현 상태 판정 블록 아래에 이슈/PR/코드 섹션을 조립하고(빈 섹션은 생략), 무엇도 못 찾으면 전용 안내 메시지를 보냅니다. 기획자용 답변(embed) 생성이 실패했을 때만 이 텍스트 답변을 보냅니다.

**전제·한계**

- 두 대상 저장소가 **public**이라 Actions 기본 `GITHUB_TOKEN`으로 이슈·PR API를 호출할 수 있습니다. 저장소가 private으로 바뀌면 별도 권한을 가진 GitHub App(또는 PAT)이 필요합니다.
- 관련도 점수·호출 흐름은 모두 규칙 기반 휴리스틱이며 LLM을 쓰지 않습니다. 키워드가 코드/제목과 겹치지 않으면(동의어, 오타 등) 근거를 놓칠 수 있습니다.
- 예산: 이슈·PR 각 최대 5개, 코드 근거 최대 12개, 코드 스니펫 파일당 최대 40줄·전체 최대 30,000자.

### 구현 상태 판정 (`apps/agent/src/judgments`)

수집한 `EvidenceBundle`을 LLM 없이 규칙으로 판정해 `ImplementationJudgment`(상태·확신·진행 중 작업 여부·근거·확인하지 못한 범위)를 만듭니다. "함수가 있다"만으로는 구현 완료로 보지 않고, 요청 처리 흐름에 연결된 코드가 있을 때만 확신을 높게 줍니다.

**코드 역할 분류** (`check-code-role.ts`): 호출 흐름이 연결된 일반 구현 파일은 `flow`, 흐름을 못 찾았거나 `.d.ts`·`/dto/`·`/types/`·`schema(s)` 경로 세그먼트·파일명(자동 생성 타입·DTO·스키마)은 흐름이 붙어 있어도 `supporting`으로 분류합니다. `OrderSchemaValidationService`처럼 이름 중간에 Schema가 들어간 구현 클래스는 `supporting`으로 보지 않습니다.

**판정 규칙** (`get-implementation-judgment.ts`, 위에서부터 먼저 맞는 규칙 적용)

| 순서 | 조건 | 상태 | 확신 |
|---|---|---|---|
| 1 | 기본 브랜치에 흐름이 연결된 코드(`flow`) | 기본 브랜치 반영 | 높음 |
| 2 | 기본 브랜치에 보조 코드만 있음 / 병합된 PR만 있음 | 기본 브랜치 반영 | 낮음 |
| 3 | 열린 PR만 있음 | 작업 진행 중 | 낮음 |
| 4 | 이슈·닫힌 PR만 있음 (열린 이슈 / 병합 없이 닫힌 PR / 닫힌 이슈만) | 계획 또는 작업 대기 | 높음 / 낮음 / 낮음 |
| 5 | 근거 없음 | 구현 여부 확인 불가 | 높음 |

- 코드 근거는 모두 기본 브랜치 체크아웃에서 읽습니다. 열린 PR이 같은 파일을 수정 중이어도 이미 기본 브랜치에 있는 구현이므로 반영 근거로 인정하고, PR 수정 여부는 진행 중 작업(`hasOpenWork`)과 보조 근거("열린 PR에서 수정 중인 코드")로만 알립니다.
- 병합 없이 닫힌 PR은 기본 브랜치 반영 근거로 보지 않습니다. 단, 더 강한 근거가 없으면 병합 없이 닫힌 PR도 "작업을 시도한 흔적"으로 판정 근거에 표시해, 근거 목록과 판정 요약이 서로 모순되지 않게 합니다.
- 배포 시스템과 연동하지 않았으므로 **배포 확인됨은 판정하지 않습니다.** 배포를 묻는 질문도 코드 기준으로 판정하고, 배포 여부는 확인하지 못한 범위로 안내합니다.
- 반영 판정이어도 열린 PR이 있으면 `hasOpenWork`로 진행 중인 작업을 함께 알립니다.
- 근거(`reasons`)는 판정을 결정한 근거를 맨 앞에 두고, 나머지 근거도 건수와 대표 링크(최대 3개)와 함께 담습니다.

**확인하지 못한 범위** (`get-unverified-scopes.ts`): `실제 배포 여부`(항상 첫 번째)·`실행 결과`는 항상 포함하고, 클라이언트/서버 저장소를 검색하지 않았으면 `화면(클라이언트) 구현`/`서버 로직`을, 확신이 낮은 반영 판정이면 `요청 처리 흐름 연결`을 추가합니다.

**Discord 표시**: 판정은 기획자용 답변 embed의 제목·색상으로 보여주고, 답변 생성이 실패하면 대체 텍스트 답변 맨 앞에 `판정: …` 블록으로 보여줍니다.

### 기획자용 답변 생성 (LLM #2, `apps/agent/src/planner-answers`)

수집한 근거와 규칙 판정을 기획자가 읽을 수 있는 업무 언어로 정리해 Discord **embed**로 보냅니다. 모델은 기본 `claude-haiku-4-5`이며 Actions variable `AX_ANSWER_MODEL`로 바꿀 수 있습니다.

**지어내지 않게 하는 장치**

- **전체 상태는 규칙 판정 그대로**: embed 제목의 상태·색상은 `ImplementationJudgment`를 쓰고, LLM은 요약과 세부 기능 설명만 만듭니다.
- **근거는 ID로만 인용**: 근거마다 `E1, E2 …` ID를 붙여 넘기고(`create-evidence-catalog.ts`), LLM은 ID만 인용합니다. 링크 URL은 코드가 붙이므로 링크를 지어낼 수 없습니다.
- **인용 검증** (`convert-to-verified-answer.ts`): 존재하지 않는 ID는 버리고, 유효한 근거가 하나도 없는 세부 기능은 상태를 "구현 여부 확인 불가"로 강등합니다. 문장 안에 새어 나온 `(E1)` 같은 ID 표기도 지웁니다.
- **구조화 출력**: `messages.parse` + `zodOutputFormat(plannerAnswerSchema)`로 형식을 고정합니다.
- **실패 시 대체**: 답변 생성이 실패하면 오류 안내 대신 규칙 기반 텍스트 답변(판정 요약 + 근거 목록)을 보냅니다.

**embed 구성** (`answers/create-planner-answer-embed.ts`): 제목(기능 — 전체 상태), 요약·확신·진행 중 작업, 세부 기능별 필드(상태·설명·근거 링크), 참고, 확인하지 못한 범위, 조회 기준(브랜치@커밋·KST 시각). Discord embed 길이 제한(필드 1024자, 전체 6000자)을 넘으면 설명과 세부 기능 필드부터 줄이고 근거 링크 줄은 온전히 남깁니다. 답변에는 장식 이모지를 쓰지 않습니다.

비용은 질문당 약 입력 1만 토큰·출력 1천 토큰(Haiku 4.5 기준 약 $0.015)이며, 의도 분석을 포함하면 약 $0.02입니다.

#### 평가 스크립트 (로컬 전용)

```bash
pnpm --filter @keeply-ax/agent run eval:answer
```

샘플 질문 4개로 의도 분석 → 근거 수집 → 판정 → 답변 생성을 실제로 실행해 embed를 출력하고, 없는 근거 ID 수·강등 수·길이 제한·이모지 여부를 자동으로 확인합니다. 설명 품질은 출력된 embed를 읽고 판단합니다. CI에서는 실행하지 않으며 실행당 약 $0.1의 비용이 발생합니다.

### 로컬 근거 수집 스크립트 (로컬 전용)

```bash
# GITHUB_TOKEN 환경 변수가 없으면 `gh auth token`으로 대체합니다.
# 기본적으로 keeply-ax와 같은 폴더에 있는 keeply-server, keeply-client 체크아웃을 사용합니다 (AX_SERVER_DIR/AX_CLIENT_DIR로 override 가능).
ANTHROPIC_API_KEY=... pnpm --filter @keeply-ax/agent run collect:evidence "공지사항 기능 어디까지 구현됐어?"
```

의도 분석 → 근거 수집을 실제로 실행해 Discord 요약과 코드 근거 상세 표(점수·흐름 포함)를 출력합니다. CI에서는 실행하지 않으며 Claude API 비용이 발생합니다.

## 기술 스택

- TypeScript, pnpm workspace, Node 22
- Cloudflare Workers, GitHub Actions
- Claude Haiku 4.5 (`claude-haiku-4-5`)
- 대상 저장소: `Project-Keeply/Keeply-Server`, `Project-Keeply/Keeply-client`
