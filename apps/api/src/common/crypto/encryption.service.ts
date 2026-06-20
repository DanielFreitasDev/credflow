import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from 'crypto';

/**
 * Authenticated symmetric encryption (AES-256-GCM) for sensitive PII at rest.
 * Output format: base64( iv[12] | authTag[16] | ciphertext ).
 */
@Injectable()
export class EncryptionService {
  private readonly key: Buffer;
  private readonly algorithm = 'aes-256-gcm';

  constructor(config: ConfigService) {
    this.key = Buffer.from(config.getOrThrow<string>('encryptionKey'), 'base64');
  }

  encrypt(plaintext: string): string {
    if (plaintext == null) return plaintext;
    const iv = randomBytes(12);
    const cipher = createCipheriv(this.algorithm, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }

  decrypt(payload: string): string {
    if (payload == null) return payload;
    const data = Buffer.from(payload, 'base64');
    const iv = data.subarray(0, 12);
    const authTag = data.subarray(12, 28);
    const ciphertext = data.subarray(28);
    const decipher = createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  /** Deterministic, non-reversible hash — useful for blind-indexing/lookups. */
  blindIndex(value: string): string {
    return createHash('sha256')
      .update(this.key)
      .update(value.toLowerCase().trim())
      .digest('hex');
  }
}
