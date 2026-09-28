/**
 * 근거 수집(getAskIntent + getEvidenceBundle)을 실제 로컬 저장소·GitHub API로 검증하는 로컬 전용 스크립트다.
 * CI에서는 실행하지 않는다 (ANTHROPIC_API_KEY, GitHub API 호출, 네트워크가 필요).
 *
 * 실행: pnpm --filter @keeply-ax/agent run collect:evidence "질문"
 *
 * AX_SERVER_DIR/AX_CLIENT_DIR이 없으면 keeply-ax와 같은 폴더에 있는 keeply-server, keeply-client
 * 로컬 체크아웃을 기본으로 사용한다. (Actions 기본값인 repos/server, repos/client는 사용하지 않는다)
 * GITHUB_TOKEN 환경 변수가 없으면 `gh auth token`으로 대체한다.
 */
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createEvidenceAnswer } from '../src/answers/create-evidence-answer';
import { getEvidenceBundle } from '../src/evidences/get-evidence-bundle';
import { getAskIntent } from '../src/intents/get-ask-intent';
import { getImplementationJudgment } from '../src/judgments/get-implementation-judgment';

const execFileAsync = promisify(execFile);
const DEFAULT_INTENT_MODEL = 'claude-haiku-4-5';
// apps/agent/scripts 기준으로 keeply-ax의 상위 폴더(itc_Keeply)에 있는 형제 저장소
const LOCAL_SERVER_DIR = fileURLToPath(new URL('../../../../keeply-server', import.meta.url));
const LOCAL_CLIENT_DIR = fileURLToPath(new URL('../../../../keeply-client', import.meta.url));

const setLocalRepositoryDirs = (): void => {
  process.env.AX_SERVER_DIR ??= LOCAL_SERVER_DIR;
  process.env.AX_CLIENT_DIR ??= LOCAL_CLIENT_DIR;
};

const getRequiredAnthropicApiKey = (): string => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY 환경 변수가 없어요. collect:evidence 스크립트는 실제 Claude API를 호출합니다.');
    process.exit(1);
  }
  return apiKey;
};

const getGithubToken = async (): Promise<string> => {
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN;
  }
  try {
    const { stdout } = await execFileAsync('gh', ['auth', 'token']);
    return stdout.trim();
  } catch {
    console.error('GITHUB_TOKEN 환경 변수도 없고 `gh auth token`도 실패했어요. gh CLI 로그인 상태를 확인하세요.');
    process.exit(1);
  }
};

const printCodeEvidenceTable = (bundle: Awaited<ReturnType<typeof getEvidenceBundle>>): void => {
  const codeEvidences = bundle.evidences.filter((evidence) => evidence.kind === 'code');
  if (codeEvidences.length === 0) {
    console.log('(코드 근거 없음)');
    return;
  }
  codeEvidences.forEach((evidence) => {
    console.log(
      `- [${evidence.repository.name}] ${evidence.path} L${evidence.startLine}-${evidence.endLine} | score=${evidence.score.toFixed(1)} | isChangedInOpenPr=${evidence.isChangedInOpenPr} | flow=${evidence.flow.join(' -> ') || '(없음)'}`,
    );
  });
};

const run = async (): Promise<void> => {
  setLocalRepositoryDirs();
  const question = process.argv[2];
  if (!question) {
    console.error('사용법: pnpm --filter @keeply-ax/agent run collect:evidence "질문"');
    process.exit(1);
  }

  const anthropicApiKey = getRequiredAnthropicApiKey();
  const githubToken = await getGithubToken();
  const model = process.env.AX_INTENT_MODEL ?? DEFAULT_INTENT_MODEL;

  console.log(`의도 분석 중... (question="${question}")`);
  const { intent } = await getAskIntent({ question, apiKey: anthropicApiKey, model });
  console.log('의도 분석 결과:', JSON.stringify(intent, null, 2));

  if (intent.question_type === 'out_of_scope' || intent.is_ambiguous) {
    console.log('\n범위 밖이거나 모호한 질문이라 근거 수집을 건너뜁니다.');
    return;
  }

  console.log('\n근거 수집 중...');
  const bundle = await getEvidenceBundle(intent, githubToken);

  const judgment = getImplementationJudgment(bundle);

  console.log('\n=== Discord 요약 ===');
  console.log(createEvidenceAnswer(intent, bundle, judgment));

  console.log('\n=== 이슈 ===');
  bundle.evidences
    .filter((evidence) => evidence.kind === 'issue')
    .forEach((issue) => console.log(`- [${issue.repository.name}] #${issue.number} ${issue.title} (${issue.state})`));

  console.log('\n=== PR ===');
  bundle.evidences
    .filter((evidence) => evidence.kind === 'pull_request')
    .forEach((pr) => console.log(`- [${pr.repository.name}] #${pr.number} ${pr.title} (${pr.state})`));

  console.log('\n=== 코드 (상세) ===');
  printCodeEvidenceTable(bundle);
};

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : '근거 수집 스크립트 실행 중 알 수 없는 오류가 발생했습니다.');
  process.exit(1);
});
