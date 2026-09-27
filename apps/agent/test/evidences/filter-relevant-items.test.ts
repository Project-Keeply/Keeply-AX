import { describe, expect, it } from 'vitest';
import { filterRelevantIssues, filterRelevantPullRequests } from '../../src/evidences/filter-relevant-items';
import type { RawIssueItem, RawPullRequestItem } from '../../src/evidences/get-repository-items';

const createIssue = (overrides: Partial<RawIssueItem> = {}): RawIssueItem => ({
  number: 1,
  title: '제목',
  body: null,
  state: 'open',
  html_url: 'https://github.com/Project-Keeply/Keeply-Server/issues/1',
  labels: [],
  ...overrides,
});

const createPullRequest = (overrides: Partial<RawPullRequestItem> = {}): RawPullRequestItem => ({
  number: 1,
  title: '제목',
  body: null,
  state: 'open',
  merged: false,
  mergedAt: null,
  baseBranch: 'develop',
  headBranch: 'feat/x',
  html_url: 'https://github.com/Project-Keeply/Keeply-Server/pull/1',
  labels: [],
  ...overrides,
});

describe('filterRelevantIssues', () => {
  it('제목에 키워드가 있으면 점수가 높다', () => {
    const issues = [
      createIssue({ number: 1, title: '공지사항 CRUD 구현' }),
      createIssue({ number: 2, title: '유통기한 물품 삭제' }),
    ];
    const result = filterRelevantIssues(issues, ['공지사항']);
    expect(result).toHaveLength(1);
    expect(result[0]?.number).toBe(1);
  });

  it('라벨 매칭도 점수에 반영하고, 선정된 항목 사이 순위에는 본문 매칭도 반영한다', () => {
    const issues = [
      createIssue({ number: 1, title: '관련 없는 제목', labels: ['공지사항'] }),
      createIssue({ number: 2, title: '관련 없는 제목', labels: ['공지사항'], body: '공지사항 관련 내용' }),
    ];
    const result = filterRelevantIssues(issues, ['공지사항']);
    expect(result.map((issue) => issue.number)).toEqual([2, 1]);
  });

  it('점수가 0인 항목은 제외한다', () => {
    const issues = [createIssue({ title: '무관한 이슈' })];
    expect(filterRelevantIssues(issues, ['공지사항'])).toHaveLength(0);
  });

  it('본문에만 키워드가 있고 제목·라벨에는 없는 이슈는 제외한다', () => {
    const issues = [createIssue({ number: 1, title: '무관한 제목', body: '공지사항과 관련된 내용입니다' })];
    expect(filterRelevantIssues(issues, ['공지사항'])).toHaveLength(0);
  });

  it('상위 5개까지만 반환하고 점수 내림차순으로 정렬한다', () => {
    const issues = Array.from({ length: 8 }, (_, index) =>
      createIssue({ number: index + 1, title: `공지사항 ${'공지사항'.repeat(index)}` }),
    );
    const result = filterRelevantIssues(issues, ['공지사항']);
    expect(result).toHaveLength(5);
    expect(result[0]?.number).toBe(8);
    for (let i = 1; i < result.length; i += 1) {
      expect(result[i - 1]!.score).toBeGreaterThanOrEqual(result[i]!.score);
    }
  });
});

describe('filterRelevantPullRequests', () => {
  it('브랜치명 키워드 매칭을 점수에 반영한다', () => {
    const pullRequests = [
      createPullRequest({ number: 1, title: '무관한 제목', headBranch: 'feat/notice-crud' }),
      createPullRequest({ number: 2, title: '무관한 제목', headBranch: 'feat/other' }),
    ];
    const result = filterRelevantPullRequests(pullRequests, ['notice']);
    expect(result.map((pr) => pr.number)).toEqual([1]);
  });

  it('점수 0은 제외하고 상위 5개만 반환한다', () => {
    const pullRequests = Array.from({ length: 7 }, (_, index) =>
      createPullRequest({ number: index + 1, title: `공지사항 기능 ${index}` }),
    );
    pullRequests.push(createPullRequest({ number: 100, title: '무관' }));
    const result = filterRelevantPullRequests(pullRequests, ['공지사항']);
    expect(result).toHaveLength(5);
    expect(result.every((pr) => pr.number !== 100)).toBe(true);
  });
});
