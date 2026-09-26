export interface RepositoryRef {
  owner: string;
  name: string;
}

interface BaseEvidence {
  repository: RepositoryRef;
  url: string;
}

export interface IssueEvidence extends BaseEvidence {
  kind: 'issue';
  number: number;
  title: string;
  state: 'open' | 'closed';
}

export interface PullRequestEvidence extends BaseEvidence {
  kind: 'pull_request';
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  baseBranch: string;
  headBranch: string;
}

export interface CodeEvidence extends BaseEvidence {
  kind: 'code';
  path: string;
  startLine: number;
  endLine: number;
  /** 코드를 확인한 브랜치 (기본 브랜치 또는 PR head 브랜치) */
  branch: string;
  commitSha: string;
}

export interface CommitEvidence extends BaseEvidence {
  kind: 'commit';
  sha: string;
  message: string;
}

export type Evidence = IssueEvidence | PullRequestEvidence | CodeEvidence | CommitEvidence;
