const DISCORD_MESSAGE_MAX_LENGTH = 2000;
const TRUNCATION_MARK = '…';

/**
 * Discord 메시지 길이 제한(2000자)을 넘으면 잘라내고 말줄임표를 붙인다.
 * preservedSuffix(조회 기준·안내 문구 등)는 잘리지 않도록 본문만 줄이고 항상 끝에 붙인다.
 */
export const truncateAnswer = (body: string, preservedSuffix = ''): string => {
  const answer = `${body}${preservedSuffix}`;
  if (answer.length <= DISCORD_MESSAGE_MAX_LENGTH) {
    return answer;
  }
  const bodyMaxLength = Math.max(DISCORD_MESSAGE_MAX_LENGTH - preservedSuffix.length - TRUNCATION_MARK.length, 0);
  return `${body.slice(0, bodyMaxLength)}${TRUNCATION_MARK}${preservedSuffix}`.slice(0, DISCORD_MESSAGE_MAX_LENGTH);
};
