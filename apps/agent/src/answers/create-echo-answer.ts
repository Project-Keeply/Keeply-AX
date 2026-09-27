const DISCORD_MESSAGE_MAX_LENGTH = 2000;
const ANSWER_SUFFIX = '\n(현재는 연결 테스트 단계라 실제 분석은 하지 않아요.)';
const TRUNCATION_MARK = '…';

const createAnswerBody = (question: string): string => `📨 질문을 받았어요: "${question}"${ANSWER_SUFFIX}`;

export const createEchoAnswer = (question: string): string => {
  const fullAnswer = createAnswerBody(question);
  if (fullAnswer.length <= DISCORD_MESSAGE_MAX_LENGTH) {
    return fullAnswer;
  }

  const overflowLength = fullAnswer.length - DISCORD_MESSAGE_MAX_LENGTH + TRUNCATION_MARK.length;
  const truncatedQuestion = question.slice(0, Math.max(question.length - overflowLength, 0));
  return `${createAnswerBody(`${truncatedQuestion}${TRUNCATION_MARK}`)}`.slice(0, DISCORD_MESSAGE_MAX_LENGTH);
};
