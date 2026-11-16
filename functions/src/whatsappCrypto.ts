import * as crypto from 'node:crypto';

export function verifyHmacSha256Signature(
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!appSecret || !rawBody || !signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }
  const providedHex = signatureHeader.slice('sha256='.length).trim();
  const expectedHex = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const providedBuf = Buffer.from(providedHex, 'hex');
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (providedBuf.length === 0 || providedBuf.length !== expectedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

export function verifyTimingSafeSecretMatch(expected: string, candidateToken: string): boolean {
  if (!expected || !candidateToken) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(candidateToken);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
