import { type AskPayload, createEncryptedPayload } from '@keeply-ax/shared';
import {
  type APIChatInputApplicationCommandInteraction,
  type APIInteraction,
  type APIInteractionResponse,
  InteractionResponseType,
  InteractionType,
} from 'discord-api-types/v10';
import { ASK_COMMAND_NAME, EPHEMERAL_FLAG, NOT_ALLOWED_CHANNEL_MESSAGE } from './constants/interaction';
import type { Env } from './env';
import { checkAllowedContext } from './utils/check-allowed-context';
import { checkDiscordSignature } from './utils/check-discord-signature';
import { createFollowupError } from './utils/create-followup-error';
import { createJsonResponse } from './utils/create-json-response';
import { createWorkflowDispatch } from './utils/create-workflow-dispatch';
import { getAskQuestion } from './utils/get-ask-question';

const dispatchAskWorkflow = async (payload: AskPayload, env: Env): Promise<void> => {
  try {
    const encryptedPayload = await createEncryptedPayload(payload, env.AX_PAYLOAD_KEY);
    await createWorkflowDispatch({
      owner: env.GITHUB_OWNER,
      repo: env.GITHUB_REPO,
      workflow: env.GITHUB_WORKFLOW,
      ref: env.GITHUB_REF,
      payload: encryptedPayload,
      token: env.GITHUB_TOKEN,
    });
  } catch (error) {
    // 에러 메시지에는 status·원인만 담기므로 토큰·질문은 로그에 남지 않는다.
    console.error(`workflow dispatch 처리 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    await createFollowupError({ applicationId: env.DISCORD_APPLICATION_ID, interactionToken: payload.interaction_token });
  }
};

const getAskUserId = (interaction: APIChatInputApplicationCommandInteraction): string | null =>
  interaction.member?.user.id ?? interaction.user?.id ?? null;

interface AskInteractionResult {
  response: APIInteractionResponse | null;
  backgroundTask: Promise<void> | null;
}

const getAskInteractionResult = (interaction: APIChatInputApplicationCommandInteraction, env: Env): AskInteractionResult => {
  const isAllowed = checkAllowedContext({ guildId: interaction.guild_id, channelId: interaction.channel?.id, env });
  if (!isAllowed) {
    return {
      response: {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: { content: NOT_ALLOWED_CHANNEL_MESSAGE, flags: EPHEMERAL_FLAG },
      },
      backgroundTask: null,
    };
  }

  const question = getAskQuestion(interaction.data);
  const userId = getAskUserId(interaction);
  if (!question || !userId) {
    return { response: null, backgroundTask: null };
  }

  const payload: AskPayload = {
    question,
    interaction_token: interaction.token,
    channel_id: interaction.channel?.id ?? '',
    user_id: userId,
  };

  return {
    response: { type: InteractionResponseType.DeferredChannelMessageWithSource },
    backgroundTask: dispatchAskWorkflow(payload, env),
  };
};

const handleFetch = async (request: Request, env: Env, ctx: ExecutionContext): Promise<Response> => {
  if (request.method !== 'POST') {
    return createJsonResponse({ error: 'Method Not Allowed' }, 405);
  }
  const body = await request.text();
  const isValidSignature = await checkDiscordSignature({
    body,
    signature: request.headers.get('X-Signature-Ed25519'),
    timestamp: request.headers.get('X-Signature-Timestamp'),
    publicKey: env.DISCORD_PUBLIC_KEY,
  });
  if (!isValidSignature) {
    return createJsonResponse({ error: 'Invalid request signature' }, 401);
  }

  let interaction: APIInteraction;
  try {
    interaction = JSON.parse(body) as APIInteraction;
  } catch {
    return createJsonResponse({ error: 'Bad Request' }, 400);
  }

  if (interaction.type === InteractionType.Ping) {
    return createJsonResponse({ type: InteractionResponseType.Pong } satisfies APIInteractionResponse);
  }

  if (interaction.type === InteractionType.ApplicationCommand && interaction.data.name === ASK_COMMAND_NAME) {
    const { response, backgroundTask } = getAskInteractionResult(
      interaction as APIChatInputApplicationCommandInteraction,
      env,
    );
    if (!response) {
      return createJsonResponse({ error: 'Bad Request' }, 400);
    }
    if (backgroundTask) {
      ctx.waitUntil(backgroundTask);
    }
    return createJsonResponse(response);
  }

  return createJsonResponse({ error: 'Unsupported interaction' }, 400);
};

export default { fetch: handleFetch } satisfies ExportedHandler<Env>;
