import { describe, expect, it } from 'vitest';
import type { CodeEvidence, RepositoryRef } from '@keeply-ax/shared';
import { trimCodeEvidencesToBudget } from '../../src/evidences/get-evidence-bundle';

const REPOSITORY: RepositoryRef = { owner: 'Project-Keeply', name: 'Keeply-Server' };

const createCodeEvidence = (overrides: Partial<CodeEvidence> = {}): CodeEvidence => ({
  kind: 'code',
  repository: REPOSITORY,
  url: 'https://github.com/Project-Keeply/Keeply-Server/blob/abc/Notice.java#L1-L1',
  path: 'Notice.java',
  startLine: 1,
  endLine: 1,
  branch: 'develop',
  commitSha: 'abc',
  snippet: 'line',
  score: 1,
  isChangedInOpenPr: false,
  extraSegmentCount: 0,
  flow: [],
  ...overrides,
});

describe('trimCodeEvidencesToBudget', () => {
  it('최대 개수를 넘으면 점수가 낮은 항목부터 제거한다', () => {
    const evidences = Array.from({ length: 15 }, (_, index) => createCodeEvidence({ path: `File${index}.java`, score: index }));
    const result = trimCodeEvidencesToBudget(evidences, 12, 100_000);
    expect(result).toHaveLength(12);
    expect(result.every((evidence) => evidence.score >= 3)).toBe(true);
  });

  it('총 글자수가 제한을 넘으면 낮은 점수부터 잘라낸다', () => {
    const evidences = [
      createCodeEvidence({ path: 'A.java', score: 3, snippet: 'x'.repeat(20_000) }),
      createCodeEvidence({ path: 'B.java', score: 2, snippet: 'y'.repeat(20_000) }),
      createCodeEvidence({ path: 'C.java', score: 1, snippet: 'z'.repeat(20_000) }),
    ];
    const result = trimCodeEvidencesToBudget(evidences, 12, 30_000);
    expect(result.map((evidence) => evidence.path)).toEqual(['A.java']);
  });

  it('예산 안에 들어오면 모두 유지한다', () => {
    const evidences = [createCodeEvidence({ path: 'A.java' }), createCodeEvidence({ path: 'B.java' })];
    expect(trimCodeEvidencesToBudget(evidences)).toHaveLength(2);
  });
});
