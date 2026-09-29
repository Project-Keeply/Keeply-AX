import type { EvidenceBundle, RepositoryRef } from '@keeply-ax/shared';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const SHORT_SHA_LENGTH = 7;

// 저장소 이름에 "server"가 포함되면 Server, 그 외에는 Client로 간주한다 (target-repositories.ts의 두 저장소 기준).
export const getRepositoryLabel = (repository: RepositoryRef): string =>
  repository.name.toLowerCase().includes('server') ? 'Server' : 'Client';

export const convertToKstText = (isoTime: string): string => {
  const kstDate = new Date(new Date(isoTime).getTime() + KST_OFFSET_MS);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${kstDate.getUTCFullYear()}-${pad(kstDate.getUTCMonth() + 1)}-${pad(kstDate.getUTCDate())} ${pad(kstDate.getUTCHours())}:${pad(kstDate.getUTCMinutes())}`;
};

/** 조회 기준 텍스트 (예: "Server develop@a49e573, Client develop@f3a0bf9 · 2026-09-29 22:09") */
export const createCheckedRefsText = (bundle: EvidenceBundle): string => {
  const refsSummary = bundle.checkedRefs
    .map((ref) => `${getRepositoryLabel(ref.repository)} ${ref.branch}@${ref.commitSha.slice(0, SHORT_SHA_LENGTH)}`)
    .join(', ');
  return `${refsSummary} · ${convertToKstText(bundle.checkedAt)}`;
};
