-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_contractId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_installmentId_fkey";

-- AlterTable
ALTER TABLE "Contract" ALTER COLUMN "cetAnnual" SET DATA TYPE DECIMAL(12,6);

-- AlterTable
ALTER TABLE "CreditProposal" ALTER COLUMN "cetMonthly" SET DATA TYPE DECIMAL(12,6),
ALTER COLUMN "cetAnnual" SET DATA TYPE DECIMAL(12,6);

-- CreateIndex
CREATE INDEX "Contract_createdAt_idx" ON "Contract"("createdAt");

-- CreateIndex
CREATE INDEX "Installment_status_dueDate_idx" ON "Installment"("status", "dueDate");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "Installment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
