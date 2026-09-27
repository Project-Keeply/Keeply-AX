import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { CheckedRef, CodeEvidence, Evidence, EvidenceBundle, IssueEvidence, PullRequestEvidence } from '@keeply-ax/shared';
import type { AskIntent } from '../intents/ask-intent-schema';
import { extractSnippets, scoreCodeFiles } from './filter-relevant-code';
import { filterRelevantIssues, filterRelevantPullRequests } from './filter-relevant-items';
import { getCallFlow } from './get-call-flow';
import { getCodeMatches } from './get-code-matches';
import { getPullRequestFiles } from './get-pull-request-files';
import { getRepositoryItems } from './get-repository-items';
import { getTargetRepositoryConfig, type RepositoryKey } from './target-repositories';

// 워크플로가 체크아웃한 브랜치(AX_TARGET_BRANCH)와 표시되는 브랜치가 항상 같도록 같은 값을 사용한다.
const DEFAULT_BRANCH_FALLBACK = process.env.AX_TARGET_BRANCH ?? 'develop';
const GIT_TIMEOUT_MS = 10_000;

const MAX_CODE_EVIDENCE_COUNT = 12;
const MAX_TOTAL_SNIPPET_CHARS = 30_000;

const execFileAsync = promisify(execFile);

const getHeadCommitSha = async (checkoutDir: string): Promise<string> => {
  const { stdout } = await execFileAsync('git', ['-C', checkoutDir, 'rev-parse', 'HEAD'], { timeout: GIT_TIMEOUT_MS });
  return stdout.trim();
};

const getCurrentBranch = async (checkoutDir: string): Promise<string> => {
  try {
    const { stdout } = await execFileAsync('git', ['-C', checkoutDir, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      timeout: GIT_TIMEOUT_MS,
    });
    const branch = stdout.trim();
    return branch === 'HEAD' ? DEFAULT_BRANCH_FALLBACK : branch;
  } catch {
    return DEFAULT_BRANCH_FALLBACK;
  }
};

const getCodeBlobUrl = (owner: string, name: string, sha: string, filePath: string, startLine: number, endLine: number): string =>
  `https://github.com/${owner}/${name}/blob/${sha}/${filePath}#L${startLine}-L${endLine}`;

/**
 * 근거 코드 배열을 예산(최대 개수·최대 총 글자수) 안으로 정리한다.
 * 점수가 낮은 항목부터 제거해 중요한 근거를 우선 보존한다. 순수 함수라 테스트하기 쉽다.
 */
export const trimCodeEvidencesToBudget = (
  evidences: CodeEvidence[],
  maxCount: number = MAX_CODE_EVIDENCE_COUNT,
  maxTotalChars: number = MAX_TOTAL_SNIPPET_CHARS,
): CodeEvidence[] => {
  const sortedByScoreDescending = [...evidences].sort((a, b) => b.score - a.score);
  const trimmedByCount = sortedByScoreDescending.slice(0, maxCount);

  const result: CodeEvidence[] = [];
  let totalChars = 0;
  for (const evidence of trimmedByCount) {
    if (totalChars + evidence.snippet.length > maxTotalChars) {
      break;
    }
    result.push(evidence);
    totalChars += evidence.snippet.length;
  }
  return result;
};

interface RepositoryEvidenceResult {
  evidences: Evidence[];
  checkedRef: CheckedRef;
}

const collectRepositoryEvidence = async (key: RepositoryKey, intent: AskIntent, token: string): Promise<RepositoryEvidenceResult> => {
  const config = getTargetRepositoryConfig(key);
  const { repository, checkoutDirName } = config;

  const [commitSha, branch, items] = await Promise.all([
    getHeadCommitSha(checkoutDirName),
    getCurrentBranch(checkoutDirName),
    getRepositoryItems(repository, token),
  ]);

  const relevantIssues = filterRelevantIssues(items.issues, intent.search_keywords);
  const relevantPullRequests = filterRelevantPullRequests(items.pullRequests, intent.search_keywords);
  const openPullRequests = relevantPullRequests.filter((pullRequest) => pullRequest.state === 'open');

  const openPullRequestFileLists = await Promise.all(
    openPullRequests.map((pullRequest) => getPullRequestFiles(repository, pullRequest.number, token)),
  );
  const openPullRequestChangedPaths = new Set(openPullRequestFileLists.flat().map((file) => file.filename));

  const codeMatches = await getCodeMatches(intent.search_keywords, checkoutDirName);
  const scoredFiles = scoreCodeFiles(codeMatches);
  const snippets = await extractSnippets(checkoutDirName, scoredFiles);

  const codeEvidences: CodeEvidence[] = await Promise.all(
    snippets.map(async (snippet): Promise<CodeEvidence> => {
      const flow = await getCallFlow(key, snippet.path, checkoutDirName);
      return {
        kind: 'code',
        repository,
        url: getCodeBlobUrl(repository.owner, repository.name, commitSha, snippet.path, snippet.startLine, snippet.endLine),
        path: snippet.path,
        startLine: snippet.startLine,
        endLine: snippet.endLine,
        branch,
        commitSha,
        snippet: snippet.snippet,
        score: snippet.score,
        isChangedInOpenPr: openPullRequestChangedPaths.has(snippet.path),
        extraSegmentCount: snippet.extraSegmentCount,
        flow,
      };
    }),
  );

  const issueEvidences: IssueEvidence[] = relevantIssues.map((issue) => ({
    kind: 'issue',
    repository,
    url: issue.html_url,
    number: issue.number,
    title: issue.title,
    state: issue.state,
    labels: issue.labels,
  }));

  const pullRequestEvidences: PullRequestEvidence[] = relevantPullRequests.map((pullRequest) => ({
    kind: 'pull_request',
    repository,
    url: pullRequest.html_url,
    number: pullRequest.number,
    title: pullRequest.title,
    state: pullRequest.merged ? 'merged' : pullRequest.state,
    baseBranch: pullRequest.baseBranch,
    headBranch: pullRequest.headBranch,
    mergedAt: pullRequest.mergedAt,
  }));

  return {
    evidences: [...issueEvidences, ...pullRequestEvidences, ...codeEvidences],
    checkedRef: { repository, branch, commitSha },
  };
};

/**
 * 의도(intent)에 담긴 target_repositories를 대상으로 이슈·PR·코드 근거를 수집해 하나의 EvidenceBundle로 합친다.
 * LLM 호출 없이 순수 GitHub API + 로컬 체크아웃 검색만 사용한다.
 */
export const getEvidenceBundle = async (intent: AskIntent, token: string): Promise<EvidenceBundle> => {
  const targetKeys: RepositoryKey[] = intent.target_repositories.length > 0 ? intent.target_repositories : ['server', 'client'];

  const results = await Promise.all(targetKeys.map((key) => collectRepositoryEvidence(key, intent, token)));

  const allEvidences = results.flatMap((result) => result.evidences);
  const codeEvidences = allEvidences.filter((evidence): evidence is CodeEvidence => evidence.kind === 'code');
  const nonCodeEvidences = allEvidences.filter((evidence) => evidence.kind !== 'code');
  // 예산은 저장소별이 아니라 전체 근거를 점수순으로 비교해 한 번만 적용한다.
  const budgetedCodeEvidences = trimCodeEvidencesToBudget(codeEvidences);

  return {
    evidences: [...nonCodeEvidences, ...budgetedCodeEvidences],
    checkedAt: new Date().toISOString(),
    checkedRefs: results.map((result) => result.checkedRef),
    searchedRepositories: results.map((result) => result.checkedRef.repository),
  };
};
