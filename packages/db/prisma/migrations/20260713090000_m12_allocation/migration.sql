-- AlterTable: growth-asset share per account (null = unknown; engine excludes-and-reports)
ALTER TABLE "AccountDetail" ADD COLUMN "growthSharePct" DECIMAL(7,4);
