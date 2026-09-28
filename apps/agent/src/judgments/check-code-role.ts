import type { CodeEvidence } from '@keeply-ax/shared';

/**
 * 코드 근거의 역할
 * - flow: 요청 처리 흐름(Controller → Service → Repository / page → module)에 연결된 구현 코드
 * - supporting: 흐름 연결을 확인하지 못했거나, 타입·DTO·스키마처럼 구현을 보조하는 코드
 */
export type CodeRole = 'flow' | 'supporting';

// 흐름이 붙어 있어도 자동 생성 타입·DTO·스키마는 "요청이 실제로 처리된다"는 근거가 아니다.
// schema는 경로 세그먼트·파일명 단위로만 매칭한다 (OrderSchemaValidationService 같은 구현 클래스는 제외).
const SUPPORTING_PATH_PATTERNS = [/\.d\.ts$/, /\/dto\//, /\/types\//, /(^|\/)schemas?(\/|\.)/i];

export const checkSupportingPath = (filePath: string): boolean =>
  SUPPORTING_PATH_PATTERNS.some((pattern) => pattern.test(filePath));

export const getCodeRole = ({ path, flow }: CodeEvidence): CodeRole =>
  flow.length > 0 && !checkSupportingPath(path) ? 'flow' : 'supporting';
