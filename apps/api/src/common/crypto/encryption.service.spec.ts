import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service';

/**
 * Regression guard for the customer-document blind index. `documentHash` is an
 * internal, key-bound correlator and must never reach an API response — a prior
 * review found it leaking through embedded `customer` objects in proposal/
 * contract/collection detail endpoints. `decryptDocumentField` is the shared
 * sanitizer those endpoints (and the customers service) route through.
 */
describe('EncryptionService.decryptDocumentField', () => {
  // Deterministic 32-byte key (base64) — no real secret needed for unit tests.
  const key = Buffer.alloc(32, 7).toString('base64');
  const service = new EncryptionService({
    getOrThrow: () => key,
  } as unknown as ConfigService);

  it('strips the internal documentHash blind index', () => {
    const customer: Record<string, unknown> = {
      document: 'plaintext',
      documentHash: 'c62c85af738b5574ff4d6fcd39807758fd7433f99cdfc4eeeac05045a29ad22d',
      name: 'ACME',
    };
    service.decryptDocumentField(customer);
    expect('documentHash' in customer).toBe(false);
    expect(customer.name).toBe('ACME');
  });

  it('decrypts the document in place while still stripping the hash', () => {
    const ciphertext = service.encrypt('15350946056');
    const customer: Record<string, unknown> = { document: ciphertext, documentHash: 'h' };
    service.decryptDocumentField(customer);
    expect(customer.document).toBe('15350946056');
    expect('documentHash' in customer).toBe(false);
  });

  it('tolerates legacy plaintext documents', () => {
    const customer: Record<string, unknown> = { document: '15350946056', documentHash: 'h' };
    service.decryptDocumentField(customer);
    expect(customer.document).toBe('15350946056');
    expect('documentHash' in customer).toBe(false);
  });

  it('is a safe no-op for null/undefined embeds', () => {
    expect(() => service.decryptDocumentField(null)).not.toThrow();
    expect(() => service.decryptDocumentField(undefined)).not.toThrow();
  });
});
