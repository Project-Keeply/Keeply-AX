const DISCORD_MESSAGE_MAX_LENGTH = 2000;
const TRUNCATION_MARK = '…';

/** Discord 메시지 길이 제한(2000자)을 넘으면 잘라내고 말줄임표를 붙인다. */
export const truncateAnswer = (answer: string): string => {
  if (answer.length <= DISCORD_MESSAGE_MAX_LENGTH) {
    return answer;
  }
  return `${answer.slice(0, DISCORD_MESSAGE_MAX_LENGTH - TRUNCATION_MARK.length)}${TRUNCATION_MARK}`;
};
