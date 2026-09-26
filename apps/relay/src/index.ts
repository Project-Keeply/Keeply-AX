import {
  type APIInteraction,
  type APIInteractionResponse,
  InteractionResponseType,
  InteractionType,
} from 'discord-api-types/v10';
import { ASK_COMMAND_NAME, EPHEMERAL_FLAG, NOT_ALLOWED_CHANNEL_MESSAGE } from './constants/interaction';
import type { Env } from './env';
import { checkAllowedContext } from './utils/check-allowed-context';
import { checkDiscordSignature } from './utils/check-discord-signature';
import { createJsonResponse } from './utils/create-json-response';

const getInteractionResponse = (interaction: APIInteraction, env: Env): APIInteractionResponse | null => {
  if (interaction.type === InteractionType.Ping) {
    return { type: InteractionResponseType.Pong };
  }
  if (interaction.type === InteractionType.ApplicationCommand && interaction.data.name === ASK_COMMAND_NAME) {
    const isAllowed = checkAllowedContext({
      guildId: interaction.guild_id,
      channelId: interaction.channel?.id,
      env,
    });
    if (isAllowed) {
      return { type: InteractionResponseType.DeferredChannelMessageWithSource };
    }
    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: { content: NOT_ALLOWED_CHANNEL_MESSAGE, flags: EPHEMERAL_FLAG },
    };
  }
  return null;
};

const handleFetch = async (request: Request, env: Env): Promise<Response> => {
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
  try {
    const interaction = JSON.parse(body) as APIInteraction;
    const response = getInteractionResponse(interaction, env);
    return response ? createJsonResponse(response) : createJsonResponse({ error: 'Unsupported interaction' }, 400);
  } catch {
    return createJsonResponse({ error: 'Bad Request' }, 400);
  }
};

export default { fetch: handleFetch } satisfies ExportedHandler<Env>;
