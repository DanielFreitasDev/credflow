import { createHash, createHmac } from 'crypto';
import {
  blindIndexWithKey,
  decryptWithKey,
  deriveBlindIndexKey,
  encryptWithKey,
  last4,
  safeDecryptWithKey,
} from './pii.util';

describe('pii.util', () => {
  const key = Buffer.alloc(32, 7); // deterministic 32-byte test key

  it('round-trips encrypt/decrypt', () => {
    const ct = encryptWithKey(key, '39053344705');
    expect(ct).not.toBe('39053344705');
    expect(decryptWithKey(key, ct)).toBe('39053344705');
  });

  it('produces a fresh ciphertext each time (random IV)', () => {
    expect(encryptWithKey(key, '123')).not.toBe(encryptWithKey(key, '123'));
  });

  it('blind index is deterministic and key-bound', () => {
    expect(blindIndexWithKey(key, '39053344705')).toBe(blindIndexWithKey(key, '39053344705'));
    const otherKey = Buffer.alloc(32, 9);
    expect(blindIndexWithKey(key, '39053344705')).not.toBe(blindIndexWithKey(otherKey, '39053344705'));
  });

  it('blind index is an HMAC, not a secret-prefix SHA-256(key||value)', () => {
    const v = '39053344705';
    // Must equal HMAC-SHA256 under the key...
    expect(blindIndexWithKey(key, v)).toBe(createHmac('sha256', key).update(v).digest('hex'));
    // ...and must NOT equal the old, weak secret-prefix construction.
    const legacy = createHash('sha256').update(key).update(v).digest('hex');
    expect(blindIndexWithKey(key, v)).not.toBe(legacy);
  });

  it('derives a deterministic, domain-separated 32-byte blind-index key', () => {
    const d1 = deriveBlindIndexKey(key);
    const d2 = deriveBlindIndexKey(key);
    expect(d1).toHaveLength(32);
    expect(d1.equals(d2)).toBe(true);
    expect(d1.equals(key)).toBe(false); // never the raw AES key
    // Index under the derived key differs from the master key (no key reuse).
    expect(blindIndexWithKey(d1, '39053344705')).not.toBe(blindIndexWithKey(key, '39053344705'));
  });

  it('safeDecryptWithKey tolerates legacy plaintext and null', () => {
    expect(safeDecryptWithKey(key, 'plain-not-ciphertext')).toBe('plain-not-ciphertext');
    expect(safeDecryptWithKey(key, encryptWithKey(key, 'secret'))).toBe('secret');
    expect(safeDecryptWithKey(key, null)).toBeNull();
  });

  it('last4 returns the last four characters', () => {
    expect(last4('39053344705')).toBe('4705');
  });
});
