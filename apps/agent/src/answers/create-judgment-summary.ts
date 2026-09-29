import { IMPLEMENTATION_STATUS_LABELS } from '@keeply-ax/shared';
import type { ImplementationJudgment, JudgmentConfidence, JudgmentReasonCode } from '@keeply-ax/shared';

const CONFIDENCE_LABEL: Record<JudgmentConfidence, string> = {
  high: '높음',
  low: '낮음',
};

const REASON_LABEL: Record<JudgmentReasonCode, string> = {
  connected_flow_on_default_branch: '연결된 호출 흐름',
  code_without_flow_on_default_branch: '흐름 미확인 코드',
  merged_pull_request: '병합된 PR',
  open_pull_request: '열린 PR',
  open_pull_request_code_change: '열린 PR에서 수정 중인 코드',
  open_issue_only: '열린 이슈',
  closed_pull_request_only: '병합되지 않고 닫힌 PR',
  closed_issue_only: '닫힌 이슈',
  no_evidence: '근거 없음',
};

const createReasonText = ({ reasons }: ImplementationJudgment): string =>
  reasons.map(({ code, count }) => (code === 'no_evidence' ? REASON_LABEL[code] : `${REASON_LABEL[code]} ${count}건`)).join(', ');

const createOpenWorkText = ({ hasOpenWork, reasons }: ImplementationJudgment): string => {
  if (!hasOpenWork) {
    return '없음';
  }
  const openPullRequestCount = reasons.find(({ code }) => code === 'open_pull_request')?.count ?? 0;
  return openPullRequestCount > 0 ? `열린 PR ${openPullRequestCount}건` : '열린 PR에서 코드 변경 중';
};

/** 구현 상태 판정 결과를 Discord 메시지 상단 요약으로 만든다. */
export const createJudgmentSummary = (judgment: ImplementationJudgment): string =>
  [
    `판정: ${IMPLEMENTATION_STATUS_LABELS[judgment.status]} · 확신 ${CONFIDENCE_LABEL[judgment.confidence]}`,
    `• 근거: ${createReasonText(judgment)}`,
    `• 진행 중 작업: ${createOpenWorkText(judgment)}`,
    `• 확인하지 못한 범위: ${judgment.unverifiedScopes.join(', ')}`,
  ].join('\n');
