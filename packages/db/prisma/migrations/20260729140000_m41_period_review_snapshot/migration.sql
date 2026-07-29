-- M41 - the monthly-review snapshot pinned to a closed operating period.
--
-- `computed` + `pins` already freeze the OPERATIONAL figures for a closed month. What
-- they do not freeze is the household those figures were computed against, which is
-- what a later strategy rerun or drift comparison actually needs. This links the two.
--
-- A nullable FK rather than a new SnapshotKind enum value, for two reasons:
--   1. Postgres will not let a newly added enum value be USED in the transaction that
--      adds it, and Prisma runs each migration in a transaction. Such a migration
--      passes locally and fails on the deploy box. The M40c gate now refuses ALTER TYPE
--      outright, and this migration honours that rather than carving an exception.
--   2. A reference says WHICH snapshot belongs to this month. A kind label would only
--      say that a snapshot of some category exists somewhere.
--
-- Nullable with no backfill: periods closed before this migration genuinely have no
-- review snapshot, and manufacturing one now from today's ledger would attach a
-- snapshot of the PRESENT household to a month that closed in the past - the opposite
-- of the reproducibility this column exists to provide.
ALTER TABLE "OperatingPeriod" ADD COLUMN "reviewSnapshotId" TEXT;

ALTER TABLE "OperatingPeriod"
  ADD CONSTRAINT "OperatingPeriod_reviewSnapshotId_fkey"
  FOREIGN KEY ("reviewSnapshotId") REFERENCES "HouseholdSnapshot"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
