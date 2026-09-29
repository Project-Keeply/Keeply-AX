import type { CodeEvidence, EvidenceBundle, ImplementationJudgment, IssueEvidence, PullRequestEvidence } from '@keeply-ax/shared';
import type { AskIntent } from '../intents/ask-intent-schema';
import { createCheckedRefsText, getRepositoryLabel } from './create-checked-refs-text';
import { createJudgmentSummary } from './create-judgment-summary';
import { truncateAnswer } from './truncate-answer';

const ISSUE_STATE_LABEL: Record<IssueEvidence['state'], string> = {
  open: '열림',
  closed: '닫힘',
};

const PULL_REQUEST_STATE_LABEL: Record<PullRequestEvidence['state'], string> = {
  open: '열림',
  closed: '닫힘',
  merged: '병합됨',
};

const getFileName = (filePath: string): string => filePath.split('/').at(-1) ?? filePath;

const createIssueLine = (issue: IssueEvidence): string =>
  `• [${getRepositoryLabel(issue.repository)}] #${issue.number} ${issue.title} · ${ISSUE_STATE_LABEL[issue.state]}`;

const createPullRequestLine = (pullRequest: PullRequestEvidence): string =>
  `• [${getRepositoryLabel(pullRequest.repository)}] #${pullRequest.number} ${pullRequest.title} · ${PULL_REQUEST_STATE_LABEL[pullRequest.state]}`;

const createCodeSuffix = (code: CodeEvidence): string | null => {
  if (code.flow.length > 0) {
    return `흐름: ${code.flow.join(' → ')}`;
  }
  if (code.isChangedInOpenPr) {
    return '작업 중 PR에서 변경';
  }
  return null;
};

const createCodeLine = (code: CodeEvidence): string => {
  const suffix = createCodeSuffix(code);
  const rangeText = `L${code.startLine}-${code.endLine}`;
  const location = `${getFileName(code.path)} ${code.extraSegmentCount > 0 ? `${rangeText} 외 ${code.extraSegmentCount}곳` : rangeText}`;
  return `• [${getRepositoryLabel(code.repository)}] ${location}${suffix ? ` · ${suffix}` : ''}`;
};

const createCheckedRefsLine = (bundle: EvidenceBundle): string => `조회: ${createCheckedRefsText(bundle)}`;

// 이 텍스트 답변은 기획자용 답변(embed)을 만들지 못했을 때의 대체 답변으로 쓴다.
const FALLBACK_NOTE = '(기획자용 답변을 만들지 못해 수집한 근거를 그대로 보여드려요.)';

/**
 * 구현 상태 판정과 근거 수집 결과를 Discord 텍스트 메시지로 만든다. 기획자용 답변(LLM #2)이 실패했을 때 대체 답변으로 쓴다.
 * LLM 없이 규칙 기반으로 조립하며, 2000자 제한은 truncateAnswer로 방어한다.
 */
export const createEvidenceAnswer = (intent: AskIntent, bundle: EvidenceBundle, judgment: ImplementationJudgment): string => {
  const issues = bundle.evidences.filter((evidence): evidence is IssueEvidence => evidence.kind === 'issue');
  const pullRequests = bundle.evidences.filter((evidence): evidence is PullRequestEvidence => evidence.kind === 'pull_request');
  const codeEvidences = bundle.evidences.filter((evidence): evidence is CodeEvidence => evidence.kind === 'code');
  const judgmentSummary = createJudgmentSummary(judgment);

  if (issues.length === 0 && pullRequests.length === 0 && codeEvidences.length === 0) {
    return truncateAnswer(
      [
        judgmentSummary,
        `"${intent.feature_name}" 관련 근거를 탐색 범위에서 찾지 못했어요`,
        createCheckedRefsLine(bundle),
        FALLBACK_NOTE,
      ].join('\n'),
    );
  }

  // 판정 요약은 답변의 핵심이라 본문 맨 앞에 둬서 근거 목록이 잘려도 남게 한다.
  const sections: string[] = [judgmentSummary, `"${intent.feature_name}" 관련 근거를 찾았어요`];

  if (issues.length > 0) {
    sections.push(`이슈 (${issues.length})`, ...issues.map(createIssueLine));
  }
  if (pullRequests.length > 0) {
    sections.push(`PR (${pullRequests.length})`, ...pullRequests.map(createPullRequestLine));
  }
  if (codeEvidences.length > 0) {
    sections.push(`코드 (${codeEvidences.length})`, ...codeEvidences.map(createCodeLine));
  }

  // 조회 기준(브랜치·커밋·시각)은 답변 신뢰성의 필수 정보라, 근거 목록이 길어도 잘리지 않게 보존한다.
  return truncateAnswer(sections.join('\n'), `\n${createCheckedRefsLine(bundle)}\n${FALLBACK_NOTE}`);
};
