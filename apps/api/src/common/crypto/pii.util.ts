import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'crypto';

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

/**
 * Deterministic blind index for uniqueness/equality search without storing
 * plaintext. Uses **HMAC-SHA256** (keyed) rather than a secret-prefix
 * `SHA-256(key‖value)`: a leaked index column is not brute-forceable without the
 * key, and `key` here is the domain-separated blind-index key (see
 * `deriveBlindIndexKey`), never the raw AES key — so the two cryptographic
 * purposes don't share key material.
 */
export function blindIndexWithKey(key: Buffer, value: string): string {
  return createHmac('sha256', key).update(value.toLowerCase().trim()).digest('hex');
}

/**
 * Derives a dedicated 32-byte blind-index key from the master AES key via
 * HKDF-SHA256, providing cryptographic domain separation without requiring the
 * operator to manage a second secret. If `BLIND_INDEX_KEY` is configured
 * explicitly, that is used instead (see EncryptionService).
 */
export function deriveBlindIndexKey(masterKey: Buffer): Buffer {
  return Buffer.from(hkdfSync('sha256', masterKey, Buffer.alloc(0), 'credflow-blind-index-v1', 32));
}

/** Decrypts, tolerating legacy plaintext (returns the original on failure). */
export function safeDecryptWithKey(key: Buffer, value: string | null | undefined): string | null {
  if (value == null) return null;
  try {
    return decryptWithKey(key, value);
  } catch {
    return value;
  }
}

/** Last 4 digits, for masked display / audit trails. */
export function last4(value: string): string {
  return value.slice(-4);
}
