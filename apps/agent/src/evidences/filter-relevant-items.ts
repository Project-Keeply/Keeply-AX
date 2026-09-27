import type { RawIssueItem, RawPullRequestItem } from './get-repository-items';

const TOP_ITEM_COUNT = 5;

const WEIGHT_TITLE = 3;
const WEIGHT_BRANCH = 2;
const WEIGHT_LABEL = 1.5;
const WEIGHT_BODY = 0.5;

const countKeywordHits = (text: string, keyword: string): number => {
  if (!keyword.trim()) {
    return 0;
  }
  return text.toLowerCase().split(keyword.toLowerCase()).length - 1;
};

const getScore = (fields: Array<{ text: string | null | undefined; weight: number }>, keywords: string[]): number =>
  fields.reduce((fieldScore, { text, weight }) => {
    if (!text) {
      return fieldScore;
    }
    const hits = keywords.reduce((total, keyword) => total + countKeywordHits(text, keyword), 0);
    return fieldScore + hits * weight;
  }, 0);

const sortByScoreDescending = <T extends { score: number }>(items: T[]): T[] =>
  [...items].sort((a, b) => b.score - a.score);

const hasKeywordHit = (text: string | null | undefined, keywords: string[]): boolean =>
  keywords.some((keyword) => countKeywordHits(text ?? '', keyword) > 0);

export interface ScoredIssue extends RawIssueItem {
  score: number;
}

export interface ScoredPullRequest extends RawPullRequestItem {
  score: number;
}

/**
 * 본문(body)만 매칭되는 이슈/PR은 근거에서 제외한다.
 * 사례: 어떤 PR의 본문이 "공지 API와 동일하게…"처럼 다른 기능을 설명하며 키워드를 언급하면,
 * 본문 매칭만으로는 관련 없는 항목이 선정되기 쉽다 (재현율보다 정밀도 우선).
 * 제목·라벨(이슈), 제목·브랜치·라벨(PR)은 작성자가 그 항목을 직접 가리키는 신호라 신뢰도가 높고,
 * PR의 경우 제목이 바뀌어도 head 브랜치명이 원래 의도한 작업을 보존하는 경우가 많다.
 * 선정된 항목들 사이의 순위는 본문 매칭도 포함해 매긴다.
 */
export const filterRelevantIssues = (issues: RawIssueItem[], keywords: string[]): ScoredIssue[] => {
  const scored = issues
    .filter((issue) => hasKeywordHit(issue.title, keywords) || issue.labels.some((label) => hasKeywordHit(label, keywords)))
    .map((issue) => ({
      ...issue,
      score: getScore(
        [
          { text: issue.title, weight: WEIGHT_TITLE },
          { text: issue.labels.join(' '), weight: WEIGHT_LABEL },
          { text: issue.body, weight: WEIGHT_BODY },
        ],
        keywords,
      ),
    }));

  return sortByScoreDescending(scored)
    .filter((issue) => issue.score > 0)
    .slice(0, TOP_ITEM_COUNT);
};

export const filterRelevantPullRequests = (pullRequests: RawPullRequestItem[], keywords: string[]): ScoredPullRequest[] => {
  const scored = pullRequests
    .filter(
      (pullRequest) =>
        hasKeywordHit(pullRequest.title, keywords) ||
        hasKeywordHit(pullRequest.headBranch, keywords) ||
        pullRequest.labels.some((label) => hasKeywordHit(label, keywords)),
    )
    .map((pullRequest) => ({
      ...pullRequest,
      score: getScore(
        [
          { text: pullRequest.title, weight: WEIGHT_TITLE },
          { text: pullRequest.headBranch, weight: WEIGHT_BRANCH },
          { text: pullRequest.labels.join(' '), weight: WEIGHT_LABEL },
          { text: pullRequest.body, weight: WEIGHT_BODY },
        ],
        keywords,
      ),
    }));

  return sortByScoreDescending(scored)
    .filter((pullRequest) => pullRequest.score > 0)
    .slice(0, TOP_ITEM_COUNT);
};
