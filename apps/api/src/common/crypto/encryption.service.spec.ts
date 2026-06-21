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
    get: () => undefined, // no explicit BLIND_INDEX_KEY -> derive from the AES key
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

/**
 * Role-aware presentation: the read-only AUDITOR oversight role must never
 * receive a raw CPF/CNPJ — it gets a last-4 mask — while operational roles get
 * the real decrypted document. Guards the customer/proposal/contract/collection
 * read paths that thread the actor role through.
 */
describe('EncryptionService.presentDocumentField (role-aware masking)', () => {
  const key = Buffer.alloc(32, 7).toString('base64');
  const service = new EncryptionService({
    getOrThrow: () => key,
    get: () => undefined, // no explicit BLIND_INDEX_KEY -> derive from the AES key
  } as unknown as ConfigService);

  it('masks all but the last 4 digits for AUDITOR (encrypted source)', () => {
    const customer: Record<string, unknown> = {
      document: service.encrypt('15350946056'),
      documentHash: 'h',
    };
    service.presentDocumentField(customer, 'AUDITOR');
    expect(customer.document).toBe('*******6056');
    expect('documentHash' in customer).toBe(false);
  });

  it('returns the real decrypted document for an operational role', () => {
    const customer: Record<string, unknown> = {
      document: service.encrypt('15350946056'),
      documentHash: 'h',
    };
    service.presentDocumentField(customer, 'OPERATOR');
    expect(customer.document).toBe('15350946056');
  });

  it('masks legacy plaintext for AUDITOR too', () => {
    const customer: Record<string, unknown> = { document: '15350946056' };
    service.presentDocumentField(customer, 'AUDITOR');
    expect(customer.document).toBe('*******6056');
  });

  describe('maskDocument', () => {
    it('keeps only the last 4 digits (CPF and CNPJ)', () => {
      expect(service.maskDocument('15350946056')).toBe('*******6056');
      expect(service.maskDocument('12345678000199')).toBe('**********0199');
    });
    it('handles null and short values', () => {
      expect(service.maskDocument(null)).toBeNull();
      expect(service.maskDocument('12')).toBe('**');
    });
  });
});
