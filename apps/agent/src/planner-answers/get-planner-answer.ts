import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { ImplementationJudgment } from '@keeply-ax/shared';
import type { AskIntent } from '../intents/ask-intent-schema';
import type { EvidenceCatalogEntry } from './create-evidence-catalog';
import { createPlannerAnswerSystemPrompt, createPlannerAnswerUserMessage } from './create-planner-answer-prompt';
import { plannerAnswerSchema, type PlannerAnswer } from './planner-answer-schema';

// 세부 기능 6개 + 요약·보충 설명의 JSON이면 충분하지만, 한국어 설명이 길어질 여유를 둔다.
const MAX_TOKENS = 4096;
// LLM이 멈춰도 워크플로 제한(12분) 안에 규칙 기반 대체 답변까지 보낼 수 있도록 짧게 제한한다.
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 1;

interface GetPlannerAnswerParams {
  question: string;
  intent: AskIntent;
  judgment: ImplementationJudgment;
  catalog: EvidenceCatalogEntry[];
  apiKey: string;
  model: string;
}

interface GetPlannerAnswerResult {
  answer: PlannerAnswer;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

const callPlannerAnswerApi = async (client: Anthropic, params: GetPlannerAnswerParams) => {
  const { question, intent, judgment, catalog, model } = params;
  try {
    return await client.messages.parse({
      model,
      max_tokens: MAX_TOKENS,
      // 근거 목록은 질문마다 달라 캐시 이득이 없고, 고정 프롬프트는 Haiku 4.5의 최소 캐시 단위(4096 토큰)보다 짧다.
      system: createPlannerAnswerSystemPrompt(),
      messages: [{ role: 'user', content: createPlannerAnswerUserMessage({ question, intent, judgment, catalog }) }],
      output_config: { format: zodOutputFormat(plannerAnswerSchema) },
    });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      throw new Error(`기획자 답변 API 호출 실패 (status ${error.status ?? '알 수 없음'})`);
    }
    throw new Error('기획자 답변 API 호출 중 알 수 없는 오류가 발생했습니다.');
  }
};

/** 근거·판정을 기획자용 업무 언어 답변으로 정리한다 (LLM #2). */
export const getPlannerAnswer = async (params: GetPlannerAnswerParams): Promise<GetPlannerAnswerResult> => {
  const client = new Anthropic({ apiKey: params.apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: MAX_RETRIES });
  const response = await callPlannerAnswerApi(client, params);

  if (response.stop_reason === 'refusal') {
    throw new Error('기획자 답변 요청이 거부되었습니다.');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('기획자 답변이 최대 토큰 제한에 도달했습니다.');
  }
  if (!response.parsed_output) {
    throw new Error('기획자 답변을 구조화된 형식으로 파싱하지 못했습니다.');
  }

  return {
    answer: response.parsed_output,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
};
