import type { CodeEvidence, EvidenceBundle, IssueEvidence, PullRequestEvidence, RepositoryRef } from '@keeply-ax/shared';
import { describe, expect, it } from 'vitest';
import { createPlannerAnswerEmbed } from '../../src/answers/create-planner-answer-embed';
import type { AskIntent } from '../../src/intents/ask-intent-schema';
import { getImplementationJudgment } from '../../src/judgments/get-implementation-judgment';
import { convertToVerifiedAnswer } from '../../src/planner-answers/convert-to-verified-answer';
import { createCatalogText, createEvidenceCatalog, createEvidenceLabel } from '../../src/planner-answers/create-evidence-catalog';
import { createPlannerAnswerUserMessage } from '../../src/planner-answers/create-planner-answer-prompt';
import { plannerAnswerSchema, type PlannerAnswer } from '../../src/planner-answers/planner-answer-schema';

const SERVER_REPO: RepositoryRef = { owner: 'Project-Keeply', name: 'Keeply-Server' };
const CLIENT_REPO: RepositoryRef = { owner: 'Project-Keeply', name: 'Keeply-client' };

const ISSUE: IssueEvidence = {
  kind: 'issue',
  repository: SERVER_REPO,
  url: 'https://github.com/Project-Keeply/Keeply-Server/issues/21',
  number: 21,
  title: '[Feat] Notice 도메인 CRUD',
  state: 'closed',
  labels: [],
};

const MERGED_PR: PullRequestEvidence = {
  kind: 'pull_request',
  repository: SERVER_REPO,
  url: 'https://github.com/Project-Keeply/Keeply-Server/pull/33',
  number: 33,
  title: 'Feat: Notice 도메인 CRUD 구현',
  state: 'merged',
  baseBranch: 'develop',
  headBranch: 'feat/notice-crud',
  mergedAt: '2026-09-20T00:00:00Z',
};

const FLOW_CODE: CodeEvidence = {
  kind: 'code',
  repository: CLIENT_REPO,
  url: 'https://github.com/Project-Keeply/Keeply-client/blob/f3a0bf9/src/features/announcement-write/hooks/use-create-announcement.ts#L2-L24',
  path: 'src/features/announcement-write/hooks/use-create-announcement.ts',
  startLine: 2,
  endLine: 24,
  branch: 'develop',
  commitSha: 'f3a0bf9000000000000000',
  snippet: '2: export const useCreateAnnouncement = () => {',
  score: 20,
  isChangedInOpenPr: false,
  extraSegmentCount: 0,
  flow: ['src/pages/home/write/announcement-write-page.tsx', 'src/features/announcement-write/hooks/use-create-announcement.ts'],
};

const INTENT: AskIntent = {
  question_type: 'implementation_status',
  feature_name: '공지사항',
  sub_features: [],
  target_repositories: ['server', 'client'],
  search_keywords: ['Notice'],
  is_ambiguous: false,
  clarification_question: null,
  clarification_options: [],
};

const createBundle = (evidences = [ISSUE, MERGED_PR, FLOW_CODE]): EvidenceBundle => ({
  evidences,
  checkedAt: '2026-09-29T13:09:00.000Z',
  checkedRefs: [
    { repository: SERVER_REPO, branch: 'develop', commitSha: 'a49e573000000000000000' },
    { repository: CLIENT_REPO, branch: 'develop', commitSha: 'f3a0bf9000000000000000' },
  ],
  searchedRepositories: [SERVER_REPO, CLIENT_REPO],
});

const createAnswer = (overrides: Partial<PlannerAnswer> = {}): PlannerAnswer => ({
  summary: '공지 작성과 목록 조회 기능이 기본 브랜치에 반영되어 있어요.',
  sub_features: [
    { name: '공지 작성', status: 'merged', description: '작성 화면에서 공지를 등록하는 흐름이 연결되어 있어요.', evidence_ids: ['E3', 'E2'] },
  ],
  notes: ['실제 화면 문구는 확인하지 못했어요.'],
  ...overrides,
});

describe('createEvidenceCatalog', () => {
  it('근거 순서대로 E1, E2 … ID를 붙이고, LLM 입력 텍스트에 ID·상태·흐름·코드 조각을 담는다', () => {
    const catalog = createEvidenceCatalog(createBundle());
    expect(catalog.map(({ id }) => id)).toEqual(['E1', 'E2', 'E3']);

    const text = createCatalogText(catalog);
    expect(text).toContain('E1 [이슈] Server #21 "[Feat] Notice 도메인 CRUD" (닫힘)');
    expect(text).toContain('E2 [PR] Server #33 "Feat: Notice 도메인 CRUD 구현" (병합됨, feat/notice-crud → develop)');
    expect(text).toContain('E3 [코드] Client src/features/announcement-write/hooks/use-create-announcement.ts L2-24 (develop 브랜치) · 요청 처리 흐름 연결됨');
    expect(text).toContain('<snippet>\n2: export const useCreateAnnouncement = () => {\n</snippet>');
  });

  it('링크 이름으로 쓸 짧은 근거 표기를 만든다', () => {
    expect(createEvidenceLabel(ISSUE)).toBe('Server 이슈 #21');
    expect(createEvidenceLabel(MERGED_PR)).toBe('Server PR #33');
    expect(createEvidenceLabel(FLOW_CODE)).toBe('Client use-create-announcement.ts L2-24');
  });
});

describe('createPlannerAnswerUserMessage', () => {
  it('질문·판정·근거 목록을 태그로 구분해 담는다', () => {
    const bundle = createBundle();
    const message = createPlannerAnswerUserMessage({
      question: '공지사항 작성 기능 구현됐어?',
      intent: INTENT,
      judgment: getImplementationJudgment(bundle),
      catalog: createEvidenceCatalog(bundle),
    });
    expect(message).toContain('<question>공지사항 작성 기능 구현됐어?</question>');
    expect(message).toContain('전체 판정: 기본 브랜치 반영 (확신 높음)');
    expect(message).toContain('<evidences>\nE1 [이슈]');
  });

  it('근거가 없으면 없다고 명시한다', () => {
    const bundle = createBundle([]);
    const message = createPlannerAnswerUserMessage({
      question: '결제 기능 있어?',
      intent: INTENT,
      judgment: getImplementationJudgment(bundle),
      catalog: [],
    });
    expect(message).toContain('<evidences>\n(탐색 범위에서 찾은 근거 없음)\n</evidences>');
  });
});

describe('plannerAnswerSchema', () => {
  it('허용되지 않은 세부 기능 상태(deployed)는 거부한다', () => {
    const result = plannerAnswerSchema.safeParse({
      summary: '요약',
      sub_features: [{ name: '공지 작성', status: 'deployed', description: '설명', evidence_ids: [] }],
      notes: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('convertToVerifiedAnswer', () => {
  const catalog = createEvidenceCatalog(createBundle());

  it('존재하지 않는 근거 ID는 버리고 중복을 제거한다', () => {
    const verified = convertToVerifiedAnswer(
      createAnswer({
        sub_features: [{ name: '공지 작성', status: 'merged', description: '설명', evidence_ids: ['E3', 'E99', ' E3 ', 'E2'] }],
      }),
      catalog,
    );
    expect(verified.sub_features[0]?.evidence_ids).toEqual(['E3', 'E2']);
    expect(verified.sub_features[0]?.status).toBe('merged');
  });

  it('유효한 근거가 하나도 없는 세부 기능은 확인 불가로 강등한다', () => {
    const verified = convertToVerifiedAnswer(
      createAnswer({
        sub_features: [{ name: '공지 예약 발송', status: 'merged', description: '예약 발송이 가능해요.', evidence_ids: ['E42'] }],
      }),
      catalog,
    );
    expect(verified.sub_features[0]).toMatchObject({ status: 'unverified', evidence_ids: [] });
  });

  it('문장 안에 새어 나온 근거 ID 표기는 지우고 E2E 같은 일반 단어는 남긴다', () => {
    const verified = convertToVerifiedAnswer(
      createAnswer({
        summary: '공지 작성이 반영되어 있어요 (E2, E3).',
        sub_features: [{ name: '공지 작성', status: 'merged', description: 'E3 코드에서 등록 흐름을 확인했어요.', evidence_ids: ['E3'] }],
        notes: ['배포 환경 오류는 열린 이슈로 남아 있어요(E1).', 'E2E 테스트는 확인하지 못했어요.'],
      }),
      catalog,
    );
    expect(verified.summary).toBe('공지 작성이 반영되어 있어요.');
    expect(verified.sub_features[0]?.description).toBe('코드에서 등록 흐름을 확인했어요.');
    expect(verified.notes).toEqual(['배포 환경 오류는 열린 이슈로 남아 있어요.', 'E2E 테스트는 확인하지 못했어요.']);
  });

  it('이름이 빈 세부 기능·빈 보충 설명은 버리고 개수를 제한한다', () => {
    const manySubFeatures = Array.from({ length: 10 }, (_, index) => ({
      name: index === 0 ? '  ' : `기능 ${index}`,
      status: 'merged' as const,
      description: '설명',
      evidence_ids: ['E1'],
    }));
    const verified = convertToVerifiedAnswer(createAnswer({ sub_features: manySubFeatures, notes: ['', ' 참고 ', 'a', 'b', 'c'] }), catalog);
    expect(verified.sub_features).toHaveLength(6);
    expect(verified.sub_features[0]?.name).toBe('기능 1');
    expect(verified.notes).toEqual(['참고', 'a', 'b']);
  });
});

describe('createPlannerAnswerEmbed', () => {
  const bundle = createBundle();
  const catalog = createEvidenceCatalog(bundle);
  const judgment = getImplementationJudgment(bundle);

  it('제목은 규칙 판정 상태, 세부 기능 필드는 검증된 근거 링크로 만든다', () => {
    const embed = createPlannerAnswerEmbed({ intent: INTENT, bundle, judgment, answer: createAnswer(), catalog });

    expect(embed.title).toBe('공지사항 — 기본 브랜치 반영');
    expect(embed.color).toBe(0x2ea043);
    expect(embed.description).toBe('공지 작성과 목록 조회 기능이 기본 브랜치에 반영되어 있어요.\n\n확신 높음 · 진행 중 작업: 없음');
    expect(embed.fields?.[0]).toEqual({
      name: '공지 작성 · 기본 브랜치 반영',
      value: `작성 화면에서 공지를 등록하는 흐름이 연결되어 있어요.\n근거: [Client use-create-announcement.ts L2-24](${FLOW_CODE.url}), [Server PR #33](${MERGED_PR.url})`,
    });
    expect(embed.fields?.map(({ name }) => name)).toEqual(['공지 작성 · 기본 브랜치 반영', '참고', '확인하지 못한 범위']);
    expect(embed.footer?.text).toBe('조회: Server develop@a49e573, Client develop@f3a0bf9 · 2026-09-29 22:09 (KST)');
  });

  it('장식 이모지를 쓰지 않는다', () => {
    const embed = createPlannerAnswerEmbed({ intent: INTENT, bundle, judgment, answer: createAnswer(), catalog });
    expect(JSON.stringify(embed)).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('세부 기능이 없으면 대표 근거를 링크로 보여준다', () => {
    const embed = createPlannerAnswerEmbed({ intent: INTENT, bundle, judgment, answer: createAnswer({ sub_features: [] }), catalog });
    expect(embed.fields?.[0]?.name).toBe('확인한 근거');
    expect(embed.fields?.[0]?.value).toContain('[Server 이슈 #21]');
  });

  it('Discord 제한(필드 값 1024자, 전체 6000자)을 넘지 않고 근거 링크 줄은 온전히 남긴다', () => {
    const longSubFeatures = Array.from({ length: 6 }, (_, index) => ({
      name: `기능 ${index}`,
      status: 'merged' as const,
      description: '가'.repeat(2000),
      evidence_ids: ['E1', 'E2', 'E3'],
    }));
    const embed = createPlannerAnswerEmbed({
      intent: INTENT,
      bundle,
      judgment,
      answer: createAnswer({ summary: '나'.repeat(5000), sub_features: longSubFeatures }),
      catalog,
    });

    const fields = embed.fields ?? [];
    const totalLength =
      (embed.title?.length ?? 0) +
      (embed.description?.length ?? 0) +
      (embed.footer?.text.length ?? 0) +
      fields.reduce((total, { name, value }) => total + name.length + value.length, 0);

    expect(embed.description?.length).toBeLessThanOrEqual(4096);
    expect(fields.every(({ value }) => value.length <= 1024)).toBe(true);
    expect(totalLength).toBeLessThanOrEqual(6000);
    expect(fields[0]?.value).toContain(`[Server PR #33](${MERGED_PR.url})`);
    expect(fields.at(-1)?.name).toBe('확인하지 못한 범위');
  });
});
