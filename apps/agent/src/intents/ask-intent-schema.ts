import { z } from 'zod';

/**
 * 기획자의 /ask 질문을 분석한 결과 스키마.
 * Claude에게 이 형태로 구조화 출력을 강제해 이후 단계(GitHub 근거 수집)에서 그대로 사용한다.
 */
export const askIntentSchema = z.object({
  question_type: z.enum(['implementation_status', 'behavior', 'deployment', 'out_of_scope']),
  feature_name: z.string(),
  sub_features: z.array(z.string()),
  target_repositories: z.array(z.enum(['server', 'client'])),
  search_keywords: z.array(z.string()),
  is_ambiguous: z.boolean(),
  clarification_question: z.string().nullable(),
  clarification_options: z.array(z.string()),
});

export type AskIntent = z.infer<typeof askIntentSchema>;
