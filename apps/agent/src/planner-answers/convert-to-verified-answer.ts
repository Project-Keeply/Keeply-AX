import type { Evidence } from '@keeply-ax/shared';
import type { EvidenceCatalogEntry } from './create-evidence-catalog';
import type { PlannerAnswer, PlannerSubFeature } from './planner-answer-schema';

type SubFeatureStatus = PlannerSubFeature['status'];

const MAX_SUB_FEATURE_COUNT = 6;
const MAX_NOTE_COUNT = 3;

// 세부 기능 상태의 강도 순서 (높을수록 구현이 더 진행된 상태)
const STATUS_RANK: Record<SubFeatureStatus, number> = {
  unverified: 0,
  planned: 1,
  in_progress: 2,
  merged: 3,
};

// LLM 문장에 섞여 나올 수 있는 링크·Discord 토큰. 봇 명의 메시지에 피싱 링크나 멘션이 들어가지 않도록 지운다.
const MARKDOWN_LINK_PATTERN = /\[([^\]]*)\]\(([^)]*)\)/g;
const ANGLE_BRACKET_URL_PATTERN = /<https?:[^>\s]*>/gi;
const BARE_URL_PATTERN = /https?:\/\/\S+/gi;
const DISCORD_TOKEN_PATTERN = /<(?:@[!&]?|#|a?:\w+:|t:)[^>\s]*>/g;
const EMPTY_BRACKETS_PATTERN = /\s*(?:\(\s*\)|\[\s*\])/g;

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 문장 안에 새어 나온 근거 ID 표기를 지운다. 근거 목록에 실제로 있는 ID만 지워서 E11000 같은 오류 코드는 남긴다.
 * "(E1)", "(근거: E1, E2)", "[E3]" 처럼 괄호 안이 ID와 구분자뿐이면 괄호째 지운다.
 */
const createInlineIdPatterns = (validIds: Set<string>): RegExp[] => {
  if (validIds.size === 0) {
    return [];
  }
  const idAlternation = [...validIds].map(escapeRegExp).join('|');
  const idSequence = `(?:${idAlternation})(?:\\s*[,·~/]\\s*(?:${idAlternation}))*`;
  return [
    new RegExp(`\\s*[(\\[]\\s*(?:근거\\s*[:：]\\s*)?${idSequence}\\s*[)\\]]`, 'g'),
    new RegExp(`\\b${idSequence}\\b`, 'g'),
  ];
};

const convertToCleanText = (text: string, inlineIdPatterns: RegExp[]): string =>
  [...inlineIdPatterns, ANGLE_BRACKET_URL_PATTERN, BARE_URL_PATTERN, DISCORD_TOKEN_PATTERN, EMPTY_BRACKETS_PATTERN]
    .reduce((cleaned, pattern) => cleaned.replace(pattern, ''), text.replace(MARKDOWN_LINK_PATTERN, '$1'))
    .replace(/\s+([.,!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();

/** 근거 하나가 뒷받침할 수 있는 가장 높은 세부 기능 상태 */
const getSupportedStatus = (evidence: Evidence): SubFeatureStatus => {
  if (evidence.kind === 'code' || evidence.kind === 'commit') {
    // 코드 근거는 모두 기본 브랜치 체크아웃에서 읽은 것이다.
    return 'merged';
  }
  if (evidence.kind === 'pull_request') {
    if (evidence.state === 'merged') {
      return 'merged';
    }
    return evidence.state === 'open' ? 'in_progress' : 'planned';
  }
  return 'planned';
};

const getMaxSupportedStatus = (evidences: Evidence[]): SubFeatureStatus =>
  evidences.map(getSupportedStatus).reduce<SubFeatureStatus>(
    (highest, status) => (STATUS_RANK[status] > STATUS_RANK[highest] ? status : highest),
    'unverified',
  );

/** LLM이 준 상태가 인용한 근거로 뒷받침되는 수준을 넘지 않도록 낮춘다. */
const getClampedStatus = (status: SubFeatureStatus, evidences: Evidence[]): SubFeatureStatus => {
  const maxSupportedStatus = getMaxSupportedStatus(evidences);
  return STATUS_RANK[status] > STATUS_RANK[maxSupportedStatus] ? maxSupportedStatus : status;
};

/**
 * LLM이 인용한 근거를 실제 근거 목록과 대조하고, 문장을 Discord에 안전하게 보낼 수 있게 정리한다.
 * - 존재하지 않는 근거 ID는 버린다 (링크를 지어낼 수 없게).
 * - 세부 기능 상태는 인용한 근거가 뒷받침하는 수준까지만 인정한다 (근거가 없으면 unverified).
 * - 문장 안의 마크다운 링크·URL·멘션·채널 토큰과 새어 나온 근거 ID 표기는 지운다.
 * - 이름이 빈 세부 기능·빈 보충 설명은 버리고, 개수를 제한한다.
 */
export const convertToVerifiedAnswer = (answer: PlannerAnswer, catalog: EvidenceCatalogEntry[]): PlannerAnswer => {
  const evidenceById = new Map(catalog.map(({ id, evidence }) => [id, evidence]));
  const inlineIdPatterns = createInlineIdPatterns(new Set(evidenceById.keys()));
  const cleanText = (text: string): string => convertToCleanText(text, inlineIdPatterns);

  const subFeatures = answer.sub_features
    .map((subFeature) => ({ ...subFeature, name: cleanText(subFeature.name) }))
    .filter(({ name }) => name !== '')
    .slice(0, MAX_SUB_FEATURE_COUNT)
    .map((subFeature): PlannerSubFeature => {
      const evidenceIds = [...new Set(subFeature.evidence_ids.map((id) => id.trim()))].filter((id) => evidenceById.has(id));
      const citedEvidences = evidenceIds
        .map((id) => evidenceById.get(id))
        .filter((evidence): evidence is Evidence => evidence !== undefined);
      return {
        ...subFeature,
        description: cleanText(subFeature.description),
        evidence_ids: evidenceIds,
        status: getClampedStatus(subFeature.status, citedEvidences),
      };
    });

  return {
    summary: cleanText(answer.summary),
    sub_features: subFeatures,
    notes: answer.notes.map(cleanText).filter((note) => note !== '').slice(0, MAX_NOTE_COUNT),
  };
};

