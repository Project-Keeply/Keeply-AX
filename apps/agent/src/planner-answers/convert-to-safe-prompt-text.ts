// 프롬프트에서 데이터 구역을 나누는 태그. 질문·이슈 제목·코드 조각 같은 신뢰할 수 없는 텍스트가
// 이 태그를 흉내 내 구역 밖으로 빠져나가 지시문처럼 보이지 않도록, 텍스트 안의 같은 태그는 무력화한다.
const PROMPT_DELIMITER_TAG_PATTERN = /<(\/?)(question|analysis|evidences|snippet)(\s[^>]*)?>/gi;

/** 신뢰할 수 없는 텍스트 안의 프롬프트 구분 태그를 꺾쇠 대신 대괄호로 바꿔 무력화한다. */
export const convertToSafePromptText = (text: string): string =>
  text.replace(PROMPT_DELIMITER_TAG_PATTERN, (_, slash: string, tagName: string) => `[${slash}${tagName}]`);
