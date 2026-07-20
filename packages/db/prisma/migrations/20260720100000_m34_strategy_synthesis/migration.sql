-- M34: strategy synthesis artifact (pinned high-level plan narrative)
CREATE TABLE "StrategyPlan" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "narrative" JSONB NOT NULL,
    "metrics" JSONB NOT NULL,
    "pins" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyPlan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StrategyPlan_householdId_createdAt_idx" ON "StrategyPlan"("householdId", "createdAt");
