import { blindIndexWithKey, decryptWithKey, encryptWithKey, last4 } from './pii.util';

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

  it('last4 returns the last four characters', () => {
    expect(last4('39053344705')).toBe('4705');
  });
});
