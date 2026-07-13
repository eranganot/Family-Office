-- AlterTable: full Hebrew rationale alongside English; null on pre-M10 rows
ALTER TABLE "Recommendation" ADD COLUMN "rationaleHe" JSONB;
