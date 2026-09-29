import { ASK_PROCESSING_FAILED_MESSAGE, getDecryptedPayload } from '@keeply-ax/shared';
import type { EvidenceBundle, ImplementationJudgment } from '@keeply-ax/shared';
import type { APIEmbed } from 'discord-api-types/v10';
import { createEvidenceAnswer } from './answers/create-evidence-answer';
import { createIntentAnswer } from './answers/create-intent-answer';
import { createPlannerAnswerEmbed } from './answers/create-planner-answer-embed';
import { editOriginalMessage } from './discords/edit-original-message';
import { getEvidenceBundle } from './evidences/get-evidence-bundle';
import type { AskIntent } from './intents/ask-intent-schema';
import { getAskIntent } from './intents/get-ask-intent';
import { getImplementationJudgment } from './judgments/get-implementation-judgment';
import { convertToVerifiedAnswer } from './planner-answers/convert-to-verified-answer';
import { createEvidenceCatalog } from './planner-answers/create-evidence-catalog';
import { getPlannerAnswer } from './planner-answers/get-planner-answer';

const DEFAULT_INTENT_MODEL = 'claude-haiku-4-5';
const DEFAULT_ANSWER_MODEL = 'claude-haiku-4-5';

interface DiscordMessage {
  content: string;
  embeds: APIEmbed[];
}

interface CreatePlannerMessageParams {
  question: string;
  intent: AskIntent;
  bundle: EvidenceBundle;
  judgment: ImplementationJudgment;
  apiKey: string;
  model: string;
}

/**
 * 기획자용 답변(LLM #2)을 embed로 만든다.
 * 답변 생성이 실패해도 판정과 근거는 이미 있으므로, 오류 안내 대신 규칙 기반 텍스트 답변으로 대체한다.
 */
const createPlannerMessage = async ({ question, intent, bundle, judgment, apiKey, model }: CreatePlannerMessageParams): Promise<DiscordMessage> => {
  const catalog = createEvidenceCatalog(bundle);
  try {
    const { answer, usage } = await getPlannerAnswer({ question, intent, judgment, catalog, apiKey, model });
    console.log(`기획자 답변 생성 완료 (input ${usage.inputTokens} / output ${usage.outputTokens} tokens)`);
    const verifiedAnswer = convertToVerifiedAnswer(answer, catalog);
    return { content: '', embeds: [createPlannerAnswerEmbed({ intent, bundle, judgment, answer: verifiedAnswer, catalog })] };
  } catch (error) {
    // 오류 메시지에는 status·원인만 담기므로 질문·근거 내용은 로그에 남지 않는다.
    console.error(`기획자 답변 생성 실패, 규칙 기반 답변으로 대체: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    return { content: createEvidenceAnswer(intent, bundle, judgment), embeds: [] };
  }
};

interface CreateEvidenceMessageParams {
  question: string;
  intent: AskIntent;
  githubToken: string;
  apiKey: string;
  answerModel: string;
}

const createEvidenceMessage = async ({ question, intent, githubToken, apiKey, answerModel }: CreateEvidenceMessageParams): Promise<DiscordMessage> => {
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

  return createPlannerMessage({ question, intent, bundle, judgment, apiKey, model: answerModel });
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
  const answerModel = process.env.AX_ANSWER_MODEL ?? DEFAULT_ANSWER_MODEL;

  const payload = await getDecryptedPayload(encryptedPayload, payloadKey);
  // GitHub Actions 로그에 interaction_token 원문이 남지 않도록 즉시 마스킹한다.
  console.log(`::add-mask::${payload.interaction_token}`);
  console.log('payload 복호화 완료');

  try {
    const { intent, usage } = await getAskIntent({ question: payload.question, apiKey: anthropicApiKey, model: intentModel });
    console.log(`의도 분석 완료 (input ${usage.inputTokens} / output ${usage.outputTokens} tokens)`);

    const isEvidenceCollectionSkipped = intent.question_type === 'out_of_scope' || intent.is_ambiguous;
    const message: DiscordMessage = isEvidenceCollectionSkipped
      ? { content: createIntentAnswer(intent), embeds: [] }
      : await createEvidenceMessage({ question: payload.question, intent, githubToken, apiKey: anthropicApiKey, answerModel });

    await editOriginalMessage({ applicationId, interactionToken: payload.interaction_token, ...message });
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
