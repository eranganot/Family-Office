-- M27: editable working plan (candidate-based deployment)
ALTER TABLE "AllocationPlan" ADD COLUMN "workingPlan" JSONB NOT NULL DEFAULT '{}';
