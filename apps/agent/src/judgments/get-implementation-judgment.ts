import type {
  CodeEvidence,
  Evidence,
  EvidenceBundle,
  ImplementationJudgment,
  ImplementationStatus,
  IssueEvidence,
  JudgmentConfidence,
  JudgmentReason,
  JudgmentReasonCode,
  PullRequestEvidence,
} from '@keeply-ax/shared';
import { getCodeRole } from './check-code-role';
import { getUnverifiedScopes } from './get-unverified-scopes';

const MAX_REASON_URL_COUNT = 3;

// 판정을 결정하지 않은 근거도 함께 보여줄 때의 표시 순서
const REASON_DISPLAY_ORDER: JudgmentReasonCode[] = [
  'connected_flow_on_default_branch',
  'code_without_flow_on_default_branch',
  'merged_pull_request',
  'open_pull_request_code_change',
  'open_pull_request',
  'open_issue_only',
  'closed_pull_request_only',
  'closed_issue_only',
  'no_evidence',
];

interface ClassifiedEvidences {
  flowCodes: CodeEvidence[];
  supportingCodes: CodeEvidence[];
  openPullRequestCodes: CodeEvidence[];
  mergedPullRequests: PullRequestEvidence[];
  openPullRequests: PullRequestEvidence[];
  closedPullRequests: PullRequestEvidence[];
  openIssues: IssueEvidence[];
  closedIssues: IssueEvidence[];
}

interface Decision {
  status: ImplementationStatus;
  confidence: JudgmentConfidence;
  decidingReason: JudgmentReasonCode;
}

const getClassifiedEvidences = (evidences: Evidence[]): ClassifiedEvidences => {
  const codes = evidences.filter((evidence): evidence is CodeEvidence => evidence.kind === 'code');
  const pullRequests = evidences.filter((evidence): evidence is PullRequestEvidence => evidence.kind === 'pull_request');
  const issues = evidences.filter((evidence): evidence is IssueEvidence => evidence.kind === 'issue');
  // 열린 PR에서만 변경 중인 코드는 아직 기본 브랜치에 반영된 구현으로 보지 않는다.
  const defaultBranchCodes = codes.filter(({ isChangedInOpenPr }) => !isChangedInOpenPr);

  return {
    flowCodes: defaultBranchCodes.filter((code) => getCodeRole(code) === 'flow'),
    supportingCodes: defaultBranchCodes.filter((code) => getCodeRole(code) === 'supporting'),
    openPullRequestCodes: codes.filter(({ isChangedInOpenPr }) => isChangedInOpenPr),
    mergedPullRequests: pullRequests.filter(({ state }) => state === 'merged'),
    openPullRequests: pullRequests.filter(({ state }) => state === 'open'),
    // 병합 없이 닫힌 PR: 코드가 반영되지 않았으므로 구현 근거는 아니지만, 작업을 시도했던 흔적이다.
    closedPullRequests: pullRequests.filter(({ state }) => state === 'closed'),
    openIssues: issues.filter(({ state }) => state === 'open'),
    closedIssues: issues.filter(({ state }) => state === 'closed'),
  };
};

/**
 * 규칙은 위에서부터 먼저 맞는 것을 적용한다.
 * "함수가 있다"만으로는 구현 완료가 아니므로, 호출 흐름이 연결된 코드가 있을 때만 확신을 높게 준다.
 * 배포 시스템 연동 전까지 'deployed'는 판정하지 않는다.
 */
const getDecision = (classified: ClassifiedEvidences): Decision => {
  const {
    flowCodes,
    supportingCodes,
    openPullRequestCodes,
    mergedPullRequests,
    openPullRequests,
    closedPullRequests,
    openIssues,
    closedIssues,
  } = classified;

  if (flowCodes.length > 0) {
    return { status: 'merged', confidence: 'high', decidingReason: 'connected_flow_on_default_branch' };
  }
  if (supportingCodes.length > 0) {
    return { status: 'merged', confidence: 'low', decidingReason: 'code_without_flow_on_default_branch' };
  }
  if (mergedPullRequests.length > 0) {
    return { status: 'merged', confidence: 'low', decidingReason: 'merged_pull_request' };
  }
  if (openPullRequestCodes.length > 0) {
    return { status: 'in_progress', confidence: 'high', decidingReason: 'open_pull_request_code_change' };
  }
  if (openPullRequests.length > 0) {
    return { status: 'in_progress', confidence: 'low', decidingReason: 'open_pull_request' };
  }
  if (openIssues.length > 0) {
    return { status: 'planned', confidence: 'high', decidingReason: 'open_issue_only' };
  }
  if (closedPullRequests.length > 0) {
    // 병합 없이 닫힌 PR만 있으면 작업을 시도했지만 반영되지 않은 상태라, 계획 단계로 보되 확신은 낮다.
    return { status: 'planned', confidence: 'low', decidingReason: 'closed_pull_request_only' };
  }
  if (closedIssues.length > 0) {
    // 코드·PR 없이 닫힌 이슈만 있으면 계획이 취소됐거나 다른 이름으로 구현됐을 수 있어 확신이 낮다.
    return { status: 'planned', confidence: 'low', decidingReason: 'closed_issue_only' };
  }
  return { status: 'unverified', confidence: 'high', decidingReason: 'no_evidence' };
};

const createReason = (code: JudgmentReasonCode, evidences: Evidence[]): JudgmentReason => ({
  code,
  count: evidences.length,
  evidenceUrls: evidences.slice(0, MAX_REASON_URL_COUNT).map(({ url }) => url),
});

const getReasons = (classified: ClassifiedEvidences, decidingReason: JudgmentReasonCode): JudgmentReason[] => {
  const {
    flowCodes,
    supportingCodes,
    openPullRequestCodes,
    mergedPullRequests,
    openPullRequests,
    closedPullRequests,
    openIssues,
    closedIssues,
  } = classified;
  const hasCodeOrPullRequest =
    flowCodes.length + supportingCodes.length + openPullRequestCodes.length + mergedPullRequests.length + openPullRequests.length > 0;

  const evidencesByReason: Record<JudgmentReasonCode, Evidence[]> = {
    connected_flow_on_default_branch: flowCodes,
    code_without_flow_on_default_branch: supportingCodes,
    merged_pull_request: mergedPullRequests,
    open_pull_request_code_change: openPullRequestCodes,
    open_pull_request: openPullRequests,
    // 이슈는 코드·PR이 하나도 없을 때만 "이슈만 있음" 근거가 된다.
    open_issue_only: hasCodeOrPullRequest ? [] : openIssues,
    // 닫힌 PR·닫힌 이슈는 판정에 더 강한 근거(코드·열린/병합된 PR·열린 이슈)가 없을 때만 근거로 보여준다.
    closed_pull_request_only: hasCodeOrPullRequest || openIssues.length > 0 ? [] : closedPullRequests,
    closed_issue_only: hasCodeOrPullRequest || openIssues.length > 0 ? [] : closedIssues,
    no_evidence: [],
  };

  const decidingEntry = createReason(decidingReason, evidencesByReason[decidingReason]);
  const otherEntries = REASON_DISPLAY_ORDER.filter((code) => code !== decidingReason && evidencesByReason[code].length > 0).map(
    (code) => createReason(code, evidencesByReason[code]),
  );

  return [decidingEntry, ...otherEntries];
};

/** 수집한 근거 묶음으로 기능의 구현 상태를 규칙 기반으로 판정한다 (LLM 미사용). */
export const getImplementationJudgment = (bundle: EvidenceBundle): ImplementationJudgment => {
  const classified = getClassifiedEvidences(bundle.evidences);
  const { status, confidence, decidingReason } = getDecision(classified);

  return {
    status,
    confidence,
    hasOpenWork: classified.openPullRequests.length > 0 || classified.openPullRequestCodes.length > 0,
    reasons: getReasons(classified, decidingReason),
    unverifiedScopes: getUnverifiedScopes({ bundle, status, confidence }),
  };
};
