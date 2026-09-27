/**
 * 의도 분석(getAskIntent)을 실제 Claude API로 호출해 정확도를 확인하는 로컬 전용 스크립트다.
 * CI에서는 실행하지 않는다 (ANTHROPIC_API_KEY, 네트워크, 과금이 필요).
 *
 * 실행: pnpm --filter @keeply-ax/agent run eval:intent
 * 비용: 실행당 약 $0.03 (Haiku 4.5, 샘플 10개 기준 추정치)
 */
import type { AskIntent } from '../src/intents/ask-intent-schema';
import { getAskIntent } from '../src/intents/get-ask-intent';

const DEFAULT_INTENT_MODEL = 'claude-haiku-4-5';

interface EvalSample {
  question: string;
  expectedQuestionType: AskIntent['question_type'];
  expectedIsAmbiguous: boolean;
}

const EVAL_SAMPLES: EvalSample[] = [
  { question: '유통기한 물품 등록 기능 어디까지 구현됐어?', expectedQuestionType: 'implementation_status', expectedIsAmbiguous: false },
  { question: '공지사항 작성 기능 개발 다 됐나요?', expectedQuestionType: 'implementation_status', expectedIsAmbiguous: false },
  { question: '근무 일지 인수인계 기능 진행 상황 알려줘', expectedQuestionType: 'implementation_status', expectedIsAmbiguous: false },
  { question: '초대 코드로 매장 가입할 때 코드가 틀리면 어떻게 동작해?', expectedQuestionType: 'behavior', expectedIsAmbiguous: false },
  { question: '카카오 로그인 지금 실제 서비스에 배포됐어?', expectedQuestionType: 'deployment', expectedIsAmbiguous: false },
  { question: '그거 다 됐어?', expectedQuestionType: 'implementation_status', expectedIsAmbiguous: true },
  { question: '이번에 요청한 기능 진행 상황 알려줘', expectedQuestionType: 'implementation_status', expectedIsAmbiguous: true },
  { question: '오늘 점심 뭐 먹지?', expectedQuestionType: 'out_of_scope', expectedIsAmbiguous: false },
  { question: '넌 어떤 모델이야?', expectedQuestionType: 'out_of_scope', expectedIsAmbiguous: false },
  { question: '회원 탈퇴 기능 구현됐어?', expectedQuestionType: 'implementation_status', expectedIsAmbiguous: false },
];

const getRequiredApiKey = (): string => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY 환경 변수가 없어요. eval:intent 스크립트는 실제 Claude API를 호출합니다.');
    process.exit(1);
  }
  return apiKey;
};

const printResultRow = (question: string, expected: string, actual: string, isCorrect: boolean): void => {
  const mark = isCorrect ? '✅' : '❌';
  console.log(`${mark} | ${question} | expected=${expected} | actual=${actual}`);
};

const runEval = async (): Promise<void> => {
  const apiKey = getRequiredApiKey();
  const model = process.env.AX_INTENT_MODEL ?? DEFAULT_INTENT_MODEL;

  let correctCount = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  console.log(`의도 분석 평가 시작 (model=${model}, samples=${EVAL_SAMPLES.length})\n`);

  for (const sample of EVAL_SAMPLES) {
    const { intent, usage } = await getAskIntent({ question: sample.question, apiKey, model });
    const isCorrect = intent.question_type === sample.expectedQuestionType && intent.is_ambiguous === sample.expectedIsAmbiguous;

    totalInputTokens += usage.inputTokens;
    totalOutputTokens += usage.outputTokens;
    correctCount += isCorrect ? 1 : 0;

    const expected = `${sample.expectedQuestionType}/ambiguous=${sample.expectedIsAmbiguous}`;
    const actual = `${intent.question_type}/ambiguous=${intent.is_ambiguous}`;
    printResultRow(sample.question, expected, actual, isCorrect);
  }

  const accuracy = ((correctCount / EVAL_SAMPLES.length) * 100).toFixed(1);
  console.log(`\n정확도: ${correctCount}/${EVAL_SAMPLES.length} (${accuracy}%)`);
  console.log(`총 토큰: input ${totalInputTokens} / output ${totalOutputTokens}`);
};

runEval().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : '평가 스크립트 실행 중 알 수 없는 오류가 발생했습니다.');
  process.exit(1);
});
