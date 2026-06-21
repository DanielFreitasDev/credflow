import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { blindIndexWithKey, decryptWithKey, encryptWithKey } from './pii.util';

/**
 * Authenticated symmetric encryption (AES-256-GCM) for sensitive PII at rest.
 * Output format: base64( iv[12] | authTag[16] | ciphertext ). The actual crypto
 * lives in `pii.util` so the seed can reuse the exact same implementation.
 */
@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    this.key = Buffer.from(config.getOrThrow<string>('encryptionKey'), 'base64');
  }

  encrypt(plaintext: string): string {
    if (plaintext == null) return plaintext;
    return encryptWithKey(this.key, plaintext);
  }

  decrypt(payload: string): string {
    if (payload == null) return payload;
    return decryptWithKey(this.key, payload);
  }

  /**
   * Decrypts a value, tolerating legacy plaintext (e.g. seed data or rows not yet
   * backfilled): if the payload isn't valid ciphertext, the original is returned.
   */
  safeDecrypt(value: string | null | undefined): string | null {
    if (value == null) return null;
    try {
      return this.decrypt(value);
    } catch {
      return value;
    }
  }

  /**
   * Decrypts an embedded record's `document` field in place (tolerating legacy
   * plaintext), so modules that embed a customer don't leak ciphertext.
   */
  decryptDocumentField(obj: { document?: string | null } | null | undefined): void {
    if (obj && obj.document != null) obj.document = this.safeDecrypt(obj.document) ?? obj.document;
  }

  /** Deterministic, non-reversible hash — useful for blind-indexing/lookups. */
  blindIndex(value: string): string {
    return blindIndexWithKey(this.key, value);
  }
}
