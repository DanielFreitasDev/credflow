-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- AlterTable
ALTER TABLE "CollectionCase" ADD COLUMN     "dunningStage" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Customer_name_trgm_idx" ON "Customer" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Customer_tradeName_trgm_idx" ON "Customer" USING GIN ("tradeName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "PaymentPromise_status_idx" ON "PaymentPromise"("status");

-- CreateIndex
CREATE INDEX "PaymentPromise_promisedDate_idx" ON "PaymentPromise"("promisedDate");

-- Defense-in-depth CHECK constraints. Value ranges are enforced in the app DTOs
-- and the finance domain; mirroring them at the DB level means a direct or
-- out-of-band write can never persist a nonsensical value (negative money, an
-- out-of-range score, a non-positive term). Prisma does not model CHECK
-- constraints, so they live only in migrations and never affect schema drift.

-- Customer
ALTER TABLE "Customer" ADD CONSTRAINT "customer_internalScore_range" CHECK ("internalScore" BETWEEN 0 AND 1000);
ALTER TABLE "Customer" ADD CONSTRAINT "customer_monthlyIncome_nonneg" CHECK ("monthlyIncome" >= 0);

-- CreditProposal
ALTER TABLE "CreditProposal" ADD CONSTRAINT "proposal_term_positive" CHECK ("termMonths" > 0);
ALTER TABLE "CreditProposal" ADD CONSTRAINT "proposal_amounts_nonneg" CHECK ("requestedAmount" >= 0 AND "financedAmount" >= 0 AND "totalAmount" >= 0 AND "totalInterest" >= 0 AND "iofAmount" >= 0 AND "tacAmount" >= 0);
ALTER TABLE "CreditProposal" ADD CONSTRAINT "proposal_interestRate_nonneg" CHECK ("interestRate" >= 0);

-- CreditAnalysis
ALTER TABLE "CreditAnalysis" ADD CONSTRAINT "analysis_score_range" CHECK ("score" BETWEEN 0 AND 1000);
ALTER TABLE "CreditAnalysis" ADD CONSTRAINT "analysis_suggestedLimit_nonneg" CHECK ("suggestedLimit" >= 0);

-- Contract
ALTER TABLE "Contract" ADD CONSTRAINT "contract_term_positive" CHECK ("termMonths" > 0);
ALTER TABLE "Contract" ADD CONSTRAINT "contract_amounts_nonneg" CHECK ("principal" >= 0 AND "totalAmount" >= 0 AND "totalInterest" >= 0 AND "iofAmount" >= 0 AND "tacAmount" >= 0);
ALTER TABLE "Contract" ADD CONSTRAINT "contract_rates_nonneg" CHECK ("interestRate" >= 0 AND "lateFeeRate" >= 0 AND "lateInterestRate" >= 0);

-- Installment
ALTER TABLE "Installment" ADD CONSTRAINT "installment_amounts_nonneg" CHECK ("principalDue" >= 0 AND "interestDue" >= 0 AND "amountDue" >= 0 AND "amountPaid" >= 0 AND "lateFee" >= 0 AND "lateInterest" >= 0);

-- Payment
ALTER TABLE "Payment" ADD CONSTRAINT "payment_amount_nonneg" CHECK ("amount" >= 0);
ALTER TABLE "Payment" ADD CONSTRAINT "payment_portions_nonneg" CHECK ("principalPortion" >= 0 AND "interestPortion" >= 0 AND "lateFeePortion" >= 0 AND "lateInterestPortion" >= 0);

-- CollectionCase
ALTER TABLE "CollectionCase" ADD CONSTRAINT "case_nonneg" CHECK ("daysOverdue" >= 0 AND "totalOverdue" >= 0 AND "dunningStage" >= 0);

-- PaymentPromise
ALTER TABLE "PaymentPromise" ADD CONSTRAINT "promise_amount_nonneg" CHECK ("amount" >= 0);
