-- M25: fifth workflow phase + deployment plans
ALTER TYPE "WorkflowState" ADD VALUE IF NOT EXISTS 'ALLOCATION';

CREATE TYPE "AllocationPlanStatus" AS ENUM ('PROPOSED', 'APPROVED', 'SUPERSEDED');

CREATE TABLE "AllocationPlan" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "plan" JSONB NOT NULL,
    "status" "AllocationPlanStatus" NOT NULL DEFAULT 'PROPOSED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "AllocationPlan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AllocationPlan_householdId_createdAt_idx" ON "AllocationPlan"("householdId", "createdAt");

ALTER TABLE "AllocationPlan" ADD CONSTRAINT "AllocationPlan_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AllocationPlan" ADD CONSTRAINT "AllocationPlan_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "HouseholdSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
