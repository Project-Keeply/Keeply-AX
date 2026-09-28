import type { EvidenceBundle, ImplementationStatus, JudgmentConfidence } from '@keeply-ax/shared';

const DEPLOYMENT_SCOPE = '실제 배포 여부';
const RUNTIME_RESULT_SCOPE = '실행 결과';
const CLIENT_SCOPE = '화면(클라이언트) 구현';
const SERVER_SCOPE = '서버 로직';
const REQUEST_FLOW_SCOPE = '요청 처리 흐름 연결';

const SERVER_REPOSITORY_NAME = 'Keeply-Server';
const CLIENT_REPOSITORY_NAME = 'Keeply-client';

interface GetUnverifiedScopesParams {
  bundle: EvidenceBundle;
  status: ImplementationStatus;
  confidence: JudgmentConfidence;
}

/**
 * 이번 탐색으로 확인하지 못한 범위를 계산한다.
 * 배포 시스템·실행 환경은 연동하지 않았으므로 배포 여부(항상 첫 번째)와 실행 결과는 항상 포함한다.
 */
export const getUnverifiedScopes = ({ bundle, status, confidence }: GetUnverifiedScopesParams): string[] => {
  const searchedNames = bundle.searchedRepositories.map(({ name }) => name);

  return [
    DEPLOYMENT_SCOPE,
    RUNTIME_RESULT_SCOPE,
    searchedNames.includes(CLIENT_REPOSITORY_NAME) ? null : CLIENT_SCOPE,
    searchedNames.includes(SERVER_REPOSITORY_NAME) ? null : SERVER_SCOPE,
    status === 'merged' && confidence === 'low' ? REQUEST_FLOW_SCOPE : null,
  ].filter((scope): scope is string => scope !== null);
};
