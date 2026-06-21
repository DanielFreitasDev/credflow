/* eslint-disable no-console */
/**
 * One-off backfill for the `protect_customer_document` migration.
 *
 * Existing customers created before the change hold their CPF/CNPJ as plaintext
 * in `Customer.document` with a NULL `documentHash`. This encrypts that value at
 * rest and populates the blind index + last4. It is idempotent: only rows with a
 * NULL `documentHash` are processed, so re-running is a no-op.
 *
 *   ENCRYPTION_KEY=... npx tsx prisma/backfill-documents.ts
 */
import { PrismaClient } from '@prisma/client';
import { onlyDigits } from '../src/common/utils/document.util';
import { blindIndexWithKey, encryptWithKey, last4 } from '../src/common/crypto/pii.util';

const prisma = new PrismaClient();
const KEY = Buffer.from(process.env.ENCRYPTION_KEY ?? '', 'base64');

async function main() {
  if (KEY.length !== 32) {
    throw new Error('ENCRYPTION_KEY must decode to 32 bytes (base64).');
  }

  const rows = await prisma.customer.findMany({
    where: { documentHash: null },
    select: { id: true, document: true },
  });
  console.log(`Backfilling ${rows.length} customer document(s)...`);

  let updated = 0;
  for (const row of rows) {
    const digits = onlyDigits(row.document);
    if (!digits) continue;
    await prisma.customer.update({
      where: { id: row.id },
      data: {
        document: encryptWithKey(KEY, digits),
        documentHash: blindIndexWithKey(KEY, digits),
        documentLast4: last4(digits),
      },
    });
    updated++;
  }

  console.log(`✅ Backfill complete: ${updated} updated.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
