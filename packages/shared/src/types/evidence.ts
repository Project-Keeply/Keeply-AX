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
  labels: string[];
}

export interface PullRequestEvidence extends BaseEvidence {
  kind: 'pull_request';
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  baseBranch: string;
  headBranch: string;
  mergedAt: string | null;
}

export interface CodeEvidence extends BaseEvidence {
  kind: 'code';
  path: string;
  startLine: number;
  endLine: number;
  /** 코드를 확인한 브랜치 (기본 브랜치 또는 PR head 브랜치) */
  branch: string;
  commitSha: string;
  /** 매칭 주변으로 추출한 코드 조각 (최대 40줄) */
  snippet: string;
  /** 키워드 매칭 품질을 반영한 관련도 점수 */
  score: number;
  /** 기본 브랜치에 있는 이 파일을 열린 PR도 수정 중인지 여부 (코드 자체는 항상 기본 브랜치 체크아웃에서 읽는다) */
  isChangedInOpenPr: boolean;
  /** 첫 구간(startLine-endLine) 외에 스니펫에 추가로 포함된 떨어진 코드 구간 수 */
  extraSegmentCount: number;
  /** 추정한 호출 흐름 체인 (예: ['NoticeController', 'NoticeService', 'NoticeRepository']). 연결을 찾지 못하면 빈 배열 */
  flow: string[];
}

export interface CommitEvidence extends BaseEvidence {
  kind: 'commit';
  sha: string;
  message: string;
}

export type Evidence = IssueEvidence | PullRequestEvidence | CodeEvidence | CommitEvidence;

/** 근거 수집 시 실제로 조회한 저장소·브랜치·커밋 */
export interface CheckedRef {
  repository: RepositoryRef;
  branch: string;
  commitSha: string;
}

/** 하나의 질문에 대해 수집한 근거 묶음 */
export interface EvidenceBundle {
  evidences: Evidence[];
  checkedAt: string;
  checkedRefs: CheckedRef[];
  searchedRepositories: RepositoryRef[];
}
