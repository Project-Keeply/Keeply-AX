import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { extractSnippets, scoreCodeFiles } from '../../src/evidences/filter-relevant-code';
import { getCodeMatches } from '../../src/evidences/get-code-matches';
import { filterRelevantIssues, filterRelevantPullRequests } from '../../src/evidences/filter-relevant-items';
import type { RawIssueItem, RawPullRequestItem } from '../../src/evidences/get-repository-items';
import { createEvidenceAnswer } from '../../src/answers/create-evidence-answer';
import { getImplementationJudgment } from '../../src/judgments/get-implementation-judgment';
import type { AskIntent } from '../../src/intents/ask-intent-schema';
import type { CodeEvidence, EvidenceBundle } from '@keeply-ax/shared';

const writeFixtureFile = async (baseDir: string, relativePath: string, content: string): Promise<void> => {
  const absolutePath = path.join(baseDir, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, 'utf-8');
};

describe('Fix 1: 테스트 코드는 근거 검색 대상에서 제외한다', () => {
  let checkoutDir: string;

  beforeAll(async () => {
    checkoutDir = await mkdtemp(path.join(os.tmpdir(), 'keeply-ax-evidence-fix1-'));
    await writeFixtureFile(
      checkoutDir,
      'src/test/java/com/keeply/notice/service/NoticeServiceImplTest.java',
      ['package com.keeply.notice.service;', '', 'class NoticeServiceImplTest {', '  // NoticeService 테스트', '}'].join('\n'),
    );
    await writeFixtureFile(
      checkoutDir,
      'src/main/java/com/keeply/notice/service/NoticeServiceImpl.java',
      ['package com.keeply.notice.service;', '', 'public class NoticeServiceImpl {', '}'].join('\n'),
    );
  });

  afterAll(async () => {
    await rm(checkoutDir, { recursive: true, force: true });
  });

  it('src/test/java/...Test.java 안의 키워드는 매칭되지 않는다', async () => {
    const matches = await getCodeMatches(['NoticeService'], checkoutDir);
    expect(matches.some((match) => match.path.includes('src/test/'))).toBe(false);
    expect(matches.some((match) => match.path.endsWith('NoticeServiceImplTest.java'))).toBe(false);

    const scoredFiles = scoreCodeFiles(matches);
    expect(scoredFiles.some((file) => file.path.endsWith('NoticeServiceImplTest.java'))).toBe(false);
    expect(scoredFiles.some((file) => file.path.endsWith('NoticeServiceImpl.java'))).toBe(true);
  });
});

describe('Fix 2: 떨어진 코드 구간을 줄 번호·생략 표시로 구분한다', () => {
  let checkoutDir: string;

  beforeAll(async () => {
    checkoutDir = await mkdtemp(path.join(os.tmpdir(), 'keeply-ax-evidence-fix2-'));
    const totalLines = 220;
    const lines = Array.from({ length: totalLines }, (_, index) => {
      const lineNumber = index + 1;
      if (lineNumber === 55) {
        return '  Notice notice = noticeService.getNotice(); // match A';
      }
      if (lineNumber === 197) {
        return '  noticeService.deleteNotice(notice); // match B';
      }
      return `  // line ${lineNumber}`;
    });
    await writeFixtureFile(checkoutDir, 'DisjointFile.java', lines.join('\n'));

    const contiguousLines = Array.from({ length: 20 }, (_, index) => {
      const lineNumber = index + 1;
      if (lineNumber === 10 || lineNumber === 12) {
        return '  noticeService.getNotice(); // match';
      }
      return `  // line ${lineNumber}`;
    });
    await writeFixtureFile(checkoutDir, 'ContiguousFile.java', contiguousLines.join('\n'));

    // 매칭이 촘촘해 첫 구간 하나가 40줄 캡보다 긴 파일 (L1-55가 하나의 구간으로 병합된다)
    const denseLines = Array.from({ length: 60 }, (_, index) => {
      const lineNumber = index + 1;
      return lineNumber % 5 === 0 && lineNumber <= 50 ? '  noticeService.getNotice(); // dense match' : `  // line ${lineNumber}`;
    });
    await writeFixtureFile(checkoutDir, 'DenseFile.java', denseLines.join('\n'));
  });

  afterAll(async () => {
    await rm(checkoutDir, { recursive: true, force: true });
  });

  it('떨어진 구간은 줄 번호 접두사와 생략 마커를 포함하고, startLine/endLine은 첫 구간 기준이다', async () => {
    const matches = await getCodeMatches(['noticeService'], checkoutDir);
    const scoredFiles = scoreCodeFiles(matches);
    const disjointFile = scoredFiles.find((file) => file.path === 'DisjointFile.java');
    expect(disjointFile).toBeDefined();

    const [snippet] = await extractSnippets(checkoutDir, [disjointFile!]);
    expect(snippet).toBeDefined();

    // 매칭 A(L55) 주변 ±5줄 -> 50-60, 매칭 B(L197) 주변 ±5줄 -> 192-202. 서로 떨어져 있다.
    expect(snippet!.startLine).toBe(50);
    expect(snippet!.endLine).toBe(60);
    expect(snippet!.extraSegmentCount).toBe(1);

    expect(snippet!.snippet).toContain('50: ');
    expect(snippet!.snippet).toContain('55: ');
    expect(snippet!.snippet).toMatch(/⋯ \(L61-191 생략\)/);
    expect(snippet!.snippet).toContain('192: ');
    expect(snippet!.snippet).toContain('197: ');

    const codeLineCount = snippet!.snippet.split('\n').filter((line) => !line.startsWith('⋯')).length;
    expect(codeLineCount).toBeLessThanOrEqual(40);
  });

  it('첫 구간이 40줄 캡보다 길면 endLine은 스니펫에 실제로 포함된 마지막 줄이다', async () => {
    const matches = await getCodeMatches(['noticeService'], checkoutDir);
    const denseFile = scoreCodeFiles(matches).find((file) => file.path === 'DenseFile.java');
    expect(denseFile).toBeDefined();

    const [snippet] = await extractSnippets(checkoutDir, [denseFile!]);
    const snippetLines = snippet!.snippet.split('\n');
    const lastIncludedLineNumber = Number(snippetLines[snippetLines.length - 1]!.split(':')[0]);

    expect(snippet!.startLine).toBe(1);
    expect(snippetLines).toHaveLength(40);
    expect(snippet!.endLine).toBe(lastIncludedLineNumber);
    expect(snippet!.endLine).toBe(40);
  });

  it('연속된(붙어있는) 구간은 생략 마커가 없고 extraSegmentCount가 0이다', async () => {
    const matches = await getCodeMatches(['noticeService'], checkoutDir);
    const scoredFiles = scoreCodeFiles(matches);
    const contiguousFile = scoredFiles.find((file) => file.path === 'ContiguousFile.java');
    expect(contiguousFile).toBeDefined();

    const [snippet] = await extractSnippets(checkoutDir, [contiguousFile!]);
    expect(snippet!.extraSegmentCount).toBe(0);
    expect(snippet!.snippet).not.toMatch(/생략/);
  });
});

describe('Fix 2 (답변 포맷): 추가 구간이 있으면 "외 N곳"을 표시한다', () => {
  const SERVER_REPO = { owner: 'Project-Keeply', name: 'Keeply-Server' };

  const createIntent = (): AskIntent => ({
    question_type: 'implementation_status',
    feature_name: '공지사항',
    sub_features: [],
    target_repositories: ['server'],
    search_keywords: ['Notice'],
    is_ambiguous: false,
    clarification_question: null,
    clarification_options: [],
  });

  const createCode = (overrides: Partial<CodeEvidence>): CodeEvidence => ({
    kind: 'code',
    repository: SERVER_REPO,
    url: 'https://github.com/Project-Keeply/Keeply-Server/blob/abc/NoticeService.java#L52-L60',
    path: 'src/main/java/NoticeService.java',
    startLine: 52,
    endLine: 60,
    branch: 'develop',
    commitSha: 'abc0000000000000000000',
    snippet: '52: ...',
    score: 5,
    isChangedInOpenPr: false,
    extraSegmentCount: 0,
    flow: [],
    ...overrides,
  });

  const createBundle = (evidences: CodeEvidence[]): EvidenceBundle => ({
    evidences,
    checkedAt: '2026-09-27T06:20:00.000Z',
    checkedRefs: [{ repository: SERVER_REPO, branch: 'develop', commitSha: 'abc0000000000000000000' }],
    searchedRepositories: [SERVER_REPO],
  });

  const getAnswer = (bundle: EvidenceBundle): string =>
    createEvidenceAnswer(createIntent(), bundle, getImplementationJudgment(bundle));

  it('extraSegmentCount가 0보다 크면 "L52-60 외 1곳"으로 표시한다', () => {
    const answer = getAnswer(createBundle([createCode({ extraSegmentCount: 1 })]));
    expect(answer).toContain('NoticeService.java L52-60 외 1곳');
  });

  it('extraSegmentCount가 0이면 범위만 표시한다', () => {
    const answer = getAnswer(createBundle([createCode({ extraSegmentCount: 0 })]));
    expect(answer).toContain('NoticeService.java L52-60');
    expect(answer).not.toContain('외 ');
  });
});

describe('Fix 3: 제목·브랜치·라벨에 키워드가 없는 이슈·PR은 제외한다', () => {
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

  it('본문에만 키워드가 있는 이슈는 제외한다 (Server #50 재현 사례)', () => {
    const issues = [
      createIssue({
        number: 50,
        title: '[Fix] 폐기 상품 이미지 조회 시 S3 AccessDenied 발생',
        body: '공지 API와 동일하게 이미지 URL을 검증하도록 수정',
      }),
    ];
    expect(filterRelevantIssues(issues, ['공지사항', '공지', 'Notice'])).toHaveLength(0);
  });

  it('본문에만 키워드가 있는 PR도 제외한다', () => {
    const pullRequests = [
      createPullRequest({
        number: 50,
        title: '[Fix] 폐기 상품 이미지 조회 시 S3 AccessDenied 발생',
        headBranch: 'fix/s3-access-denied',
        body: '공지 API와 동일하게 이미지 URL을 검증하도록 수정',
      }),
    ];
    expect(filterRelevantPullRequests(pullRequests, ['공지사항', '공지', 'Notice'])).toHaveLength(0);
  });

  it('제목에 키워드가 있고 본문 힛이 많은 항목이, 제목만 매칭되고 본문 힛이 적은 항목보다 위에 온다', () => {
    const issues = [
      createIssue({ number: 1, title: '공지사항 기능 개선', body: null }),
      createIssue({
        number: 2,
        title: '공지사항 API 변경',
        body: '공지사항 공지사항 공지사항 관련 세부 내용을 다룬다',
      }),
    ];
    const result = filterRelevantIssues(issues, ['공지사항']);
    expect(result.map((issue) => issue.number)).toEqual([2, 1]);
  });

  it('브랜치명에만 키워드가 있어도 PR은 선정된다', () => {
    const pullRequests = [createPullRequest({ number: 2, title: '무관한 제목', headBranch: 'feat/notice-crud' })];
    expect(filterRelevantPullRequests(pullRequests, ['notice'])).toHaveLength(1);
  });
});
