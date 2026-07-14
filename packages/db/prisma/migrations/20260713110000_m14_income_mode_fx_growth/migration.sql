-- Income mode on goals: desired monthly income; capital target derived at read time
ALTER TABLE "Goal" ADD COLUMN "targetMonthlyIncome" DECIMAL(18,4);
-- Growth-share estimates: heuristic suggestions flagged until owner confirms
ALTER TABLE "AccountDetail" ADD COLUMN "growthShareEstimated" BOOLEAN NOT NULL DEFAULT false;
