import { describe, expect, it } from 'vitest';
import type { AskPayload } from '../src/types/dispatch';
import { createEncryptedPayload, getDecryptedPayload } from '../src/utils/payload-crypto';

const VALID_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
const OTHER_KEY = '//////////////////////////////////////////8=';
const SHORT_KEY = 'AAAA';

const SAMPLE_PAYLOAD: AskPayload = {
  question: '로그인 기능 구현됐나요?',
  interaction_token: 'token-123',
  channel_id: 'channel-1',
  user_id: 'user-1',
};

describe('payload-crypto', () => {
  it('암호화 후 복호화하면 원본과 동일하다', async () => {
    const encrypted = await createEncryptedPayload(SAMPLE_PAYLOAD, VALID_KEY);
    const decrypted = await getDecryptedPayload(encrypted, VALID_KEY);
    expect(decrypted).toEqual(SAMPLE_PAYLOAD);
  });

  it('같은 입력이어도 IV가 랜덤이라 매번 다른 암호문이 나온다', async () => {
    const first = await createEncryptedPayload(SAMPLE_PAYLOAD, VALID_KEY);
    const second = await createEncryptedPayload(SAMPLE_PAYLOAD, VALID_KEY);
    expect(first).not.toBe(second);
  });

  it('다른 키로 복호화하면 실패한다', async () => {
    const encrypted = await createEncryptedPayload(SAMPLE_PAYLOAD, VALID_KEY);
    await expect(getDecryptedPayload(encrypted, OTHER_KEY)).rejects.toThrow();
  });

  it('암호문이 변조되면 복호화에 실패한다', async () => {
    const encrypted = await createEncryptedPayload(SAMPLE_PAYLOAD, VALID_KEY);
    const tampered = `${encrypted.slice(0, -4)}${encrypted.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA'}`;
    await expect(getDecryptedPayload(tampered, VALID_KEY)).rejects.toThrow();
  });

  it('malformed base64면 복호화에 실패한다', async () => {
    await expect(getDecryptedPayload('!!!not-base64!!!', VALID_KEY)).rejects.toThrow();
  });

  it('키 길이가 32바이트가 아니면 실패한다', async () => {
    await expect(createEncryptedPayload(SAMPLE_PAYLOAD, SHORT_KEY)).rejects.toThrow();
    const encrypted = await createEncryptedPayload(SAMPLE_PAYLOAD, VALID_KEY);
    await expect(getDecryptedPayload(encrypted, SHORT_KEY)).rejects.toThrow();
  });

  it('필드가 누락된 평문을 복호화하면 검증에 실패한다', async () => {
    const incomplete = { question: 'q', interaction_token: '', channel_id: 'c', user_id: 'u' };
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      Uint8Array.from(atob(VALID_KEY), (char) => char.charCodeAt(0)),
      { name: 'AES-GCM' },
      false,
      ['encrypt'],
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, new TextEncoder().encode(JSON.stringify(incomplete))),
    );
    const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(ciphertext, iv.byteLength);
    let binary = '';
    combined.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    const encrypted = btoa(binary);
    await expect(getDecryptedPayload(encrypted, VALID_KEY)).rejects.toThrow();
  });
});
