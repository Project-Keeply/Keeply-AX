import { describe, expect, it } from 'vitest';
import { createEchoAnswer } from '../src/answers/create-echo-answer';

const DISCORD_MESSAGE_MAX_LENGTH = 2000;

describe('createEchoAnswer', () => {
  it('질문을 포함한 고정 포맷 문자열을 반환', () => {
    const answer = createEchoAnswer('로그인 기능 구현됐나요?');
    expect(answer).toBe(
      '📨 질문을 받았어요: "로그인 기능 구현됐나요?"\n(현재는 연결 테스트 단계라 실제 분석은 하지 않아요.)',
    );
  });

  it('짧은 질문이면 그대로 유지되며 2000자 이하다', () => {
    const answer = createEchoAnswer('짧은 질문');
    expect(answer.length).toBeLessThanOrEqual(DISCORD_MESSAGE_MAX_LENGTH);
  });

  it('매우 긴 질문이면 2000자 이하로 잘라낸다', () => {
    const longQuestion = '가'.repeat(3000);
    const answer = createEchoAnswer(longQuestion);
    expect(answer.length).toBeLessThanOrEqual(DISCORD_MESSAGE_MAX_LENGTH);
    expect(answer.startsWith('📨 질문을 받았어요: "')).toBe(true);
    expect(answer).toContain('…');
  });
});
