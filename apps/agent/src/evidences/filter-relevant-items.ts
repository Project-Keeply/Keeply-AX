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

export interface ScoredIssue extends RawIssueItem {
  score: number;
}

export interface ScoredPullRequest extends RawPullRequestItem {
  score: number;
}

export const filterRelevantIssues = (issues: RawIssueItem[], keywords: string[]): ScoredIssue[] => {
  const scored = issues.map((issue) => ({
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
  const scored = pullRequests.map((pullRequest) => ({
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
