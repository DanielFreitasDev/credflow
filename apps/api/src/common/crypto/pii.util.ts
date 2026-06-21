import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * Framework-free PII crypto primitives, parameterised by a 32-byte key. Shared
 * by `EncryptionService` (NestJS, request path) and `prisma/seed.ts` (plain
 * Node) so encryption and blind-indexing have a single implementation and never
 * drift. Output format mirrors `EncryptionService`: base64( iv[12] | tag[16] | ct ).
 */
const ALGORITHM = 'aes-256-gcm';

export function encryptWithKey(key: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptWithKey(key: Buffer, payload: string): string {
  const data = Buffer.from(payload, 'base64');
  const iv = data.subarray(0, 12);
  const authTag = data.subarray(12, 28);
  const ciphertext = data.subarray(28);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** Deterministic blind index for uniqueness/equality search without storing plaintext. */
export function blindIndexWithKey(key: Buffer, value: string): string {
  return createHash('sha256').update(key).update(value.toLowerCase().trim()).digest('hex');
}

/** Last 4 digits, for masked display / audit trails. */
export function last4(value: string): string {
  return value.slice(-4);
}
