import { describe, expect, it } from 'vitest';
import type { AskIntent } from '../src/intents/ask-intent-schema';
import { createIntentAnswer } from '../src/answers/create-intent-answer';

const DISCORD_MESSAGE_MAX_LENGTH = 2000;

const createBaseIntent = (overrides: Partial<AskIntent> = {}): AskIntent => ({
  question_type: 'implementation_status',
  feature_name: '유통기한 물품 관리',
  sub_features: [],
  target_repositories: ['server', 'client'],
  search_keywords: ['ExpiryItem', '유통기한'],
  is_ambiguous: false,
  clarification_question: null,
  clarification_options: [],
  ...overrides,
});

describe('createIntentAnswer', () => {
  it('명확한 경우 고정 포맷으로 답한다', () => {
    const answer = createIntentAnswer(createBaseIntent());
    expect(answer).toBe(
      `🔎 질문을 이렇게 이해했어요
• 기능: 유통기한 물품 관리
• 궁금한 점: 구현 현황
• 확인할 저장소: Server, Client
• 검색 키워드: ExpiryItem, 유통기한
(다음 단계에서 GitHub 근거를 확인할 예정이에요.)`,
    );
  });

  it('sub_features가 있으면 세부 기능 줄을 추가한다', () => {
    const answer = createIntentAnswer(createBaseIntent({ sub_features: ['등록', '수정'] }));
    expect(answer).toContain('• 기능: 유통기한 물품 관리\n• 세부 기능: 등록, 수정\n• 궁금한 점: 구현 현황');
  });

  it('sub_features가 없으면 세부 기능 줄이 없다', () => {
    const answer = createIntentAnswer(createBaseIntent());
    expect(answer).not.toContain('세부 기능');
  });

  it('동작 조건 질문 유형을 라벨로 변환한다', () => {
    const answer = createIntentAnswer(createBaseIntent({ question_type: 'behavior' }));
    expect(answer).toContain('• 궁금한 점: 동작 조건');
  });

  it('배포 여부 질문 유형을 라벨로 변환한다', () => {
    const answer = createIntentAnswer(createBaseIntent({ question_type: 'deployment' }));
    expect(answer).toContain('• 궁금한 점: 배포 여부');
  });

  it('모호한 경우 되묻는 포맷으로 답한다', () => {
    const answer = createIntentAnswer(
      createBaseIntent({
        is_ambiguous: true,
        clarification_question: '어떤 기능을 말씀하시는 건가요?',
        clarification_options: ['유통기한 물품 관리', '공지사항'],
      }),
    );
    expect(answer).toBe(
      `🤔 어떤 기능을 말씀하시는 건가요?
• 유통기한 물품 관리
• 공지사항
구체적인 기능 이름으로 다시 /ask 해주세요.`,
    );
  });

  it('범위 밖 질문은 고정 안내 문구를 반환한다', () => {
    const answer = createIntentAnswer(createBaseIntent({ question_type: 'out_of_scope' }));
    expect(answer).toBe(
      `🙏 기능 구현 현황에 대한 질문만 답할 수 있어요.
예: "회원가입 어디까지 구현됐어?"`,
    );
  });

  it('out_of_scope가 is_ambiguous보다 우선한다', () => {
    const answer = createIntentAnswer(
      createBaseIntent({
        question_type: 'out_of_scope',
        is_ambiguous: true,
        clarification_question: '이건 무시되어야 함',
        clarification_options: ['A'],
      }),
    );
    expect(answer).toContain('🙏 기능 구현 현황에 대한 질문만 답할 수 있어요.');
  });

  it('2000자를 넘으면 말줄임표로 잘라낸다', () => {
    const longKeywords = Array.from({ length: 500 }, (_, index) => `키워드${index}`);
    const answer = createIntentAnswer(createBaseIntent({ search_keywords: longKeywords }));
    expect(answer.length).toBeLessThanOrEqual(DISCORD_MESSAGE_MAX_LENGTH);
    expect(answer.endsWith('…')).toBe(true);
  });

  describe('모델이 필드를 비워 보낸 경우', () => {
    it('되묻기 문구가 null이면 기본 문구를 쓰고, 선택지가 비면 목록 줄을 생략한다', () => {
      const answer = createIntentAnswer(
        createBaseIntent({ is_ambiguous: true, clarification_question: null, clarification_options: [] }),
      );
      expect(answer).toBe(`🤔 어떤 기능을 확인할까요?
구체적인 기능 이름으로 다시 /ask 해주세요.`);
    });

    it('공백뿐인 되묻기 문구·선택지도 비어 있는 것으로 처리한다', () => {
      const answer = createIntentAnswer(
        createBaseIntent({ is_ambiguous: true, clarification_question: '  ', clarification_options: [' ', '회원 가입'] }),
      );
      expect(answer).toBe(`🤔 어떤 기능을 확인할까요?
• 회원 가입
구체적인 기능 이름으로 다시 /ask 해주세요.`);
    });

    it('명확한 질문에서 저장소·키워드가 비면 해당 줄을 생략한다', () => {
      const answer = createIntentAnswer(createBaseIntent({ target_repositories: [], search_keywords: [] }));
      expect(answer).toBe(`🔎 질문을 이렇게 이해했어요
• 기능: 유통기한 물품 관리
• 궁금한 점: 구현 현황
(다음 단계에서 GitHub 근거를 확인할 예정이에요.)`);
    });
  });
});
