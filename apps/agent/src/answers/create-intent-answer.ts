import type { AskIntent } from '../intents/ask-intent-schema';

const DISCORD_MESSAGE_MAX_LENGTH = 2000;
const TRUNCATION_MARK = '…';

const QUESTION_TYPE_LABEL: Record<Exclude<AskIntent['question_type'], 'out_of_scope'>, string> = {
  implementation_status: '구현 현황',
  behavior: '동작 조건',
  deployment: '배포 여부',
};

const TARGET_REPOSITORY_LABEL: Record<AskIntent['target_repositories'][number], string> = {
  server: 'Server',
  client: 'Client',
};

const OUT_OF_SCOPE_ANSWER = `🙏 기능 구현 현황에 대한 질문만 답할 수 있어요.
예: "회원가입 어디까지 구현됐어?"`;

const createClearAnswer = (intent: AskIntent): string => {
  const subFeatureLine = intent.sub_features.length > 0 ? `\n• 세부 기능: ${intent.sub_features.join(', ')}` : '';
  const questionTypeLabel = QUESTION_TYPE_LABEL[intent.question_type as Exclude<AskIntent['question_type'], 'out_of_scope'>];
  const targetRepositoryLabels = intent.target_repositories.map((repository) => TARGET_REPOSITORY_LABEL[repository]).join(', ');
  const searchKeywords = intent.search_keywords.join(', ');

  return `🔎 질문을 이렇게 이해했어요
• 기능: ${intent.feature_name}${subFeatureLine}
• 궁금한 점: ${questionTypeLabel}
• 확인할 저장소: ${targetRepositoryLabels}
• 검색 키워드: ${searchKeywords}
(다음 단계에서 GitHub 근거를 확인할 예정이에요.)`;
};

const createAmbiguousAnswer = (intent: AskIntent): string => {
  const optionLines = intent.clarification_options.map((option) => `• ${option}`).join('\n');

  return `🤔 ${intent.clarification_question}
${optionLines}
구체적인 기능 이름으로 다시 /ask 해주세요.`;
};

const truncateAnswer = (answer: string): string => {
  if (answer.length <= DISCORD_MESSAGE_MAX_LENGTH) {
    return answer;
  }
  return `${answer.slice(0, DISCORD_MESSAGE_MAX_LENGTH - TRUNCATION_MARK.length)}${TRUNCATION_MARK}`;
};

export const createIntentAnswer = (intent: AskIntent): string => {
  if (intent.question_type === 'out_of_scope') {
    return truncateAnswer(OUT_OF_SCOPE_ANSWER);
  }
  if (intent.is_ambiguous) {
    return truncateAnswer(createAmbiguousAnswer(intent));
  }
  return truncateAnswer(createClearAnswer(intent));
};
