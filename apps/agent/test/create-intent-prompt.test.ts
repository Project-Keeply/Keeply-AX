import { describe, expect, it } from 'vitest';
import { createIntentSystemPrompt, createIntentUserMessage } from '../src/intents/create-intent-prompt';
import { PROJECT_CONTEXT } from '../src/intents/project-context';

describe('createIntentUserMessage', () => {
  it('질문을 <question> 태그로 감싼다', () => {
    const message = createIntentUserMessage('로그인 기능 어디까지 구현됐어?');
    expect(message).toBe('<question>로그인 기능 어디까지 구현됐어?</question>');
  });

  it('질문 내용은 태그 안에서만 등장한다', () => {
    const question = '__UNIQUE_QUESTION_MARKER__';
    const message = createIntentUserMessage(question);
    const openTagIndex = message.indexOf('<question>');
    const closeTagIndex = message.indexOf('</question>');
    const markerIndex = message.indexOf(question);

    expect(openTagIndex).toBeGreaterThanOrEqual(0);
    expect(markerIndex).toBeGreaterThan(openTagIndex);
    expect(markerIndex).toBeLessThan(closeTagIndex);
    expect(message.split(question)).toHaveLength(2);
  });
});

describe('createIntentSystemPrompt', () => {
  it('프로젝트 컨텍스트를 포함한다', () => {
    const prompt = createIntentSystemPrompt();
    expect(prompt).toContain(PROJECT_CONTEXT);
  });
});
