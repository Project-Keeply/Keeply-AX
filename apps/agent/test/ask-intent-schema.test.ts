import { describe, expect, it } from 'vitest';
import { askIntentSchema } from '../src/intents/ask-intent-schema';

const VALID_INTENT = {
  question_type: 'implementation_status',
  feature_name: '유통기한 물품 관리',
  sub_features: ['등록', '수정'],
  target_repositories: ['server', 'client'],
  search_keywords: ['ExpiryItem', '유통기한'],
  is_ambiguous: false,
  clarification_question: null,
  clarification_options: [],
};

describe('askIntentSchema', () => {
  it('유효한 객체는 파싱에 성공한다', () => {
    const result = askIntentSchema.safeParse(VALID_INTENT);
    expect(result.success).toBe(true);
  });

  it('question_type이 허용된 enum 값이 아니면 실패한다', () => {
    const result = askIntentSchema.safeParse({ ...VALID_INTENT, question_type: 'unknown_type' });
    expect(result.success).toBe(false);
  });

  it('target_repositories에 허용되지 않은 값이 있으면 실패한다', () => {
    const result = askIntentSchema.safeParse({ ...VALID_INTENT, target_repositories: ['database'] });
    expect(result.success).toBe(false);
  });

  it('필수 필드가 누락되면 실패한다', () => {
    const { feature_name: _feature_name, ...withoutFeatureName } = VALID_INTENT;
    const result = askIntentSchema.safeParse(withoutFeatureName);
    expect(result.success).toBe(false);
  });
});
