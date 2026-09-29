import { z } from 'zod';

/**
 * 기획자용 답변(LLM #2) 구조화 출력 스키마.
 * 전체 판정 상태는 규칙 기반 판정(#8)을 그대로 쓰므로 여기에는 없고, LLM은 요약·세부 기능 설명만 만든다.
 * 근거는 URL이 아니라 근거 목록의 ID(E1, E2 …)로만 인용해 링크를 지어낼 수 없게 한다.
 */
export const plannerAnswerSchema = z.object({
  summary: z.string(),
  sub_features: z.array(
    z.object({
      name: z.string(),
      status: z.enum(['merged', 'in_progress', 'planned', 'unverified']),
      description: z.string(),
      evidence_ids: z.array(z.string()),
    }),
  ),
  notes: z.array(z.string()),
});

export type PlannerAnswer = z.infer<typeof plannerAnswerSchema>;

export type PlannerSubFeature = PlannerAnswer['sub_features'][number];
