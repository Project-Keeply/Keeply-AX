import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { askIntentSchema, type AskIntent } from './ask-intent-schema';
import { createIntentSystemPrompt, createIntentUserMessage } from './create-intent-prompt';

const MAX_TOKENS = 1024;

interface GetAskIntentParams {
  question: string;
  apiKey: string;
  model: string;
}

interface GetAskIntentResult {
  intent: AskIntent;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

const callAskIntentApi = async (client: Anthropic, question: string, model: string) => {
  try {
    return await client.messages.parse({
      model,
      max_tokens: MAX_TOKENS,
      // Haiku 4.5의 프롬프트 캐싱 최소 캐시 단위(4096 토큰)보다 이 프롬프트가 훨씬 짧아서
      // 캐시 이득이 없으므로 cache_control을 쓰지 않는다.
      system: createIntentSystemPrompt(),
      messages: [{ role: 'user', content: createIntentUserMessage(question) }],
      output_config: { format: zodOutputFormat(askIntentSchema) },
    });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      throw new Error(`의도 분석 API 호출 실패 (status ${error.status ?? '알 수 없음'})`);
    }
    throw new Error('의도 분석 API 호출 중 알 수 없는 오류가 발생했습니다.');
  }
};

export const getAskIntent = async ({ question, apiKey, model }: GetAskIntentParams): Promise<GetAskIntentResult> => {
  const client = new Anthropic({ apiKey });
  const response = await callAskIntentApi(client, question, model);

  if (response.stop_reason === 'refusal') {
    throw new Error('의도 분석 요청이 거부되었습니다.');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('의도 분석 응답이 최대 토큰 제한에 도달했습니다.');
  }
  if (!response.parsed_output) {
    throw new Error('의도 분석 응답을 구조화된 형식으로 파싱하지 못했습니다.');
  }

  return {
    intent: response.parsed_output,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
};
