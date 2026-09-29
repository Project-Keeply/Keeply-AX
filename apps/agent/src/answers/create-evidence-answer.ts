import type {
  CodeEvidence,
  EvidenceBundle,
  ImplementationJudgment,
  IssueEvidence,
  PullRequestEvidence,
  RepositoryRef,
} from '@keeply-ax/shared';
import type { AskIntent } from '../intents/ask-intent-schema';
import { createJudgmentSummary } from './create-judgment-summary';
import { truncateAnswer } from './truncate-answer';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const SHORT_SHA_LENGTH = 7;

const ISSUE_STATE_LABEL: Record<IssueEvidence['state'], string> = {
  open: '열림',
  closed: '닫힘',
};

const PULL_REQUEST_STATE_LABEL: Record<PullRequestEvidence['state'], string> = {
  open: '열림',
  closed: '닫힘',
  merged: '병합됨',
};

// 저장소 이름에 "server"가 포함되면 Server, 그 외에는 Client로 간주한다 (target-repositories.ts의 두 저장소 기준).
const getRepositoryLabel = (repository: RepositoryRef): string =>
  repository.name.toLowerCase().includes('server') ? 'Server' : 'Client';

const getFileName = (filePath: string): string => filePath.split('/').at(-1) ?? filePath;

const formatCheckedAtKst = (checkedAtIso: string): string => {
  const kstDate = new Date(new Date(checkedAtIso).getTime() + KST_OFFSET_MS);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${kstDate.getUTCFullYear()}-${pad(kstDate.getUTCMonth() + 1)}-${pad(kstDate.getUTCDate())} ${pad(kstDate.getUTCHours())}:${pad(kstDate.getUTCMinutes())}`;
};

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

const createCheckedRefsLine = (bundle: EvidenceBundle): string => {
  const refsSummary = bundle.checkedRefs
    .map((ref) => `${getRepositoryLabel(ref.repository)} ${ref.branch}@${ref.commitSha.slice(0, SHORT_SHA_LENGTH)}`)
    .join(', ');
  return `조회: ${refsSummary} · ${formatCheckedAtKst(bundle.checkedAt)}`;
};

const NEXT_STEP_NOTE = '(다음 단계에서 기획자용 답변으로 정리할 예정이에요.)';

/**
 * 구현 상태 판정과 근거 수집 결과를 Discord 요약 메시지로 만든다 (플래너용 최종 답변은 다음 단계(#9)에서 처리).
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
        NEXT_STEP_NOTE,
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
  return truncateAnswer(sections.join('\n'), `\n${createCheckedRefsLine(bundle)}\n${NEXT_STEP_NOTE}`);
};
