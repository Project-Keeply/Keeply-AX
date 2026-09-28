import type {
  CodeEvidence,
  Evidence,
  EvidenceBundle,
  ImplementationStatus,
  IssueEvidence,
  JudgmentConfidence,
  JudgmentReasonCode,
  PullRequestEvidence,
  RepositoryRef,
} from '@keeply-ax/shared';
import { describe, expect, it } from 'vitest';
import { checkSupportingPath, getCodeRole } from '../../src/judgments/check-code-role';
import { getImplementationJudgment } from '../../src/judgments/get-implementation-judgment';

const SERVER_REPO: RepositoryRef = { owner: 'Project-Keeply', name: 'Keeply-Server' };
const CLIENT_REPO: RepositoryRef = { owner: 'Project-Keeply', name: 'Keeply-client' };

const createCode = (overrides: Partial<CodeEvidence> = {}): CodeEvidence => ({
  kind: 'code',
  repository: SERVER_REPO,
  url: 'https://github.com/Project-Keeply/Keeply-Server/blob/abc/NoticeController.java#L1-L20',
  path: 'src/main/java/com/keeply/notice/controller/NoticeController.java',
  startLine: 1,
  endLine: 20,
  branch: 'develop',
  commitSha: 'abc0000000000000000000',
  snippet: '1: ...',
  score: 10,
  isChangedInOpenPr: false,
  extraSegmentCount: 0,
  flow: ['NoticeController', 'NoticeService', 'NoticeRepository'],
  ...overrides,
});

const createPullRequest = (state: PullRequestEvidence['state'], number = 1): PullRequestEvidence => ({
  kind: 'pull_request',
  repository: SERVER_REPO,
  url: `https://github.com/Project-Keeply/Keeply-Server/pull/${number}`,
  number,
  title: 'Feat: 공지사항',
  state,
  baseBranch: 'develop',
  headBranch: 'feat/notice',
  mergedAt: state === 'merged' ? '2026-09-20T00:00:00Z' : null,
});

const createIssue = (state: IssueEvidence['state'], number = 1): IssueEvidence => ({
  kind: 'issue',
  repository: SERVER_REPO,
  url: `https://github.com/Project-Keeply/Keeply-Server/issues/${number}`,
  number,
  title: '[Feat] 공지사항',
  state,
  labels: [],
});

const createBundle = (evidences: Evidence[], searchedRepositories: RepositoryRef[] = [SERVER_REPO, CLIENT_REPO]): EvidenceBundle => ({
  evidences,
  checkedAt: '2026-09-28T13:00:00.000Z',
  checkedRefs: searchedRepositories.map((repository) => ({ repository, branch: 'develop', commitSha: 'abc0000000000000000000' })),
  searchedRepositories,
});

const FLOW_CODE = createCode();
const FLOWLESS_CODE = createCode({ path: 'src/main/java/com/keeply/notice/domain/NoticeDisplayPeriod.java', flow: [] });
const DTO_CODE_WITH_FLOW = createCode({ path: 'src/main/java/com/keeply/notice/dto/response/NoticeResponse.java' });
const GENERATED_TYPE_WITH_FLOW = createCode({ repository: CLIENT_REPO, path: 'src/shared/types/schema.d.ts' });
const OPEN_PR_CODE = createCode({ isChangedInOpenPr: true });

interface RuleCase {
  name: string;
  evidences: Evidence[];
  status: ImplementationStatus;
  confidence: JudgmentConfidence;
  decidingReason: JudgmentReasonCode;
  hasOpenWork: boolean;
}

const RULE_CASES: RuleCase[] = [
  {
    name: '흐름이 연결된 기본 브랜치 코드 → 반영 / 확신 높음',
    evidences: [FLOW_CODE],
    status: 'merged',
    confidence: 'high',
    decidingReason: 'connected_flow_on_default_branch',
    hasOpenWork: false,
  },
  {
    name: '흐름을 못 찾은 기본 브랜치 코드만 → 반영 / 확신 낮음',
    evidences: [FLOWLESS_CODE],
    status: 'merged',
    confidence: 'low',
    decidingReason: 'code_without_flow_on_default_branch',
    hasOpenWork: false,
  },
  {
    name: '흐름이 붙어 있어도 DTO·생성 타입 파일만 → 반영 / 확신 낮음',
    evidences: [DTO_CODE_WITH_FLOW, GENERATED_TYPE_WITH_FLOW],
    status: 'merged',
    confidence: 'low',
    decidingReason: 'code_without_flow_on_default_branch',
    hasOpenWork: false,
  },
  {
    name: '병합된 PR만 → 반영 / 확신 낮음',
    evidences: [createPullRequest('merged')],
    status: 'merged',
    confidence: 'low',
    decidingReason: 'merged_pull_request',
    hasOpenWork: false,
  },
  {
    name: '반영된 흐름 코드 + 열린 PR → 반영이면서 진행 중 작업 있음',
    evidences: [FLOW_CODE, createPullRequest('open', 2)],
    status: 'merged',
    confidence: 'high',
    decidingReason: 'connected_flow_on_default_branch',
    hasOpenWork: true,
  },
  {
    name: '열린 PR에서 변경 중인 코드 → 작업 진행 중 / 확신 높음',
    evidences: [OPEN_PR_CODE, createPullRequest('open')],
    status: 'in_progress',
    confidence: 'high',
    decidingReason: 'open_pull_request_code_change',
    hasOpenWork: true,
  },
  {
    name: '열린 PR만 → 작업 진행 중 / 확신 낮음',
    evidences: [createPullRequest('open')],
    status: 'in_progress',
    confidence: 'low',
    decidingReason: 'open_pull_request',
    hasOpenWork: true,
  },
  {
    name: '병합 없이 닫힌 PR은 구현 근거가 아니다 → 이슈 기준으로 판정',
    evidences: [createPullRequest('closed'), createIssue('open')],
    status: 'planned',
    confidence: 'high',
    decidingReason: 'open_issue_only',
    hasOpenWork: false,
  },
  {
    name: '열린 이슈만 → 계획 또는 작업 대기 / 확신 높음',
    evidences: [createIssue('open')],
    status: 'planned',
    confidence: 'high',
    decidingReason: 'open_issue_only',
    hasOpenWork: false,
  },
  {
    name: '닫힌 이슈만 → 계획 또는 작업 대기 / 확신 낮음',
    evidences: [createIssue('closed')],
    status: 'planned',
    confidence: 'low',
    decidingReason: 'closed_issue_only',
    hasOpenWork: false,
  },
  {
    name: '근거 없음 → 구현 여부 확인 불가',
    evidences: [],
    status: 'unverified',
    confidence: 'high',
    decidingReason: 'no_evidence',
    hasOpenWork: false,
  },
];

describe('getCodeRole', () => {
  it('흐름이 있는 일반 구현 파일만 flow로 분류한다', () => {
    expect(getCodeRole(FLOW_CODE)).toBe('flow');
    expect(getCodeRole(FLOWLESS_CODE)).toBe('supporting');
    expect(getCodeRole(DTO_CODE_WITH_FLOW)).toBe('supporting');
    expect(getCodeRole(GENERATED_TYPE_WITH_FLOW)).toBe('supporting');
  });

  it('타입·DTO·스키마 경로를 보조 코드 경로로 판별한다', () => {
    expect(checkSupportingPath('src/entities/announcement/types/announcement.ts')).toBe(true);
    expect(checkSupportingPath('src/main/resources/db/Schema.sql')).toBe(true);
    expect(checkSupportingPath('src/pages/home/home-page.tsx')).toBe(false);
  });
});

describe('getImplementationJudgment 규칙', () => {
  it.each(RULE_CASES)('$name', ({ evidences, status, confidence, decidingReason, hasOpenWork }) => {
    const judgment = getImplementationJudgment(createBundle(evidences));
    expect(judgment.status).toBe(status);
    expect(judgment.confidence).toBe(confidence);
    expect(judgment.reasons[0]?.code).toBe(decidingReason);
    expect(judgment.hasOpenWork).toBe(hasOpenWork);
  });

  it('어떤 근거 조합에서도 배포 확인됨을 판정하지 않는다', () => {
    const allEvidences = [FLOW_CODE, FLOWLESS_CODE, OPEN_PR_CODE, createPullRequest('merged'), createPullRequest('open', 2), createIssue('open')];
    expect(getImplementationJudgment(createBundle(allEvidences)).status).not.toBe('deployed');
  });
});

describe('getImplementationJudgment 근거 목록', () => {
  it('판정 근거를 맨 앞에 두고 나머지 근거도 건수와 함께 포함한다', () => {
    const judgment = getImplementationJudgment(
      createBundle([FLOW_CODE, FLOWLESS_CODE, createPullRequest('merged', 1), createPullRequest('merged', 2), createPullRequest('open', 3)]),
    );
    expect(judgment.reasons.map(({ code, count }) => [code, count])).toEqual([
      ['connected_flow_on_default_branch', 1],
      ['code_without_flow_on_default_branch', 1],
      ['merged_pull_request', 2],
      ['open_pull_request', 1],
    ]);
  });

  it('코드·PR이 있으면 이슈는 "이슈만 있음" 근거로 넣지 않는다', () => {
    const judgment = getImplementationJudgment(createBundle([FLOW_CODE, createIssue('open')]));
    expect(judgment.reasons.map(({ code }) => code)).toEqual(['connected_flow_on_default_branch']);
  });

  it('근거 링크는 최대 3개까지만 담는다', () => {
    const mergedPullRequests = [1, 2, 3, 4, 5].map((number) => createPullRequest('merged', number));
    const [reason] = getImplementationJudgment(createBundle(mergedPullRequests)).reasons;
    expect(reason?.count).toBe(5);
    expect(reason?.evidenceUrls).toHaveLength(3);
  });
});

describe('getImplementationJudgment 확인하지 못한 범위', () => {
  it('배포 여부와 실행 결과는 항상 포함하고 배포 여부가 첫 번째다', () => {
    const { unverifiedScopes } = getImplementationJudgment(createBundle([FLOW_CODE]));
    expect(unverifiedScopes).toEqual(['실제 배포 여부', '실행 결과']);
  });

  it('서버만 검색했으면 화면 구현을, 클라이언트만 검색했으면 서버 로직을 추가한다', () => {
    expect(getImplementationJudgment(createBundle([FLOW_CODE], [SERVER_REPO])).unverifiedScopes).toContain('화면(클라이언트) 구현');
    expect(getImplementationJudgment(createBundle([FLOW_CODE], [CLIENT_REPO])).unverifiedScopes).toContain('서버 로직');
  });

  it('확신이 낮은 반영 판정이면 요청 처리 흐름 연결을 추가한다', () => {
    expect(getImplementationJudgment(createBundle([FLOWLESS_CODE])).unverifiedScopes).toContain('요청 처리 흐름 연결');
    expect(getImplementationJudgment(createBundle([FLOW_CODE])).unverifiedScopes).not.toContain('요청 처리 흐름 연결');
  });
});
