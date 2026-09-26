const HEX_PATTERN = /^(?:[0-9a-fA-F]{2})+$/;

export const convertHexToBytes = (hex: string): Uint8Array | null => {
  if (!HEX_PATTERN.test(hex)) {
    return null;
  }
  const pairs = hex.match(/.{2}/g) ?? [];
  return Uint8Array.from(pairs.map((pair) => Number.parseInt(pair, 16)));
};

interface CheckDiscordSignatureParams {
  body: string;
  signature: string | null;
  timestamp: string | null;
  publicKey: string;
}

export const checkDiscordSignature = async ({
  body,
  signature,
  timestamp,
  publicKey,
}: CheckDiscordSignatureParams): Promise<boolean> => {
  if (!signature || !timestamp || !publicKey) {
    return false;
  }
  const signatureBytes = convertHexToBytes(signature);
  const publicKeyBytes = convertHexToBytes(publicKey);
  if (!signatureBytes || !publicKeyBytes) {
    return false;
  }
  try {
    const key = await crypto.subtle.importKey('raw', publicKeyBytes, { name: 'Ed25519' }, false, ['verify']);
    const message = new TextEncoder().encode(`${timestamp}${body}`);
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, signatureBytes, message);
  } catch {
    return false;
  }
};
