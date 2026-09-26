import { beforeAll, describe, expect, it } from 'vitest';
import { checkDiscordSignature, convertHexToBytes } from '../src/utils/check-discord-signature';
import { createSigningKey, type SigningKey } from './create-signing-key';

const TIMESTAMP = '1700000000';
const BODY = JSON.stringify({ type: 1 });

describe('checkDiscordSignature', () => {
  let signingKey: SigningKey;
  let otherKey: SigningKey;

  beforeAll(async () => {
    signingKey = await createSigningKey();
    otherKey = await createSigningKey();
  });

  it('유효한 서명이면 true', async () => {
    const signature = await signingKey.sign(`${TIMESTAMP}${BODY}`);
    expect(await checkDiscordSignature({ body: BODY, signature, timestamp: TIMESTAMP, publicKey: signingKey.publicKeyHex })).toBe(true);
  });

  it('본문이 변조되면 false', async () => {
    const signature = await signingKey.sign(`${TIMESTAMP}${BODY}`);
    expect(await checkDiscordSignature({ body: `${BODY} `, signature, timestamp: TIMESTAMP, publicKey: signingKey.publicKeyHex })).toBe(false);
  });

  it('다른 키로 서명하면 false', async () => {
    const signature = await otherKey.sign(`${TIMESTAMP}${BODY}`);
    expect(await checkDiscordSignature({ body: BODY, signature, timestamp: TIMESTAMP, publicKey: signingKey.publicKeyHex })).toBe(false);
  });

  it('잘못된 hex 또는 누락된 값이면 false', async () => {
    const signature = await signingKey.sign(`${TIMESTAMP}${BODY}`);
    expect(await checkDiscordSignature({ body: BODY, signature: 'zz', timestamp: TIMESTAMP, publicKey: signingKey.publicKeyHex })).toBe(false);
    expect(await checkDiscordSignature({ body: BODY, signature, timestamp: TIMESTAMP, publicKey: 'abc' })).toBe(false);
    expect(await checkDiscordSignature({ body: BODY, signature, timestamp: TIMESTAMP, publicKey: 'ab' })).toBe(false);
    expect(await checkDiscordSignature({ body: BODY, signature: null, timestamp: TIMESTAMP, publicKey: signingKey.publicKeyHex })).toBe(false);
    expect(await checkDiscordSignature({ body: BODY, signature, timestamp: null, publicKey: signingKey.publicKeyHex })).toBe(false);
  });
});

describe('convertHexToBytes', () => {
  it('hex 문자열을 바이트로 변환', () => {
    expect(convertHexToBytes('00ff10')).toEqual(Uint8Array.from([0, 255, 16]));
  });

  it('잘못된 hex면 null', () => {
    expect(convertHexToBytes('0g')).toBeNull();
    expect(convertHexToBytes('abc')).toBeNull();
    expect(convertHexToBytes('')).toBeNull();
  });
});
