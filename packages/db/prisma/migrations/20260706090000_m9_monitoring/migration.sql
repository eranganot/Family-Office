-- CreateEnum
CREATE TYPE "DriftSeverity" AS ENUM ('NONE', 'LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "MonitoringAlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateTable
CREATE TABLE "MonitoringRun" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "baselineSnapshotId" TEXT,
    "trigger" TEXT NOT NULL,
    "severity" "DriftSeverity" NOT NULL DEFAULT 'NONE',
    "driftReport" JSONB NOT NULL,
    "stalenessReport" JSONB NOT NULL,
    "itemsFlaggedStale" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonitoringRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringAlert" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" "DriftSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "titleHe" TEXT,
    "detail" JSONB NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "status" "MonitoringAlertStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "MonitoringAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonitoringRun_householdId_createdAt_idx" ON "MonitoringRun"("householdId", "createdAt");

-- CreateIndex
CREATE INDEX "MonitoringAlert_householdId_status_idx" ON "MonitoringAlert"("householdId", "status");

-- AddForeignKey
ALTER TABLE "MonitoringRun" ADD CONSTRAINT "MonitoringRun_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringRun" ADD CONSTRAINT "MonitoringRun_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "HouseholdSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringAlert" ADD CONSTRAINT "MonitoringAlert_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringAlert" ADD CONSTRAINT "MonitoringAlert_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MonitoringRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
