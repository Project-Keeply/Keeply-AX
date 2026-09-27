import type { RepositoryRef } from '@keeply-ax/shared';
import { fetchAllPages } from './get-repository-items';

const MAX_PATCH_EXCERPT_LENGTH = 400;

export interface PullRequestFile {
  filename: string;
  patchExcerpt: string;
}

interface GithubPullRequestFileApiItem {
  filename: string;
  patch?: string;
}

const getPatchExcerpt = (patch: string | undefined): string => {
  if (!patch) {
    return '';
  }
  return patch.length > MAX_PATCH_EXCERPT_LENGTH ? `${patch.slice(0, MAX_PATCH_EXCERPT_LENGTH)}…` : patch;
};

/**
 * 열린 PR에서 실제로 변경 중인 파일 목록을 가져온다.
 * `isChangedInOpenPr` 판정과 작업 중 코드 근거 표시에 사용한다.
 * 변경 파일이 100개를 넘는 PR도 누락되지 않도록 모든 페이지를 조회한다.
 */
export const getPullRequestFiles = async (
  repository: RepositoryRef,
  pullNumber: number,
  token: string,
): Promise<PullRequestFile[]> => {
  const url = `https://api.github.com/repos/${repository.owner}/${repository.name}/pulls/${pullNumber}/files`;
  const files = await fetchAllPages<GithubPullRequestFileApiItem>(url, token);
  return files.map(({ filename, patch }) => ({ filename, patchExcerpt: getPatchExcerpt(patch) }));
};
