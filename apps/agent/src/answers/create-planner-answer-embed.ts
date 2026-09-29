import { IMPLEMENTATION_STATUS_LABELS } from '@keeply-ax/shared';
import type { EvidenceBundle, ImplementationJudgment, ImplementationStatus } from '@keeply-ax/shared';
import type { APIEmbed, APIEmbedField } from 'discord-api-types/v10';
import type { AskIntent } from '../intents/ask-intent-schema';
import { createEvidenceLabel, type EvidenceCatalogEntry } from '../planner-answers/create-evidence-catalog';
import type { PlannerAnswer, PlannerSubFeature } from '../planner-answers/planner-answer-schema';
import { createCheckedRefsText } from './create-checked-refs-text';

// Discord embed 길이 제한 (https://discord.com/developers/docs/resources/message#embed-object-embed-limits)
const EMBED_TITLE_MAX_LENGTH = 256;
const EMBED_DESCRIPTION_MAX_LENGTH = 4096;
const EMBED_FIELD_NAME_MAX_LENGTH = 256;
const EMBED_FIELD_VALUE_MAX_LENGTH = 1024;
const EMBED_FOOTER_MAX_LENGTH = 2048;
const EMBED_TOTAL_MAX_LENGTH = 6000;
const TRUNCATION_MARK = '…';

const MAX_LINKS_PER_SUB_FEATURE = 4;
const MAX_SUMMARY_LINKS = 6;
// 세부 기능 필드에서 설명이 최소한 차지할 길이. 나머지를 근거 링크 줄에 쓴다.
const MIN_SUB_FEATURE_DESCRIPTION_LENGTH = 300;
const EVIDENCE_LINE_PREFIX = '\n근거: ';
const NO_EVIDENCE_LINE = '\n근거: 확인한 근거 없음';

// 상태별 embed 색상 (반영: 초록, 진행 중: 주황, 계획: 파랑, 확인 불가: 회색)
const STATUS_COLOR: Record<ImplementationStatus, number> = {
  merged: 0x2ea043,
  in_progress: 0xd29922,
  planned: 0x388bfd,
  unverified: 0x6e7681,
  // 배포 시스템 연동 전까지 판정에서 나오지 않는 상태 (Record 완전성을 위해 반영과 같은 색으로 둔다)
  deployed: 0x2ea043,
};

const CONFIDENCE_LABEL: Record<ImplementationJudgment['confidence'], string> = {
  high: '높음',
  low: '낮음',
};

const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) {
    return text;
  }
  if (maxLength <= TRUNCATION_MARK.length) {
    return text.slice(0, Math.max(maxLength, 0));
  }
  return `${text.slice(0, maxLength - TRUNCATION_MARK.length)}${TRUNCATION_MARK}`;
};

// 링크 이름: 대괄호는 링크 문법을 깨므로 지우고, 파일명의 _ * 등은 서식으로 해석되지 않게 이스케이프한다.
const convertToLinkLabel = (label: string): string => label.replace(/[[\]]/g, '').replace(/([\\*_`~|])/g, '\\$1');

// 링크 주소: 괄호·공백이 있으면 마크다운 링크가 끊기므로 인코딩한다.
const convertToLinkUrl = (url: string): string => url.replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\s/g, '%20');

/** 근거 링크를 길이 예산 안에서만 이어 붙인다. 예산을 넘는 링크는 중간에서 자르지 않고 통째로 뺀다. */
const createEvidenceLinks = (
  evidenceIds: string[],
  catalogById: Map<string, EvidenceCatalogEntry>,
  maxCount: number,
  maxLength: number,
): string =>
  evidenceIds
    .map((id) => catalogById.get(id))
    .filter((entry): entry is EvidenceCatalogEntry => entry !== undefined)
    .slice(0, maxCount)
    .map(({ evidence }) => `[${convertToLinkLabel(createEvidenceLabel(evidence))}](${convertToLinkUrl(evidence.url)})`)
    .reduce<string[]>((links, link) => {
      const nextText = [...links, link].join(', ');
      return nextText.length <= maxLength ? [...links, link] : links;
    }, [])
    .join(', ');

const createSubFeatureField = (subFeature: PlannerSubFeature, catalogById: Map<string, EvidenceCatalogEntry>): APIEmbedField => {
  const linkBudget = EMBED_FIELD_VALUE_MAX_LENGTH - MIN_SUB_FEATURE_DESCRIPTION_LENGTH - EVIDENCE_LINE_PREFIX.length;
  const links = createEvidenceLinks(subFeature.evidence_ids, catalogById, MAX_LINKS_PER_SUB_FEATURE, linkBudget);
  // 근거 줄은 길이 예산 안에서 온전한 링크로만 만들고, 남는 길이만큼만 설명을 쓴다.
  const evidenceLine = links ? `${EVIDENCE_LINE_PREFIX}${links}` : NO_EVIDENCE_LINE;

  return {
    name: truncateText(`${subFeature.name} · ${IMPLEMENTATION_STATUS_LABELS[subFeature.status]}`, EMBED_FIELD_NAME_MAX_LENGTH),
    value: `${truncateText(subFeature.description, EMBED_FIELD_VALUE_MAX_LENGTH - evidenceLine.length)}${evidenceLine}`,
  };
};

const createOpenWorkText = ({ hasOpenWork, reasons }: ImplementationJudgment): string => {
  if (!hasOpenWork) {
    return '없음';
  }
  const openPullRequestCount = reasons.find(({ code }) => code === 'open_pull_request')?.count ?? 0;
  return openPullRequestCount > 0 ? `열린 PR ${openPullRequestCount}건` : '열린 PR에서 코드 수정 중';
};

const getEmbedLength = ({ title = '', description = '', fields = [], footer }: APIEmbed): number =>
  title.length + description.length + (footer?.text.length ?? 0) + fields.reduce((total, { name, value }) => total + name.length + value.length, 0);

// 전체 6000자를 넘으면 세부 기능 필드를 뒤에서부터 줄인다 (확인하지 못한 범위·참고 필드는 유지).
const convertToEmbedWithinLimit = (embed: APIEmbed, subFeatureFieldCount: number): APIEmbed => {
  const fields = embed.fields ?? [];
  if (getEmbedLength(embed) <= EMBED_TOTAL_MAX_LENGTH || subFeatureFieldCount === 0) {
    return embed;
  }
  const trimmedFields = [...fields.slice(0, subFeatureFieldCount - 1), ...fields.slice(subFeatureFieldCount)];
  return convertToEmbedWithinLimit({ ...embed, fields: trimmedFields }, subFeatureFieldCount - 1);
};

interface CreatePlannerAnswerEmbedParams {
  intent: AskIntent;
  bundle: EvidenceBundle;
  judgment: ImplementationJudgment;
  answer: PlannerAnswer;
  catalog: EvidenceCatalogEntry[];
}

/**
 * 기획자용 답변을 Discord embed로 만든다.
 * 제목의 전체 상태는 규칙 기반 판정을 쓰고, 근거 링크는 검증된 근거 ID로만 만든다 (LLM이 URL을 쓰지 않음).
 */
export const createPlannerAnswerEmbed = ({ intent, bundle, judgment, answer, catalog }: CreatePlannerAnswerEmbedParams): APIEmbed => {
  const catalogById = new Map(catalog.map((entry) => [entry.id, entry]));
  const subFeatureFields = answer.sub_features.map((subFeature) => createSubFeatureField(subFeature, catalogById));

  // 세부 기능으로 묶지 못했으면 대표 근거라도 링크로 보여준다.
  const fallbackEvidenceField: APIEmbedField[] =
    subFeatureFields.length === 0 && catalog.length > 0
      ? [
          {
            name: '확인한 근거',
            value: createEvidenceLinks(catalog.map(({ id }) => id), catalogById, MAX_SUMMARY_LINKS, EMBED_FIELD_VALUE_MAX_LENGTH),
          },
        ]
      : [];
  const noteField: APIEmbedField[] =
    answer.notes.length > 0
      ? [{ name: '참고', value: truncateText(answer.notes.map((note) => `- ${note}`).join('\n'), EMBED_FIELD_VALUE_MAX_LENGTH) }]
      : [];
  const unverifiedField: APIEmbedField = {
    name: '확인하지 못한 범위',
    value: truncateText(judgment.unverifiedScopes.join(', '), EMBED_FIELD_VALUE_MAX_LENGTH),
  };

  // 규칙 판정 기반의 확신·진행 중 작업 줄은 항상 남기고, 요약만 남는 길이에 맞춰 줄인다.
  const judgmentLine = `\n\n확신 ${CONFIDENCE_LABEL[judgment.confidence]} · 진행 중 작업: ${createOpenWorkText(judgment)}`;
  const summaryMaxLength = EMBED_DESCRIPTION_MAX_LENGTH - judgmentLine.length;
  const createDescription = (maxSummaryLength: number): string => `${truncateText(answer.summary, maxSummaryLength)}${judgmentLine}`;

  const embed: APIEmbed = {
    title: truncateText(`${intent.feature_name} — ${IMPLEMENTATION_STATUS_LABELS[judgment.status]}`, EMBED_TITLE_MAX_LENGTH),
    description: createDescription(summaryMaxLength),
    color: STATUS_COLOR[judgment.status],
    fields: [...subFeatureFields, ...fallbackEvidenceField, ...noteField, unverifiedField],
    footer: { text: truncateText(`조회: ${createCheckedRefsText(bundle)} (KST)`, EMBED_FOOTER_MAX_LENGTH) },
  };

  const trimmedEmbed = convertToEmbedWithinLimit(embed, subFeatureFields.length);
  const overflowLength = getEmbedLength(trimmedEmbed) - EMBED_TOTAL_MAX_LENGTH;
  if (overflowLength <= 0) {
    return trimmedEmbed;
  }
  // 세부 기능 필드를 모두 빼도 넘치면(세부 기능 없이 요약·참고가 긴 경우) 남은 예산만큼 요약을 줄인다.
  const visibleSummaryLength = Math.min(answer.summary.length, summaryMaxLength);
  return { ...trimmedEmbed, description: createDescription(Math.max(visibleSummaryLength - overflowLength, 0)) };
};
