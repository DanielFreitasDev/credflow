import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  blindIndexWithKey,
  decryptWithKey,
  deriveBlindIndexKey,
  encryptWithKey,
  looksLikeCiphertext,
} from './pii.util';

/**
 * Authenticated symmetric encryption (AES-256-GCM) for sensitive PII at rest.
 * Output format: base64( iv[12] | authTag[16] | ciphertext ). The actual crypto
 * lives in `pii.util` so the seed can reuse the exact same implementation.
 */
@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly key: Buffer;
  /** Dedicated, domain-separated key for the HMAC blind index (never the AES key). */
  private readonly blindKey: Buffer;
  private readonly isProduction: boolean;

  constructor(config: ConfigService) {
    this.key = Buffer.from(config.getOrThrow<string>('encryptionKey'), 'base64');
    const explicit = config.get<string>('blindIndexKey');
    this.blindKey = explicit ? Buffer.from(explicit, 'base64') : deriveBlindIndexKey(this.key);
    this.isProduction = (config.get<string>('nodeEnv') ?? process.env.NODE_ENV) === 'production';
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
   * Decrypts a value, tolerating legacy plaintext (seed data / rows not yet
   * backfilled). On failure it distinguishes two cases: a value that does NOT
   * look like our ciphertext envelope is treated as legacy plaintext and returned
   * as-is; a value that DOES look like ciphertext but fails authentication is an
   * integrity failure (tampering / wrong key) — in production we return `null`
   * and never echo the stored bytes (defeating an attacker with DB-write access
   * who swaps ciphertext for chosen plaintext). In non-production we stay lenient
   * to keep local/seed workflows frictionless.
   */
  safeDecrypt(value: string | null | undefined): string | null {
    if (value == null) return null;
    try {
      return this.decrypt(value);
    } catch {
      if (this.isProduction && looksLikeCiphertext(value)) {
        this.logger.error('PII decryption failed for a ciphertext-shaped value (possible tampering or key mismatch)');
        return null;
      }
      return value;
    }
  }

  /** Masks all but the last 4 digits of a document-like value (CPF/CNPJ/RG). */
  maskDocument(value: string | null | undefined): string | null {
    if (value == null) return null;
    const digits = value.replace(/\D/g, '');
    const base = digits.length >= 4 ? digits : value;
    if (base.length <= 4) return '*'.repeat(base.length);
    return '*'.repeat(base.length - 4) + base.slice(-4);
  }

  /**
   * Role-aware presentation of an embedded customer's `document` in place.
   * Operational roles receive the real decrypted value; the read-only AUDITOR
   * oversight role receives a last-4 mask (it never needs raw PII). The internal
   * `documentHash` blind index is always stripped. Pass no role to decrypt
   * without masking (internal / write paths).
   */
  presentDocumentField(
    obj: { document?: string | null; documentHash?: unknown } | null | undefined,
    role?: string,
  ): void {
    if (!obj) return;
    if (obj.document != null) {
      // If safeDecrypt returns null (undecryptable ciphertext in production) we
      // expose null — never the raw ciphertext — so the envelope can't leak.
      const plain = this.safeDecrypt(obj.document);
      obj.document = role === 'AUDITOR' ? this.maskDocument(plain) : plain;
    }
    delete obj.documentHash;
  }

  /**
   * Prepares an embedded customer for an API response in place: decrypts the
   * `document` field (tolerating legacy plaintext) and strips the internal
   * `documentHash` blind index, so modules that embed a customer leak neither
   * ciphertext nor the key-bound correlator. Defense in depth on top of the
   * global Prisma `omit` for `documentHash`. No role-based masking.
   */
  decryptDocumentField(
    obj: { document?: string | null; documentHash?: unknown } | null | undefined,
  ): void {
    this.presentDocumentField(obj, undefined);
  }

  /** Deterministic, non-reversible HMAC — useful for blind-indexing/lookups. */
  blindIndex(value: string): string {
    return blindIndexWithKey(this.blindKey, value);
  }
}
