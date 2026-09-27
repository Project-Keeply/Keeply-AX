import type { AskIntent } from '../intents/ask-intent-schema';
import { truncateAnswer } from './truncate-answer';

const QUESTION_TYPE_LABEL: Record<Exclude<AskIntent['question_type'], 'out_of_scope'>, string> = {
  implementation_status: '구현 현황',
  behavior: '동작 조건',
  deployment: '배포 여부',
};

const TARGET_REPOSITORY_LABEL: Record<AskIntent['target_repositories'][number], string> = {
  server: 'Server',
  client: 'Client',
};

const DEFAULT_CLARIFICATION_QUESTION = '어떤 기능을 확인할까요?';

const OUT_OF_SCOPE_ANSWER = `🙏 기능 구현 현황에 대한 질문만 답할 수 있어요.
예: "회원가입 어디까지 구현됐어?"`;

// 모델이 저장소·키워드를 비워 보내면 값 없는 줄 대신 해당 줄을 생략한다.
const createClearAnswer = (intent: AskIntent): string => {
  const { feature_name, sub_features, target_repositories, search_keywords } = intent;
  const questionTypeLabel = QUESTION_TYPE_LABEL[intent.question_type as Exclude<AskIntent['question_type'], 'out_of_scope'>];
  const targetRepositoryLabels = target_repositories.map((repository) => TARGET_REPOSITORY_LABEL[repository]).join(', ');
  const lines = [
    '🔎 질문을 이렇게 이해했어요',
    `• 기능: ${feature_name}`,
    sub_features.length > 0 ? `• 세부 기능: ${sub_features.join(', ')}` : null,
    `• 궁금한 점: ${questionTypeLabel}`,
    target_repositories.length > 0 ? `• 확인할 저장소: ${targetRepositoryLabels}` : null,
    search_keywords.length > 0 ? `• 검색 키워드: ${search_keywords.join(', ')}` : null,
    '(다음 단계에서 GitHub 근거를 확인할 예정이에요.)',
  ];

  return lines.filter((line): line is string => line !== null).join('\n');
};

// 모델이 되묻기 문구·선택지를 비워 보내도 깨진 메시지("🤔 null", 빈 목록 줄)가 나가지 않도록 방어한다.
const createAmbiguousAnswer = ({ clarification_question, clarification_options }: AskIntent): string => {
  const questionLine = `🤔 ${clarification_question?.trim() || DEFAULT_CLARIFICATION_QUESTION}`;
  const optionLines = clarification_options.filter((option) => option.trim()).map((option) => `• ${option}`);

  return [questionLine, ...optionLines, '구체적인 기능 이름으로 다시 /ask 해주세요.'].join('\n');
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
