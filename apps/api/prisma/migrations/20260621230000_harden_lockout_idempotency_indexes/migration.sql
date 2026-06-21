-- DropIndex: redundant — the [status, dueDate] composite serves status-only
-- lookups as a left prefix, so a standalone [status] index is just write overhead.
DROP INDEX "Installment_status_idx";

-- AlterTable: account-lockout state on User (brute-force protection).
ALTER TABLE "User" ADD COLUMN     "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedUntil" TIMESTAMP(3);

-- AlterTable: optional payment idempotency key (prevents double-charge on retry).
ALTER TABLE "Payment" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex: collections list default ORDER BY + dunning cron filter.
CREATE INDEX "CollectionCase_daysOverdue_idx" ON "CollectionCase"("daysOverdue");

-- CreateIndex: dashboard risk-band counts + score ordering.
CREATE INDEX "Customer_internalScore_idx" ON "Customer"("internalScore");

-- CreateIndex: idempotency-key uniqueness (multiple NULLs allowed in Postgres).
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- ─────────────────────────────────────────────────────────────────────────────
-- Range / ordering CHECK constraints. Prisma does not model CHECK constraints,
-- so they live only in migration SQL and never cause schema drift. They back the
-- application-level guards (date ordering, fee/rate sanity, non-negative money).
-- ─────────────────────────────────────────────────────────────────────────────

-- Contract dates must be ordered: start <= first due <= end.
ALTER TABLE "Contract" ADD CONSTRAINT "contract_dates_ordered"
  CHECK ("firstDueDate" >= "startDate" AND "endDate" >= "firstDueDate");

-- Sanity ceilings on rates: a Decimal(9,6) could otherwise store absurd values.
-- 5 = 500%/month nominal rate; 1 = 100% for the late-fee and monthly-mora rates.
ALTER TABLE "Contract" ADD CONSTRAINT "contract_rates_sane"
  CHECK ("interestRate" <= 5 AND "lateFeeRate" <= 1 AND "lateInterestRate" <= 1);
ALTER TABLE "CreditProposal" ADD CONSTRAINT "proposal_interestRate_sane"
  CHECK ("interestRate" <= 5);

-- approvedAmount, when present, must be non-negative.
ALTER TABLE "CreditAnalysis" ADD CONSTRAINT "analysis_approvedAmount_nonneg"
  CHECK ("approvedAmount" IS NULL OR "approvedAmount" >= 0);
