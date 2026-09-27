import type { AskPayload } from '../types/dispatch';

const AES_KEY_BYTE_LENGTH = 32;
const GCM_IV_BYTE_LENGTH = 12;
const ASK_PAYLOAD_FIELDS = ['question', 'interaction_token', 'channel_id', 'user_id'] as const;

const convertBase64ToBytes = (base64: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const convertBytesToBase64 = (bytes: Uint8Array<ArrayBuffer>): string => {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const importAesGcmKey = async (key: string): Promise<CryptoKey> => {
  let keyBytes: Uint8Array<ArrayBuffer>;
  try {
    keyBytes = convertBase64ToBytes(key);
  } catch {
    throw new Error('AX_PAYLOAD_KEY가 올바른 base64 문자열이 아닙니다.');
  }
  if (keyBytes.byteLength !== AES_KEY_BYTE_LENGTH) {
    throw new Error(`AX_PAYLOAD_KEY는 ${AES_KEY_BYTE_LENGTH}바이트(base64 인코딩)여야 합니다.`);
  }
  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
};

const checkIsAskPayload = (value: unknown): value is AskPayload => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return ASK_PAYLOAD_FIELDS.every((field) => typeof record[field] === 'string' && record[field].length > 0);
};

export const createEncryptedPayload = async (payload: AskPayload, key: string): Promise<string> => {
  const cryptoKey = await importAesGcmKey(key);
  const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_BYTE_LENGTH));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, plaintext));
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.byteLength);
  return convertBytesToBase64(combined);
};

export const getDecryptedPayload = async (encrypted: string, key: string): Promise<AskPayload> => {
  const cryptoKey = await importAesGcmKey(key);
  let combined: Uint8Array<ArrayBuffer>;
  try {
    combined = convertBase64ToBytes(encrypted);
  } catch {
    throw new Error('암호화된 payload가 올바른 base64 문자열이 아닙니다.');
  }
  if (combined.byteLength <= GCM_IV_BYTE_LENGTH) {
    throw new Error('암호화된 payload 형식이 올바르지 않습니다.');
  }
  const iv = combined.slice(0, GCM_IV_BYTE_LENGTH);
  const ciphertext = combined.slice(GCM_IV_BYTE_LENGTH);
  let plaintextBytes: ArrayBuffer;
  try {
    plaintextBytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ciphertext);
  } catch {
    throw new Error('payload 복호화에 실패했습니다. 키가 올바르지 않거나 데이터가 변조되었습니다.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(plaintextBytes));
  } catch {
    throw new Error('복호화된 payload가 올바른 JSON이 아닙니다.');
  }
  if (!checkIsAskPayload(parsed)) {
    throw new Error('복호화된 payload에 필수 필드가 없습니다.');
  }
  return parsed;
};
