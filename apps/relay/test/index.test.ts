import { InteractionResponseType, InteractionType, MessageFlags } from 'discord-api-types/v10';
import { beforeAll, describe, expect, it } from 'vitest';
import worker from '../src/index';
import type { Env } from '../src/env';
import { createSigningKey, type SigningKey } from './create-signing-key';

const URL = 'https://relay.example.com/';
const TIMESTAMP = '1700000000';
const ALLOWED_GUILD_ID = '1551189816585101323';
const ALLOWED_CHANNEL_ID = '1553428629231374346';

const createAskPayload = (channelId: string) => ({
  type: InteractionType.ApplicationCommand,
  guild_id: ALLOWED_GUILD_ID,
  channel: { id: channelId },
  channel_id: channelId,
  data: { name: 'ask', options: [{ name: 'question', type: 3, value: '로그인 구현됐나요?' }] },
});

describe('relay fetch', () => {
  let signingKey: SigningKey;
  let env: Env;

  const createSignedRequest = async (payload: unknown) => {
    const body = JSON.stringify(payload);
    const signature = await signingKey.sign(`${TIMESTAMP}${body}`);
    return new Request(URL, {
      method: 'POST',
      body,
      headers: { 'X-Signature-Ed25519': signature, 'X-Signature-Timestamp': TIMESTAMP },
    });
  };

  const getResponse = (request: Request) => worker.fetch(request, env);

  beforeAll(async () => {
    signingKey = await createSigningKey();
    env = {
      DISCORD_PUBLIC_KEY: signingKey.publicKeyHex,
      ALLOWED_GUILD_IDS: ALLOWED_GUILD_ID,
      ALLOWED_CHANNEL_IDS: ALLOWED_CHANNEL_ID,
    };
  });

  it('GET이면 405', async () => {
    expect((await getResponse(new Request(URL))).status).toBe(405);
  });

  it('서명 헤더가 없으면 401', async () => {
    const request = new Request(URL, { method: 'POST', body: JSON.stringify({ type: 1 }) });
    expect((await getResponse(request)).status).toBe(401);
  });

  it('서명이 잘못되면 401', async () => {
    const request = new Request(URL, {
      method: 'POST',
      body: JSON.stringify({ type: 1 }),
      headers: { 'X-Signature-Ed25519': '00'.repeat(64), 'X-Signature-Timestamp': TIMESTAMP },
    });
    expect((await getResponse(request)).status).toBe(401);
  });

  it('PING이면 type 1', async () => {
    const response = await getResponse(await createSignedRequest({ type: InteractionType.Ping }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ type: InteractionResponseType.Pong });
  });

  it('허용 채널의 /ask면 type 5', async () => {
    const response = await getResponse(await createSignedRequest(createAskPayload(ALLOWED_CHANNEL_ID)));
    expect(await response.json()).toEqual({ type: InteractionResponseType.DeferredChannelMessageWithSource });
  });

  it('다른 채널의 /ask면 ephemeral type 4', async () => {
    const response = await getResponse(await createSignedRequest(createAskPayload('999')));
    expect(await response.json()).toEqual({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: { content: '이 채널에서는 사용할 수 없어요.', flags: MessageFlags.Ephemeral },
    });
  });

  it('알 수 없는 type이면 400', async () => {
    const response = await getResponse(await createSignedRequest({ type: 99 }));
    expect(response.status).toBe(400);
  });
});
