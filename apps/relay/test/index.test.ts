import { InteractionResponseType, InteractionType, MessageFlags } from 'discord-api-types/v10';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';
import type { Env } from '../src/env';
import { createSigningKey, type SigningKey } from './create-signing-key';

const URL = 'https://relay.example.com/';
const TIMESTAMP = '1700000000';
const ALLOWED_GUILD_ID = '1551189816585101323';
const ALLOWED_CHANNEL_ID = '1553428629231374346';
const AX_PAYLOAD_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

const createAskPayload = (channelId: string, options: unknown[] = [{ name: 'question', type: 3, value: '로그인 구현됐나요?' }]) => ({
  type: InteractionType.ApplicationCommand,
  guild_id: ALLOWED_GUILD_ID,
  channel: { id: channelId },
  channel_id: channelId,
  member: { user: { id: 'user-1' } },
  token: 'interaction-token',
  data: { name: 'ask', options },
});

/**
 * 백그라운드 작업(ctx.waitUntil)이 실제 GitHub/Discord 네트워크를 호출하지 않도록,
 * 이 테스트 파일 안에서만 fetch를 가로챈다. relay가 만든 요청(URL·payload)이 예상대로인지는
 * 검증하되, 실제 외부 API로는 절대 나가지 않는다. 서명 검증·암복호화 등 비즈니스 로직 자체는
 * 그대로 실행되며, 오직 마지막 네트워크 I/O만 가짜 응답으로 대체한다.
 */
const createWaitUntilCollector = () => {
  const backgroundTasks: Promise<unknown>[] = [];
  const ctx = { waitUntil: (task: Promise<unknown>) => backgroundTasks.push(task) } as unknown as ExecutionContext;
  return { ctx, backgroundTasks };
};

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

  const getResponse = (request: Request, ctx: ExecutionContext = createWaitUntilCollector().ctx) => worker.fetch(request, env, ctx);

  beforeAll(async () => {
    signingKey = await createSigningKey();
    env = {
      DISCORD_PUBLIC_KEY: signingKey.publicKeyHex,
      ALLOWED_GUILD_IDS: ALLOWED_GUILD_ID,
      ALLOWED_CHANNEL_IDS: ALLOWED_CHANNEL_ID,
      GITHUB_OWNER: 'Project-Keeply',
      GITHUB_REPO: 'Keeply-AX',
      GITHUB_WORKFLOW: 'ask.yml',
      GITHUB_REF: 'develop',
      DISCORD_APPLICATION_ID: 'application-1',
      GITHUB_TOKEN: 'github-token',
      AX_PAYLOAD_KEY,
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it('허용 채널의 /ask면 type 5를 즉시 반환하고, 백그라운드에서 GitHub dispatch를 호출한다', async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain('api.github.com');
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal('fetch', fetchSpy);
    const { ctx, backgroundTasks } = createWaitUntilCollector();
    const response = await getResponse(await createSignedRequest(createAskPayload(ALLOWED_CHANNEL_ID)), ctx);
    expect(await response.json()).toEqual({ type: InteractionResponseType.DeferredChannelMessageWithSource });
    expect(backgroundTasks).toHaveLength(1);
    await Promise.all(backgroundTasks);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('GitHub dispatch가 실패하면 Discord followup 오류를 보낸다', async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('api.github.com')) {
        return new Response(null, { status: 500 });
      }
      expect(String(input)).toContain('discord.com/api');
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchSpy);
    const { ctx, backgroundTasks } = createWaitUntilCollector();
    await getResponse(await createSignedRequest(createAskPayload(ALLOWED_CHANNEL_ID)), ctx);
    await Promise.all(backgroundTasks);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('다른 채널의 /ask면 ephemeral type 4', async () => {
    const response = await getResponse(await createSignedRequest(createAskPayload('999')));
    expect(await response.json()).toEqual({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: { content: '이 채널에서는 사용할 수 없어요.', flags: MessageFlags.Ephemeral },
    });
  });

  it('question 옵션이 없으면 400', async () => {
    const response = await getResponse(await createSignedRequest(createAskPayload(ALLOWED_CHANNEL_ID, [])));
    expect(response.status).toBe(400);
  });

  it('알 수 없는 type이면 400', async () => {
    const response = await getResponse(await createSignedRequest({ type: 99 }));
    expect(response.status).toBe(400);
  });
});
