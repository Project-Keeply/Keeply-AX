/**
 * 탐색한 근거로 판정한 기능의 구현 상태
 * - merged: 기본 브랜치에서 관련 코드 또는 병합된 PR을 확인
 * - in_progress: 열린 PR의 변경 코드 또는 진행 중 이슈를 확인
 * - planned: 관련 이슈만 있고 코드·PR 근거는 확인하지 못함
 * - unverified: 탐색 범위에서 관련 코드·PR·이슈를 찾지 못함
 * - deployed: 배포 시스템 연동으로 대상 환경 반영까지 확인
 */
export type ImplementationStatus = 'merged' | 'in_progress' | 'planned' | 'unverified' | 'deployed';

export const IMPLEMENTATION_STATUS_LABELS: Record<ImplementationStatus, string> = {
  merged: '기본 브랜치 반영',
  in_progress: '작업 진행 중',
  planned: '계획 또는 작업 대기',
  unverified: '구현 여부 확인 불가',
  deployed: '배포 확인됨',
};
