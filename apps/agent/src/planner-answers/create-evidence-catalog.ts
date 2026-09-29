import type { CodeEvidence, Evidence, EvidenceBundle, IssueEvidence, PullRequestEvidence } from '@keeply-ax/shared';
import { getRepositoryLabel } from '../answers/create-checked-refs-text';
import { getCodeRole } from '../judgments/check-code-role';

export interface EvidenceCatalogEntry {
  id: string;
  evidence: Evidence;
}

const ISSUE_STATE_LABEL: Record<IssueEvidence['state'], string> = {
  open: '열림',
  closed: '닫힘',
};

const PULL_REQUEST_STATE_LABEL: Record<PullRequestEvidence['state'], string> = {
  open: '열림',
  closed: '병합 없이 닫힘',
  merged: '병합됨',
};

const getFileName = (filePath: string): string => filePath.split('/').at(-1) ?? filePath;

/** 근거마다 E1, E2 … ID를 붙인다. LLM은 이 ID로만 근거를 인용한다. */
export const createEvidenceCatalog = (bundle: EvidenceBundle): EvidenceCatalogEntry[] =>
  bundle.evidences.map((evidence, index) => ({ id: `E${index + 1}`, evidence }));

/** Discord 링크 이름으로 쓸 짧은 근거 표기 (예: "Server PR #39", "Client home-page.tsx L1-40") */
export const createEvidenceLabel = (evidence: Evidence): string => {
  const repositoryLabel = getRepositoryLabel(evidence.repository);
  if (evidence.kind === 'issue') {
    return `${repositoryLabel} 이슈 #${evidence.number}`;
  }
  if (evidence.kind === 'pull_request') {
    return `${repositoryLabel} PR #${evidence.number}`;
  }
  if (evidence.kind === 'code') {
    return `${repositoryLabel} ${getFileName(evidence.path)} L${evidence.startLine}-${evidence.endLine}`;
  }
  return `${repositoryLabel} 커밋 ${evidence.sha.slice(0, 7)}`;
};

const createCodeCatalogText = (id: string, code: CodeEvidence): string => {
  const attributes = [
    getCodeRole(code) === 'flow' ? '요청 처리 흐름 연결됨' : '흐름 연결 미확인 또는 보조 코드(타입·DTO·스키마)',
    code.flow.length > 0 ? `흐름: ${code.flow.join(' → ')}` : null,
    code.isChangedInOpenPr ? '열린 PR이 이 파일을 수정 중' : null,
  ].filter((attribute): attribute is string => attribute !== null);

  return [
    `${id} [코드] ${getRepositoryLabel(code.repository)} ${code.path} L${code.startLine}-${code.endLine} (${code.branch} 브랜치) · ${attributes.join(' · ')}`,
    '<snippet>',
    code.snippet,
    '</snippet>',
  ].join('\n');
};

const createCatalogEntryText = ({ id, evidence }: EvidenceCatalogEntry): string => {
  const repositoryLabel = getRepositoryLabel(evidence.repository);
  if (evidence.kind === 'issue') {
    return `${id} [이슈] ${repositoryLabel} #${evidence.number} "${evidence.title}" (${ISSUE_STATE_LABEL[evidence.state]})`;
  }
  if (evidence.kind === 'pull_request') {
    return `${id} [PR] ${repositoryLabel} #${evidence.number} "${evidence.title}" (${PULL_REQUEST_STATE_LABEL[evidence.state]}, ${evidence.headBranch} → ${evidence.baseBranch})`;
  }
  if (evidence.kind === 'code') {
    return createCodeCatalogText(id, evidence);
  }
  return `${id} [커밋] ${repositoryLabel} ${evidence.sha.slice(0, 7)} "${evidence.message}"`;
};

/** LLM 입력에 넣을 근거 목록 텍스트 */
export const createCatalogText = (catalog: EvidenceCatalogEntry[]): string => catalog.map(createCatalogEntryText).join('\n\n');
