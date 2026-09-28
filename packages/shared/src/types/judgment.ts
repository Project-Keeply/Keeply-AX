import type { ImplementationStatus } from './status';

/** 판정의 확신도. 호출 흐름 연결까지 확인하면 high, 코드·PR 존재만 확인하면 low */
export type JudgmentConfidence = 'high' | 'low';

/**
 * 판정 근거의 종류
 * - connected_flow_on_default_branch: 기본 브랜치에서 호출 흐름이 연결된 코드를 확인
 * - code_without_flow_on_default_branch: 기본 브랜치에 코드는 있으나 호출 흐름 연결은 확인하지 못함
 * - merged_pull_request: 병합된 PR을 확인
 * - open_pull_request: 열린 PR을 확인
 * - open_pull_request_code_change: 열린 PR에서 변경 중인 코드를 확인
 * - open_issue_only / closed_issue_only: 코드·PR 없이 이슈만 확인
 * - no_evidence: 탐색 범위에서 근거를 찾지 못함
 */
export type JudgmentReasonCode =
  | 'connected_flow_on_default_branch'
  | 'code_without_flow_on_default_branch'
  | 'merged_pull_request'
  | 'open_pull_request'
  | 'open_pull_request_code_change'
  | 'open_issue_only'
  | 'closed_issue_only'
  | 'no_evidence';

export interface JudgmentReason {
  code: JudgmentReasonCode;
  count: number;
  /** 대표 근거 링크 (최대 3개) */
  evidenceUrls: string[];
}

/** 수집한 근거로 규칙 기반 판정한 기능의 구현 상태 */
export interface ImplementationJudgment {
  /** 배포 시스템 연동 전까지 'deployed'는 사용하지 않는다 */
  status: ImplementationStatus;
  confidence: JudgmentConfidence;
  /** 판정 상태와 별개로 열린 PR 등 진행 중인 작업이 있는지 여부 */
  hasOpenWork: boolean;
  /** 판정을 결정한 근거가 가장 앞에 온다 */
  reasons: JudgmentReason[];
  /** 이번 탐색에서 확인하지 못한 범위 (한국어 문구) */
  unverifiedScopes: string[];
}
