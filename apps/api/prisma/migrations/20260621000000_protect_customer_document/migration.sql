-- Protect the customer's primary document (CPF/CNPJ).
--
-- `Customer.document` now stores AES-256-GCM ciphertext instead of plaintext.
-- Uniqueness and exact search move to the deterministic blind index
-- `documentHash`; `documentLast4` keeps the last 4 digits for masked display.
--
-- The new columns are nullable so this applies cleanly to databases that already
-- hold customer rows. After deploying, run the one-off backfill to encrypt the
-- legacy plaintext and populate the hash/last4 for existing rows:
--   npx tsx prisma/backfill-documents.ts
-- (A freshly seeded database is already written in the new format.)

-- DropIndex
DROP INDEX "Customer_document_key";

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "documentHash" TEXT,
ADD COLUMN     "documentLast4" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Customer_documentHash_key" ON "Customer"("documentHash");
