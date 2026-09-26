export interface SigningKey {
  publicKeyHex: string;
  sign: (message: string) => Promise<string>;
}

const convertBytesToHex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

export const createSigningKey = async (): Promise<SigningKey> => {
  const keyPair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const rawPublicKey = (await crypto.subtle.exportKey('raw', keyPair.publicKey)) as ArrayBuffer;
  const sign = async (message: string) =>
    convertBytesToHex(await crypto.subtle.sign({ name: 'Ed25519' }, keyPair.privateKey, new TextEncoder().encode(message)));
  return { publicKeyHex: convertBytesToHex(rawPublicKey), sign };
};
