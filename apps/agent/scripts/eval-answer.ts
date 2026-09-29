/**
 * 기획자용 답변(LLM #2)을 실제 로컬 저장소·GitHub API·Claude API로 끝까지 실행해 확인하는 로컬 전용 평가 스크립트다.
 * CI에서는 실행하지 않는다 (ANTHROPIC_API_KEY, 네트워크가 필요하고 실행마다 비용이 든다).
 *
 * 실행: pnpm --filter @keeply-ax/agent run eval:answer
 *
 * 자동으로 확인하는 항목
 * - LLM이 인용한 근거 ID가 모두 실제 근거 목록에 있는지 (없는 ID 수)
 * - 인용한 근거가 뒷받침하지 않아 상태가 낮아진 세부 기능 수 (근거 없음 → 확인 불가 포함)
 * - embed가 Discord 길이 제한 안에 있는지
 * - 답변에 장식 이모지가 없는지
 * 설명 품질(업무 언어로 잘 풀었는지, 근거와 맞는지)은 출력된 embed를 사람이 읽고 판단한다.
 *
 * AX_SERVER_DIR/AX_CLIENT_DIR이 없으면 keeply-ax와 같은 폴더에 있는 keeply-server, keeply-client 체크아웃을 사용한다.
 * GITHUB_TOKEN 환경 변수가 없으면 `gh auth token`으로 대체한다.
 */
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { APIEmbed } from 'discord-api-types/v10';
import { createPlannerAnswerEmbed } from '../src/answers/create-planner-answer-embed';
import { getEvidenceBundle } from '../src/evidences/get-evidence-bundle';
import { getAskIntent } from '../src/intents/get-ask-intent';
import { getImplementationJudgment } from '../src/judgments/get-implementation-judgment';
import { convertToVerifiedAnswer } from '../src/planner-answers/convert-to-verified-answer';
import { createEvidenceCatalog, type EvidenceCatalogEntry } from '../src/planner-answers/create-evidence-catalog';
import { getPlannerAnswer } from '../src/planner-answers/get-planner-answer';
import type { PlannerAnswer } from '../src/planner-answers/planner-answer-schema';

const execFileAsync = promisify(execFile);
const DEFAULT_MODEL = 'claude-haiku-4-5';
const LOCAL_SERVER_DIR = fileURLToPath(new URL('../../../../keeply-server', import.meta.url));
const LOCAL_CLIENT_DIR = fileURLToPath(new URL('../../../../keeply-client', import.meta.url));
const EMBED_TOTAL_MAX_LENGTH = 6000;
const PICTOGRAPHIC_PATTERN = /\p{Extended_Pictographic}/u;

const SAMPLE_QUESTIONS = [
  '공지사항 작성 기능 구현됐어?',
  '유통기한 물품 등록 어디까지 됐어?',
  '카카오 로그인 실제 서비스에 배포됐어?',
  '결제 기능 구현됐어?',
];

interface EvalResult {
  question: string;
  invalidIdCount: number;
  downgradedCount: number;
  isWithinLimit: boolean;
  isEmojiIncluded: boolean;
  inputTokens: number;
  outputTokens: number;
}

const getGithubToken = async (): Promise<string> => {
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN;
  }
  const { stdout } = await execFileAsync('gh', ['auth', 'token']);
  return stdout.trim();
};

const getEmbedLength = ({ title = '', description = '', fields = [], footer }: APIEmbed): number =>
  title.length + description.length + (footer?.text.length ?? 0) + fields.reduce((total, { name, value }) => total + name.length + value.length, 0);

// 세부 기능을 하나씩 검증해 원래 세부 기능과 짝을 맞춘다 (이름이 빈 항목이 걸러져도 순서가 어긋나지 않게).
const getDowngradedCount = (answer: PlannerAnswer, catalog: EvidenceCatalogEntry[]): number =>
  answer.sub_features.filter((subFeature) => {
    const [verifiedSubFeature] = convertToVerifiedAnswer({ summary: '', sub_features: [subFeature], notes: [] }, catalog).sub_features;
    return verifiedSubFeature !== undefined && verifiedSubFeature.status !== subFeature.status;
  }).length;

const convertEmbedToText = ({ title, description, fields = [], footer }: APIEmbed): string =>
  [`# ${title}`, description, ...fields.map(({ name, value }) => `## ${name}\n${value}`), `(${footer?.text})`].join('\n\n');

const evaluateQuestion = async (question: string, apiKey: string, githubToken: string, model: string): Promise<EvalResult | null> => {
  const { intent } = await getAskIntent({ question, apiKey, model });
  if (intent.question_type === 'out_of_scope' || intent.is_ambiguous) {
    console.log(`\n=== ${question}\n(범위 밖이거나 모호한 질문이라 답변 생성을 건너뜀)`);
    return null;
  }

  const bundle = await getEvidenceBundle(intent, githubToken);
  const judgment = getImplementationJudgment(bundle);
  const catalog = createEvidenceCatalog(bundle);
  const { answer, usage } = await getPlannerAnswer({ question, intent, judgment, catalog, apiKey, model });
  const verifiedAnswer = convertToVerifiedAnswer(answer, catalog);
  const embed = createPlannerAnswerEmbed({ intent, bundle, judgment, answer: verifiedAnswer, catalog });

  const validIds = new Set(catalog.map(({ id }) => id));
  const citedIds = answer.sub_features.flatMap(({ evidence_ids }) => evidence_ids);
  const embedText = convertEmbedToText(embed);

  console.log(`\n=== ${question}  (판정 ${judgment.status}/${judgment.confidence}, 근거 ${catalog.length}개)\n`);
  console.log(embedText);

  return {
    question,
    invalidIdCount: citedIds.filter((id) => !validIds.has(id.trim())).length,
    downgradedCount: getDowngradedCount(answer, catalog),
    isWithinLimit: getEmbedLength(embed) <= EMBED_TOTAL_MAX_LENGTH,
    isEmojiIncluded: PICTOGRAPHIC_PATTERN.test(embedText),
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  };
};

const run = async (): Promise<void> => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY 환경 변수가 없어요. eval:answer 스크립트는 실제 Claude API를 호출합니다.');
    process.exit(1);
  }
  process.env.AX_SERVER_DIR ??= LOCAL_SERVER_DIR;
  process.env.AX_CLIENT_DIR ??= LOCAL_CLIENT_DIR;
  const model = process.env.AX_ANSWER_MODEL ?? DEFAULT_MODEL;
  const githubToken = await getGithubToken();

  const results = (
    await SAMPLE_QUESTIONS.reduce<Promise<(EvalResult | null)[]>>(
      async (previous, question) => [...(await previous), await evaluateQuestion(question, apiKey, githubToken, model)],
      Promise.resolve([]),
    )
  ).filter((result): result is EvalResult => result !== null);

  console.log('\n=== 자동 확인 결과');
  results.forEach(({ question, invalidIdCount, downgradedCount, isWithinLimit, isEmojiIncluded, inputTokens, outputTokens }) => {
    console.log(
      `- ${question} | 없는 근거 ID ${invalidIdCount} | 강등 ${downgradedCount} | 길이 제한 ${isWithinLimit ? '통과' : '초과'} | 이모지 ${isEmojiIncluded ? '있음' : '없음'} | 답변 토큰 input ${inputTokens} / output ${outputTokens}`,
    );
  });
};

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : '평가 중 알 수 없는 오류가 발생했습니다.');
  process.exit(1);
});
