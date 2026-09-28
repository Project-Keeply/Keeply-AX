import type { ImplementationJudgment } from '@keeply-ax/shared';
import { describe, expect, it } from 'vitest';
import { createJudgmentSummary } from '../src/answers/create-judgment-summary';

const createJudgment = (overrides: Partial<ImplementationJudgment> = {}): ImplementationJudgment => ({
  status: 'merged',
  confidence: 'high',
  hasOpenWork: false,
  reasons: [
    { code: 'connected_flow_on_default_branch', count: 3, evidenceUrls: [] },
    { code: 'merged_pull_request', count: 4, evidenceUrls: [] },
  ],
  unverifiedScopes: ['실제 배포 여부', '실행 결과'],
  ...overrides,
});

describe('createJudgmentSummary', () => {
  it('판정·근거·진행 중 작업·확인하지 못한 범위를 정해진 포맷으로 만든다', () => {
    expect(createJudgmentSummary(createJudgment())).toBe(
      `📊 판정: 기본 브랜치 반영 · 확신 높음
• 근거: 연결된 호출 흐름 3건, 병합된 PR 4건
• 진행 중 작업: 없음
• 확인하지 못한 범위: 실제 배포 여부, 실행 결과`,
    );
  });

  it('열린 PR이 있으면 건수를 표시한다', () => {
    const summary = createJudgmentSummary(
      createJudgment({
        hasOpenWork: true,
        reasons: [
          { code: 'connected_flow_on_default_branch', count: 1, evidenceUrls: [] },
          { code: 'open_pull_request', count: 2, evidenceUrls: [] },
        ],
      }),
    );
    expect(summary).toContain('• 진행 중 작업: 열린 PR 2건');
  });

  it('열린 PR 근거 없이 작업 중 코드 변경만 있으면 코드 변경 중으로 표시한다', () => {
    const summary = createJudgmentSummary(
      createJudgment({
        status: 'in_progress',
        hasOpenWork: true,
        reasons: [{ code: 'open_pull_request_code_change', count: 1, evidenceUrls: [] }],
      }),
    );
    expect(summary).toContain('📊 판정: 작업 진행 중 · 확신 높음');
    expect(summary).toContain('• 진행 중 작업: 열린 PR에서 코드 변경 중');
  });

  it('근거가 없으면 건수 없이 근거 없음으로 표시한다', () => {
    const summary = createJudgmentSummary(
      createJudgment({ status: 'unverified', reasons: [{ code: 'no_evidence', count: 0, evidenceUrls: [] }] }),
    );
    expect(summary).toContain('📊 판정: 구현 여부 확인 불가 · 확신 높음');
    expect(summary).toContain('• 근거: 근거 없음');
  });
});
