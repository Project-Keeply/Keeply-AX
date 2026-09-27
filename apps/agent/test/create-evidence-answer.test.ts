import type { CodeEvidence, EvidenceBundle, IssueEvidence, PullRequestEvidence } from '@keeply-ax/shared';
import { describe, expect, it } from 'vitest';
import { createEvidenceAnswer } from '../src/answers/create-evidence-answer';
import type { AskIntent } from '../src/intents/ask-intent-schema';

const SERVER_REPO = { owner: 'Project-Keeply', name: 'Keeply-Server' };
const CLIENT_REPO = { owner: 'Project-Keeply', name: 'Keeply-client' };

const createIntent = (overrides: Partial<AskIntent> = {}): AskIntent => ({
  question_type: 'implementation_status',
  feature_name: '공지사항',
  sub_features: [],
  target_repositories: ['server', 'client'],
  search_keywords: ['Notice', '공지사항'],
  is_ambiguous: false,
  clarification_question: null,
  clarification_options: [],
  ...overrides,
});

const ISSUE: IssueEvidence = {
  kind: 'issue',
  repository: SERVER_REPO,
  url: 'https://github.com/Project-Keeply/Keeply-Server/issues/12',
  number: 12,
  title: '공지사항 CRUD 구현',
  state: 'closed',
  labels: [],
};

const MERGED_PR: PullRequestEvidence = {
  kind: 'pull_request',
  repository: SERVER_REPO,
  url: 'https://github.com/Project-Keeply/Keeply-Server/pull/15',
  number: 15,
  title: 'feat: 공지사항 API',
  state: 'merged',
  baseBranch: 'develop',
  headBranch: 'feat/notice-api',
  mergedAt: '2026-09-20T00:00:00Z',
};

const OPEN_PR: PullRequestEvidence = {
  kind: 'pull_request',
  repository: CLIENT_REPO,
  url: 'https://github.com/Project-Keeply/Keeply-client/pull/40',
  number: 40,
  title: 'fix: 공지 수정',
  state: 'open',
  baseBranch: 'develop',
  headBranch: 'fix/notice-edit',
  mergedAt: null,
};

const SERVER_CODE: CodeEvidence = {
  kind: 'code',
  repository: SERVER_REPO,
  url: 'https://github.com/Project-Keeply/Keeply-Server/blob/a1b2c3d/src/.../NoticeController.java#L20-L45',
  path: 'src/main/java/com/keeply/notice/controller/NoticeController.java',
  startLine: 20,
  endLine: 45,
  branch: 'develop',
  commitSha: 'a1b2c3d0000000000000000',
  snippet: '...',
  score: 10,
  isChangedInOpenPr: false,
  flow: ['NoticeController', 'NoticeService', 'NoticeRepository'],
};

const CLIENT_CODE: CodeEvidence = {
  kind: 'code',
  repository: CLIENT_REPO,
  url: 'https://github.com/Project-Keeply/Keeply-client/blob/e4f5g6h/entities/announcement/api.ts#L5-L30',
  path: 'entities/announcement/api.ts',
  startLine: 5,
  endLine: 30,
  branch: 'develop',
  commitSha: 'e4f5g6h0000000000000000',
  snippet: '...',
  score: 4,
  isChangedInOpenPr: true,
  flow: [],
};

const createBundle = (overrides: Partial<EvidenceBundle> = {}): EvidenceBundle => ({
  evidences: [ISSUE, MERGED_PR, OPEN_PR, SERVER_CODE, CLIENT_CODE],
  checkedAt: '2026-09-27T06:20:00.000Z',
  checkedRefs: [
    { repository: SERVER_REPO, branch: 'develop', commitSha: 'a1b2c3d0000000000000000' },
    { repository: CLIENT_REPO, branch: 'develop', commitSha: 'e4f5g6h0000000000000000' },
  ],
  searchedRepositories: [SERVER_REPO, CLIENT_REPO],
  ...overrides,
});

describe('createEvidenceAnswer', () => {
  it('전체 근거를 정해진 포맷으로 요약한다', () => {
    const answer = createEvidenceAnswer(createIntent(), createBundle());
    expect(answer).toBe(
      `🔎 "공지사항" 관련 근거를 찾았어요
📌 이슈 (1)
• [Server] #12 공지사항 CRUD 구현 · 닫힘
🔀 PR (2)
• [Server] #15 feat: 공지사항 API · 병합됨
• [Client] #40 fix: 공지 수정 · 열림
💻 코드 (2)
• [Server] NoticeController.java L20-45 · 흐름: NoticeController → NoticeService → NoticeRepository
• [Client] api.ts L5-30 · 작업 중 PR에서 변경
🕐 조회: Server develop@a1b2c3d, Client develop@e4f5g6h · 2026-09-27 15:20
(다음 단계에서 구현 상태를 판정할 예정이에요.)`,
    );
  });

  it('비어있는 섹션은 생략한다', () => {
    const answer = createEvidenceAnswer(createIntent(), createBundle({ evidences: [ISSUE] }));
    expect(answer).not.toContain('🔀 PR');
    expect(answer).not.toContain('💻 코드');
    expect(answer).toContain('📌 이슈 (1)');
  });

  it('아무 근거도 못 찾으면 전용 메시지를 반환한다', () => {
    const answer = createEvidenceAnswer(createIntent(), createBundle({ evidences: [] }));
    expect(answer).toBe(
      `🔎 "공지사항" 관련 근거를 탐색 범위에서 찾지 못했어요
🕐 조회: Server develop@a1b2c3d, Client develop@e4f5g6h · 2026-09-27 15:20
(다음 단계에서 구현 상태를 판정할 예정이에요.)`,
    );
  });

  it('2000자를 넘으면 근거 목록만 잘라내고 조회 기준·안내 문구는 유지한다', () => {
    const manyIssues: IssueEvidence[] = Array.from({ length: 200 }, (_, index) => ({
      ...ISSUE,
      number: index,
      title: `아주 긴 제목입니다 ${'가'.repeat(20)}`,
    }));
    const answer = createEvidenceAnswer(createIntent(), createBundle({ evidences: manyIssues }));
    expect(answer.length).toBeLessThanOrEqual(2000);
    expect(answer).toContain('…\n🕐 조회: ');
    expect(answer.endsWith('(다음 단계에서 구현 상태를 판정할 예정이에요.)')).toBe(true);
  });
});
