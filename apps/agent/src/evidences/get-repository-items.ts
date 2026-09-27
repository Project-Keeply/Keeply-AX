import type { RepositoryRef } from '@keeply-ax/shared';

const GITHUB_API_VERSION = '2022-11-28';
const USER_AGENT = 'keeply-ax-agent';
const PER_PAGE = 100;
const REQUEST_TIMEOUT_MS = 15_000;

export interface RawIssueItem {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  html_url: string;
  labels: string[];
}

export interface RawPullRequestItem {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  merged: boolean;
  mergedAt: string | null;
  baseBranch: string;
  headBranch: string;
  html_url: string;
  labels: string[];
}

export interface RepositoryItems {
  issues: RawIssueItem[];
  pullRequests: RawPullRequestItem[];
}

interface GithubIssueApiItem {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  html_url: string;
  labels: Array<{ name: string } | string>;
  pull_request?: unknown;
}

interface GithubPullApiItem {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  merged_at: string | null;
  html_url: string;
  labels: Array<{ name: string } | string>;
  base: { ref: string };
  head: { ref: string };
}

const getLabelNames = (labels: Array<{ name: string } | string>): string[] =>
  labels.map((label) => (typeof label === 'string' ? label : label.name));

const createGithubHeaders = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': GITHUB_API_VERSION,
  'User-Agent': USER_AGENT,
});

const fetchGithubJson = async <T>(url: string, token: string): Promise<T> => {
  const response = await fetch(url, {
    headers: createGithubHeaders(token),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`GitHub API 호출 실패 (status ${response.status}): ${url}`);
  }
  return (await response.json()) as T;
};

export const fetchAllPages = async <T>(baseUrl: string, token: string): Promise<T[]> => {
  const results: T[] = [];
  let page = 1;
  // GitHub REST 목록 API는 다음 페이지가 비어있을 때까지 순회한다 (Link 헤더 파싱 대신 단순 종료 조건 사용).
  for (;;) {
    const separator = baseUrl.includes('?') ? '&' : '?';
    const pageItems = await fetchGithubJson<T[]>(`${baseUrl}${separator}per_page=${PER_PAGE}&page=${page}`, token);
    results.push(...pageItems);
    if (pageItems.length < PER_PAGE) {
      break;
    }
    page += 1;
  }
  return results;
};

/**
 * `/issues` 엔드포인트는 PR도 함께 반환하므로 `pull_request` 필드 유무로 순수 이슈만 걸러낸다.
 * PR의 병합 상태·브랜치 정보는 `/pulls` 엔드포인트에서 별도로 가져온다.
 */
export const getRepositoryItems = async (repository: RepositoryRef, token: string): Promise<RepositoryItems> => {
  const baseUrl = `https://api.github.com/repos/${repository.owner}/${repository.name}`;

  const [issueApiItems, pullApiItems] = await Promise.all([
    fetchAllPages<GithubIssueApiItem>(`${baseUrl}/issues?state=all`, token),
    fetchAllPages<GithubPullApiItem>(`${baseUrl}/pulls?state=all`, token),
  ]);

  const issues: RawIssueItem[] = issueApiItems
    .filter((item) => item.pull_request === undefined)
    .map((item) => ({
      number: item.number,
      title: item.title,
      body: item.body,
      state: item.state,
      html_url: item.html_url,
      labels: getLabelNames(item.labels),
    }));

  const pullRequests: RawPullRequestItem[] = pullApiItems.map((item) => ({
    number: item.number,
    title: item.title,
    body: item.body,
    state: item.state,
    merged: item.merged_at !== null,
    mergedAt: item.merged_at,
    baseBranch: item.base.ref,
    headBranch: item.head.ref,
    html_url: item.html_url,
    labels: getLabelNames(item.labels),
  }));

  return { issues, pullRequests };
};
