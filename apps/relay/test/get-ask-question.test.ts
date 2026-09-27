import { ApplicationCommandOptionType, type APIChatInputApplicationCommandInteractionData } from 'discord-api-types/v10';
import { describe, expect, it } from 'vitest';
import { getAskQuestion } from '../src/utils/get-ask-question';

const createData = (options: APIChatInputApplicationCommandInteractionData['options']): APIChatInputApplicationCommandInteractionData =>
  ({ id: '1', name: 'ask', type: 1, options }) as APIChatInputApplicationCommandInteractionData;

describe('getAskQuestion', () => {
  it('question 문자열 옵션을 반환', () => {
    const data = createData([{ name: 'question', type: ApplicationCommandOptionType.String, value: '로그인 구현됐나요?' }]);
    expect(getAskQuestion(data)).toBe('로그인 구현됐나요?');
  });

  it('question 옵션이 없으면 null', () => {
    expect(getAskQuestion(createData([]))).toBeNull();
    expect(getAskQuestion(createData(undefined))).toBeNull();
  });

  it('question 값이 빈 문자열이면 null', () => {
    const data = createData([{ name: 'question', type: ApplicationCommandOptionType.String, value: '' }]);
    expect(getAskQuestion(data)).toBeNull();
  });
});
