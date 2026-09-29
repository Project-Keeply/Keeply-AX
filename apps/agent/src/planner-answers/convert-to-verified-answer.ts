import type { EvidenceCatalogEntry } from './create-evidence-catalog';
import type { PlannerAnswer, PlannerSubFeature } from './planner-answer-schema';

const MAX_SUB_FEATURE_COUNT = 6;
const MAX_NOTE_COUNT = 3;
// 문장 안에 새어 나온 근거 ID 표기 (예: "(E1)", "(E3, E7)", " E21")
const INLINE_EVIDENCE_ID_PATTERN = /\s*\(\s*E\d+(?:\s*,\s*E\d+)*\s*\)|\bE\d+\b/g;

// 근거 ID는 링크로만 보여줘야 하므로 문장에 남은 ID 표기는 지운다.
const convertToCleanText = (text: string): string => text.replace(INLINE_EVIDENCE_ID_PATTERN, '').replace(/\s{2,}/g, ' ').trim();

const createUniqueValidIds = (ids: string[], validIds: Set<string>): string[] =>
  [...new Set(ids.map((id) => id.trim()))].filter((id) => validIds.has(id));

/**
 * LLM이 인용한 근거를 실제 근거 목록과 대조한다.
 * - 존재하지 않는 근거 ID는 버린다 (링크를 지어낼 수 없게).
 * - 유효한 근거가 하나도 남지 않은 세부 기능은 상태를 unverified로 강등한다.
 * - 문장 안에 새어 나온 근거 ID 표기("(E1)")는 지운다.
 * - 이름이 빈 세부 기능·빈 보충 설명은 버리고, 개수를 제한한다.
 */
export const convertToVerifiedAnswer = (answer: PlannerAnswer, catalog: EvidenceCatalogEntry[]): PlannerAnswer => {
  const validIds = new Set(catalog.map(({ id }) => id));

  const subFeatures = answer.sub_features
    .filter(({ name }) => name.trim() !== '')
    .slice(0, MAX_SUB_FEATURE_COUNT)
    .map((subFeature): PlannerSubFeature => {
      const evidenceIds = createUniqueValidIds(subFeature.evidence_ids, validIds);
      return {
        ...subFeature,
        description: convertToCleanText(subFeature.description),
        evidence_ids: evidenceIds,
        status: evidenceIds.length > 0 ? subFeature.status : 'unverified',
      };
    });

  return {
    summary: convertToCleanText(answer.summary),
    sub_features: subFeatures,
    notes: answer.notes.map(convertToCleanText).filter((note) => note !== '').slice(0, MAX_NOTE_COUNT),
  };
};
