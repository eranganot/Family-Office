-- M26: variantized deployment plans + per-step decisions
ALTER TABLE "AllocationPlan" ADD COLUMN "chosenVariant" TEXT;
ALTER TABLE "AllocationPlan" ADD COLUMN "stepDecisions" JSONB NOT NULL DEFAULT '{}';
