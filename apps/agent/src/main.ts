import { ASK_PROCESSING_FAILED_MESSAGE, getDecryptedPayload } from '@keeply-ax/shared';
import { createEvidenceAnswer } from './answers/create-evidence-answer';
import { createIntentAnswer } from './answers/create-intent-answer';
import { editOriginalMessage } from './discords/edit-original-message';
import { getEvidenceBundle } from './evidences/get-evidence-bundle';
import type { AskIntent } from './intents/ask-intent-schema';
import { getAskIntent } from './intents/get-ask-intent';
import { getImplementationJudgment } from './judgments/get-implementation-judgment';

const DEFAULT_INTENT_MODEL = 'claude-haiku-4-5';

const getEvidenceAnswer = async (intent: AskIntent, githubToken: string): Promise<string> => {
  const startedAt = Date.now();
  const bundle = await getEvidenceBundle(intent, githubToken);
  const elapsedMs = Date.now() - startedAt;

  const issueCount = bundle.evidences.filter((evidence) => evidence.kind === 'issue').length;
  const pullRequestCount = bundle.evidences.filter((evidence) => evidence.kind === 'pull_request').length;
  const codeCount = bundle.evidences.filter((evidence) => evidence.kind === 'code').length;
  // 질문·키워드·코드 스니펫은 로그에 남기지 않고 개수/소요시간만 남긴다.
  console.log(`근거 수집 완료 (issues ${issueCount} / prs ${pullRequestCount} / code ${codeCount}, ${elapsedMs}ms)`);

  const judgment = getImplementationJudgment(bundle);
  console.log(`상태 판정 완료 (status ${judgment.status} / confidence ${judgment.confidence})`);

  return createEvidenceAnswer(intent, bundle, judgment);
};

const getRequiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} 환경 변수가 설정되지 않았습니다.`);
  }
  return value;
};

const main = async (): Promise<void> => {
  const encryptedPayload = getRequiredEnv('AX_PAYLOAD');
  const payloadKey = getRequiredEnv('AX_PAYLOAD_KEY');
  const applicationId = getRequiredEnv('DISCORD_APPLICATION_ID');
  const anthropicApiKey = getRequiredEnv('ANTHROPIC_API_KEY');
  const githubToken = getRequiredEnv('GITHUB_TOKEN');
  const intentModel = process.env.AX_INTENT_MODEL ?? DEFAULT_INTENT_MODEL;

  const payload = await getDecryptedPayload(encryptedPayload, payloadKey);
  // GitHub Actions 로그에 interaction_token 원문이 남지 않도록 즉시 마스킹한다.
  console.log(`::add-mask::${payload.interaction_token}`);
  console.log('payload 복호화 완료');

  try {
    const { intent, usage } = await getAskIntent({ question: payload.question, apiKey: anthropicApiKey, model: intentModel });
    console.log(`의도 분석 완료 (input ${usage.inputTokens} / output ${usage.outputTokens} tokens)`);

    const isEvidenceCollectionSkipped = intent.question_type === 'out_of_scope' || intent.is_ambiguous;
    const answer = isEvidenceCollectionSkipped ? createIntentAnswer(intent) : await getEvidenceAnswer(intent, githubToken);

    await editOriginalMessage({ applicationId, interactionToken: payload.interaction_token, content: answer });
    console.log('답변 전송 완료');
  } catch (error) {
    console.error('답변 전송 실패');
    try {
      await editOriginalMessage({
        applicationId,
        interactionToken: payload.interaction_token,
        content: ASK_PROCESSING_FAILED_MESSAGE,
      });
    } catch {
      // 오류 안내 전송도 실패하면 더 할 수 있는 조치가 없다.
    }
    throw error;
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : '알 수 없는 오류로 종료합니다.');
  process.exit(1);
});
