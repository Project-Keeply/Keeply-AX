import type { RepositoryRef } from '@keeply-ax/shared';

export type RepositoryKey = 'server' | 'client';

export interface TargetRepositoryConfig {
  key: RepositoryKey;
  repository: RepositoryRef;
  /** 로컬 체크아웃 디렉터리 이름 (AX_REPOS_DIR 기준 상대 경로, 또는 개별 절대 경로 override) */
  checkoutDirName: string;
}

const DEFAULT_REPOS_DIR = 'repos';

// 로컬 검증 스크립트(collect-evidence.ts)에서 저장소별 체크아웃 경로를 개별 override할 수 있도록
// AX_SERVER_DIR / AX_CLIENT_DIR 환경 변수를 우선 확인한다.
const getReposBaseDir = (): string => process.env['AX_REPOS_DIR'] ?? DEFAULT_REPOS_DIR;

export const getTargetRepositoryConfigs = (): TargetRepositoryConfig[] => [
  {
    key: 'server',
    repository: { owner: 'Project-Keeply', name: 'Keeply-Server' },
    checkoutDirName: process.env['AX_SERVER_DIR'] ?? `${getReposBaseDir()}/server`,
  },
  {
    key: 'client',
    repository: { owner: 'Project-Keeply', name: 'Keeply-client' },
    checkoutDirName: process.env['AX_CLIENT_DIR'] ?? `${getReposBaseDir()}/client`,
  },
];

export const getTargetRepositoryConfig = (key: RepositoryKey): TargetRepositoryConfig => {
  const config = getTargetRepositoryConfigs().find((candidate) => candidate.key === key);
  if (!config) {
    throw new Error(`알 수 없는 대상 저장소입니다: ${key}`);
  }
  return config;
};
