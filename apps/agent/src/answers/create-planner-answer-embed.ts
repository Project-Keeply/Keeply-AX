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

// 상태별 embed 색상 (반영: 초록, 진행 중: 주황, 계획: 파랑, 확인 불가: 회색)
const STATUS_COLOR: Record<ImplementationStatus, number> = {
  merged: 0x2ea043,
  in_progress: 0xd29922,
  planned: 0x388bfd,
  unverified: 0x6e7681,
  deployed: 0x2ea043,
};

const CONFIDENCE_LABEL: Record<ImplementationJudgment['confidence'], string> = {
  high: '높음',
  low: '낮음',
};

const truncateText = (text: string, maxLength: number): string =>
  text.length <= maxLength ? text : `${text.slice(0, maxLength - TRUNCATION_MARK.length)}${TRUNCATION_MARK}`;

// 링크 이름에 대괄호가 들어가면 마크다운 링크가 깨지므로 제거한다.
const convertToLinkLabel = (label: string): string => label.replace(/[[\]]/g, '');

const createEvidenceLinks = (evidenceIds: string[], catalogById: Map<string, EvidenceCatalogEntry>, maxCount: number): string =>
  evidenceIds
    .map((id) => catalogById.get(id))
    .filter((entry): entry is EvidenceCatalogEntry => entry !== undefined)
    .slice(0, maxCount)
    .map(({ evidence }) => `[${convertToLinkLabel(createEvidenceLabel(evidence))}](${evidence.url})`)
    .join(', ');

const createSubFeatureField = (subFeature: PlannerSubFeature, catalogById: Map<string, EvidenceCatalogEntry>): APIEmbedField => {
  const links = createEvidenceLinks(subFeature.evidence_ids, catalogById, MAX_LINKS_PER_SUB_FEATURE);
  // 링크 줄이 잘리면 마크다운이 깨지므로 설명만 줄이고 근거 줄은 온전히 남긴다.
  const evidenceLine = links ? `\n근거: ${links}` : '\n근거: 확인한 근거 없음';
  const descriptionMaxLength = Math.max(EMBED_FIELD_VALUE_MAX_LENGTH - evidenceLine.length, 0);

  return {
    name: truncateText(`${subFeature.name} · ${IMPLEMENTATION_STATUS_LABELS[subFeature.status]}`, EMBED_FIELD_NAME_MAX_LENGTH),
    value: truncateText(`${truncateText(subFeature.description, descriptionMaxLength)}${evidenceLine}`, EMBED_FIELD_VALUE_MAX_LENGTH),
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
const trimEmbedToLimit = (embed: APIEmbed, subFeatureFieldCount: number): APIEmbed => {
  const fields = embed.fields ?? [];
  if (getEmbedLength(embed) <= EMBED_TOTAL_MAX_LENGTH || subFeatureFieldCount === 0) {
    return embed;
  }
  const trimmedFields = [...fields.slice(0, subFeatureFieldCount - 1), ...fields.slice(subFeatureFieldCount)];
  return trimEmbedToLimit({ ...embed, fields: trimmedFields }, subFeatureFieldCount - 1);
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
      ? [{ name: '확인한 근거', value: createEvidenceLinks(catalog.map(({ id }) => id), catalogById, MAX_SUMMARY_LINKS) }]
      : [];
  const noteField: APIEmbedField[] =
    answer.notes.length > 0
      ? [{ name: '참고', value: truncateText(answer.notes.map((note) => `- ${note}`).join('\n'), EMBED_FIELD_VALUE_MAX_LENGTH) }]
      : [];
  const unverifiedField: APIEmbedField = {
    name: '확인하지 못한 범위',
    value: truncateText(judgment.unverifiedScopes.join(', '), EMBED_FIELD_VALUE_MAX_LENGTH),
  };

  const description = [
    answer.summary,
    '',
    `확신 ${CONFIDENCE_LABEL[judgment.confidence]} · 진행 중 작업: ${createOpenWorkText(judgment)}`,
  ].join('\n');

  const embed: APIEmbed = {
    title: truncateText(`${intent.feature_name} — ${IMPLEMENTATION_STATUS_LABELS[judgment.status]}`, EMBED_TITLE_MAX_LENGTH),
    description: truncateText(description, EMBED_DESCRIPTION_MAX_LENGTH),
    color: STATUS_COLOR[judgment.status],
    fields: [...subFeatureFields, ...fallbackEvidenceField, ...noteField, unverifiedField],
    footer: { text: truncateText(`조회: ${createCheckedRefsText(bundle)} (KST)`, EMBED_FOOTER_MAX_LENGTH) },
  };

  return trimEmbedToLimit(embed, subFeatureFields.length);
};
