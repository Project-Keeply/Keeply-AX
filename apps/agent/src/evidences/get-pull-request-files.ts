import type { RepositoryRef } from '@keeply-ax/shared';

const GITHUB_API_VERSION = '2022-11-28';
const USER_AGENT = 'keeply-ax-agent';
const PER_PAGE = 100;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_PATCH_EXCERPT_LENGTH = 400;

export interface PullRequestFile {
  filename: string;
  patchExcerpt: string;
}

interface GithubPullRequestFileApiItem {
  filename: string;
  patch?: string;
}

const createGithubHeaders = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': GITHUB_API_VERSION,
  'User-Agent': USER_AGENT,
});

const getPatchExcerpt = (patch: string | undefined): string => {
  if (!patch) {
    return '';
  }
  return patch.length > MAX_PATCH_EXCERPT_LENGTH ? `${patch.slice(0, MAX_PATCH_EXCERPT_LENGTH)}…` : patch;
};

/**
 * 열린 PR에서 실제로 변경 중인 파일 목록을 가져온다.
 * `isChangedInOpenPr` 판정과 작업 중 코드 근거 표시에 사용한다.
 */
export const getPullRequestFiles = async (
  repository: RepositoryRef,
  pullNumber: number,
  token: string,
): Promise<PullRequestFile[]> => {
  const url = `https://api.github.com/repos/${repository.owner}/${repository.name}/pulls/${pullNumber}/files?per_page=${PER_PAGE}`;
  const response = await fetch(url, {
    headers: createGithubHeaders(token),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`PR 변경 파일 조회 실패 (status ${response.status}): #${pullNumber}`);
  }
  const files = (await response.json()) as GithubPullRequestFileApiItem[];
  return files.map((file) => ({ filename: file.filename, patchExcerpt: getPatchExcerpt(file.patch) }));
};
