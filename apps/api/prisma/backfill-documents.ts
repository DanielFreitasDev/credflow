/* eslint-disable no-console */
/**
 * Idempotent backfill / re-indexer for customer documents.
 *
 * Ensures every customer's CPF/CNPJ is stored as ciphertext (AES-256-GCM) with a
 * matching HMAC blind index (`documentHash`) and `documentLast4`. It safely:
 *   - encrypts legacy plaintext rows (the original `protect_customer_document` case);
 *   - re-indexes rows after a blind-index key/scheme change (HMAC migration);
 *   - is a no-op for rows already in the correct shape (safe to run on every boot).
 *
 *   ENCRYPTION_KEY=... [BLIND_INDEX_KEY=...] npx tsx prisma/backfill-documents.ts
 */
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { onlyDigits } from '../src/common/utils/document.util';
import {
  blindIndexWithKey,
  deriveBlindIndexKey,
  encryptWithKey,
  last4,
  safeDecryptWithKey,
} from '../src/common/crypto/pii.util';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL as string });
const prisma = new PrismaClient({ adapter });
const KEY = Buffer.from(process.env.ENCRYPTION_KEY ?? '', 'base64');

async function main() {
  if (KEY.length !== 32) {
    throw new Error('ENCRYPTION_KEY must decode to 32 bytes (base64).');
  }
  const BLIND_KEY = process.env.BLIND_INDEX_KEY
    ? Buffer.from(process.env.BLIND_INDEX_KEY, 'base64')
    : deriveBlindIndexKey(KEY);

  const rows = await prisma.customer.findMany({
    select: { id: true, document: true, documentHash: true },
  });
  console.log(`Checking ${rows.length} customer document(s)...`);

  let updated = 0;
  for (const row of rows) {
    // safeDecrypt yields the digits whether the stored value is ciphertext or
    // legacy plaintext; `wasCiphertext` tells the two apart for the skip check.
    const plain = safeDecryptWithKey(KEY, row.document);
    const digits = onlyDigits(plain ?? '');
    if (!digits) continue;
    const wasCiphertext = plain !== row.document;
    const expectedHash = blindIndexWithKey(BLIND_KEY, digits);
    if (wasCiphertext && row.documentHash === expectedHash) continue; // already current

    await prisma.customer.update({
      where: { id: row.id },
      data: {
        document: encryptWithKey(KEY, digits),
        documentHash: expectedHash,
        documentLast4: last4(digits),
      },
    });
    updated++;
  }

  console.log(`✅ Backfill/reindex complete: ${updated} updated, ${rows.length - updated} already current.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
