-- ===========================================================================
-- M36 — Financial Operations & Cash Flow: core context
-- docs/architecture/07-financial-operations.md
--
-- ADDITIVE ONLY. No DROP, no RENAME, no type change on an existing column.
-- Every pre-M36 row remains valid the instant this lands; no data migration.
-- ===========================================================================

-- --- New enums -------------------------------------------------------------
CREATE TYPE "RecommendationOrigin" AS ENUM ('STRATEGIC', 'OPERATIONAL');
CREATE TYPE "ActionCadence"        AS ENUM ('ONE_TIME', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'EVENT_DRIVEN');
CREATE TYPE "ActionDifficulty"     AS ENUM ('TRIVIAL', 'EASY', 'MODERATE', 'HARD');
CREATE TYPE "Reversibility"        AS ENUM ('REVERSIBLE', 'PARTIALLY_REVERSIBLE', 'IRREVERSIBLE');
CREATE TYPE "BehavioralClass"      AS ENUM ('FIXED_CONTRACTUAL', 'VARIABLE_DISCRETIONARY', 'FINANCIAL_DRAG', 'SAVINGS_FLOW', 'TRANSFER');
CREATE TYPE "CategoryAxis"         AS ENUM ('INCOME', 'EXPENSE');
CREATE TYPE "TransactionSource"    AS ENUM ('IMPORT', 'MANUAL', 'DERIVED');
CREATE TYPE "TransactionStatus"    AS ENUM ('PENDING', 'BOOKED', 'VOID');
CREATE TYPE "ClassificationStatus" AS ENUM ('AUTO', 'SUSPENSE', 'CONFIRMED', 'SUPERSEDED');
CREATE TYPE "OperatingPeriodStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "PeriodCoverage"       AS ENUM ('COMPLETE', 'PARTIAL', 'AGGREGATE_ONLY');
CREATE TYPE "CalendarEventKind"    AS ENUM ('TAX_DEADLINE', 'BITUACH_LEUMI', 'PENSION_WINDOW', 'HISHTALMUT_CEILING', 'GEMEL_CONTRIBUTION', 'MORTGAGE_RESET', 'INSURANCE_RENEWAL', 'ARNONA', 'VEHICLE_LICENSE', 'VEHICLE_INSURANCE', 'SCHOOL_PAYMENT', 'CHILDCARE_PAYMENT', 'SALARY_BONUS', 'HOLIDAY_SPENDING', 'ANNUAL_SUBSCRIPTION', 'INSTALMENT', 'REVIEW', 'OTHER');
CREATE TYPE "CalendarEventStatus"  AS ENUM ('SCHEDULED', 'DUE', 'DONE', 'SKIPPED', 'EXPIRED');

-- --- Recommendation: operational extension (all additive, all defaulted) ----
ALTER TABLE "Recommendation"
  ADD COLUMN "origin"            "RecommendationOrigin" NOT NULL DEFAULT 'STRATEGIC',
  ADD COLUMN "cadence"           "ActionCadence"        NOT NULL DEFAULT 'ONE_TIME',
  ADD COLUMN "dueDate"           DATE,
  ADD COLUMN "expiresAt"         DATE,
  ADD COLUMN "difficulty"        "ActionDifficulty",
  ADD COLUMN "reversibility"     "Reversibility",
  ADD COLUMN "impactMonthlyBase" DECIMAL(18,4),
  ADD COLUMN "impactAnnualBase"  DECIMAL(18,4),
  ADD COLUMN "impactEoyBase"     DECIMAL(18,4),
  ADD COLUMN "operatingPeriodId" TEXT,
  ADD COLUMN "calendarEventId"   TEXT;

CREATE INDEX "Recommendation_householdId_origin_status_idx" ON "Recommendation"("householdId", "origin", "status");
CREATE INDEX "Recommendation_householdId_dueDate_idx"       ON "Recommendation"("householdId", "dueDate");

-- --- Action dependency graph ------------------------------------------------
CREATE TABLE "RecommendationDependency" (
    "dependentId"    TEXT NOT NULL,
    "prerequisiteId" TEXT NOT NULL,
    CONSTRAINT "RecommendationDependency_pkey" PRIMARY KEY ("dependentId", "prerequisiteId")
);
CREATE INDEX "RecommendationDependency_prerequisiteId_idx" ON "RecommendationDependency"("prerequisiteId");
ALTER TABLE "RecommendationDependency" ADD CONSTRAINT "RecommendationDependency_dependentId_fkey"
  FOREIGN KEY ("dependentId") REFERENCES "Recommendation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecommendationDependency" ADD CONSTRAINT "RecommendationDependency_prerequisiteId_fkey"
  FOREIGN KEY ("prerequisiteId") REFERENCES "Recommendation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- --- Functional axis: configurable category tree ----------------------------
CREATE TABLE "CashFlowCategory" (
    "id"                     TEXT NOT NULL,
    "householdId"            TEXT NOT NULL,
    "parentId"               TEXT,
    "axis"                   "CategoryAxis" NOT NULL,
    "key"                    TEXT NOT NULL,
    "nameEn"                 TEXT NOT NULL,
    "nameHe"                 TEXT NOT NULL,
    "defaultBehavioralClass" "BehavioralClass" NOT NULL,
    "mapsToFlowType"         "CashFlowType",
    "isSystem"               BOOLEAN NOT NULL DEFAULT false,
    "isArchived"             BOOLEAN NOT NULL DEFAULT false,
    "sortOrder"              INTEGER NOT NULL DEFAULT 0,
    "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CashFlowCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CashFlowCategory_householdId_key_key"       ON "CashFlowCategory"("householdId", "key");
CREATE INDEX        "CashFlowCategory_householdId_axis_parentId_idx" ON "CashFlowCategory"("householdId", "axis", "parentId");
ALTER TABLE "CashFlowCategory" ADD CONSTRAINT "CashFlowCategory_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashFlowCategory" ADD CONSTRAINT "CashFlowCategory_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "CashFlowCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- --- Observation layer: transactions ---------------------------------------
-- NOTE: no raw-description column exists by design. Only the redacted form is
-- persisted (docs/architecture/07 §7.1). The original bytes stay in "Document".
CREATE TABLE "Transaction" (
    "id"                   TEXT NOT NULL,
    "householdId"          TEXT NOT NULL,
    "importBatchId"        TEXT,
    "source"               "TransactionSource" NOT NULL,
    "status"               "TransactionStatus" NOT NULL DEFAULT 'BOOKED',
    "bookedAt"             DATE NOT NULL,
    "valueDate"            DATE,
    "amount"               DECIMAL(18,4) NOT NULL,
    "currency"             CHAR(3) NOT NULL,
    "amountBase"           DECIMAL(18,4),
    "fxRateId"             TEXT,
    "descriptionRedacted"  TEXT NOT NULL,
    "merchantKey"          TEXT,
    "counterpartyMasked"   TEXT,
    "ledgerItemId"         TEXT,
    "categoryId"           TEXT,
    "behavioralClass"      "BehavioralClass",
    "instalmentNumber"     INTEGER,
    "instalmentTotal"      INTEGER,
    "originalAmount"       DECIMAL(18,4),
    "settlementLinkId"     TEXT,
    "isRecurringCandidate" BOOLEAN NOT NULL DEFAULT false,
    "isDuplicateOf"        TEXT,
    "externalRef"          TEXT,
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Transaction_householdId_externalRef_key"    ON "Transaction"("householdId", "externalRef");
CREATE INDEX "Transaction_householdId_bookedAt_idx"              ON "Transaction"("householdId", "bookedAt");
CREATE INDEX "Transaction_householdId_categoryId_bookedAt_idx"   ON "Transaction"("householdId", "categoryId", "bookedAt");
CREATE INDEX "Transaction_householdId_merchantKey_idx"           ON "Transaction"("householdId", "merchantKey");
CREATE INDEX "Transaction_householdId_status_idx"                ON "Transaction"("householdId", "status");
CREATE INDEX "Transaction_settlementLinkId_idx"                  ON "Transaction"("settlementLinkId");
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_importBatchId_fkey"
  FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_ledgerItemId_fkey"
  FOREIGN KEY ("ledgerItemId") REFERENCES "LedgerItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "CashFlowCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- --- Classification history (dual-axis decisions, with rule provenance) -----
CREATE TABLE "TransactionClassification" (
    "id"              TEXT NOT NULL,
    "transactionId"   TEXT NOT NULL,
    "categoryId"      TEXT NOT NULL,
    "behavioralClass" "BehavioralClass" NOT NULL,
    "confidence"      DECIMAL(4,3) NOT NULL,
    "method"          TEXT NOT NULL,
    "ruleVersion"     TEXT,
    "status"          "ClassificationStatus" NOT NULL DEFAULT 'AUTO',
    "decidedBy"       TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransactionClassification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TransactionClassification_transactionId_status_idx" ON "TransactionClassification"("transactionId", "status");
ALTER TABLE "TransactionClassification" ADD CONSTRAINT "TransactionClassification_transactionId_fkey"
  FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransactionClassification" ADD CONSTRAINT "TransactionClassification_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "CashFlowCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- --- The household-month ----------------------------------------------------
CREATE TABLE "OperatingPeriod" (
    "id"                   TEXT NOT NULL,
    "householdId"          TEXT NOT NULL,
    "year"                 INTEGER NOT NULL,
    "month"                INTEGER NOT NULL,
    "status"               "OperatingPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "engineVersion"        TEXT,
    "computed"             JSONB,
    "pins"                 JSONB,
    "surplusBase"          DECIMAL(18,4),
    "surplusIsProvisional" BOOLEAN NOT NULL DEFAULT true,
    "coverage"             "PeriodCoverage" NOT NULL DEFAULT 'PARTIAL',
    "unverifiedCount"      INTEGER NOT NULL DEFAULT 0,
    "unverifiedAmountBase" DECIMAL(18,4),
    "reviewNote"           TEXT,
    "closedAt"             TIMESTAMP(3),
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OperatingPeriod_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OperatingPeriod_householdId_year_month_key" ON "OperatingPeriod"("householdId", "year", "month");
CREATE INDEX        "OperatingPeriod_householdId_year_month_idx" ON "OperatingPeriod"("householdId", "year", "month");
ALTER TABLE "OperatingPeriod" ADD CONSTRAINT "OperatingPeriod_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- --- Recurring decisions + financial calendar -------------------------------
CREATE TABLE "RecurringDecision" (
    "id"            TEXT NOT NULL,
    "householdId"   TEXT NOT NULL,
    "key"           TEXT NOT NULL,
    "titleEn"       TEXT NOT NULL,
    "titleHe"       TEXT NOT NULL,
    "cadence"       "ActionCadence" NOT NULL,
    "anchorDate"    DATE NOT NULL,
    "leadDays"      INTEGER NOT NULL DEFAULT 14,
    "isActive"      BOOLEAN NOT NULL DEFAULT true,
    "lastEmittedAt" TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecurringDecision_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RecurringDecision_householdId_key_key" ON "RecurringDecision"("householdId", "key");
ALTER TABLE "RecurringDecision" ADD CONSTRAINT "RecurringDecision_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CalendarEvent" (
    "id"                  TEXT NOT NULL,
    "householdId"         TEXT NOT NULL,
    "kind"                "CalendarEventKind" NOT NULL,
    "titleEn"             TEXT NOT NULL,
    "titleHe"             TEXT NOT NULL,
    "dueDate"             DATE NOT NULL,
    "windowDays"          INTEGER NOT NULL DEFAULT 0,
    "amountBase"          DECIMAL(18,4),
    "isCashImpacting"     BOOLEAN NOT NULL DEFAULT false,
    "status"              "CalendarEventStatus" NOT NULL DEFAULT 'SCHEDULED',
    "ruleId"              TEXT,
    "recurringDecisionId" TEXT,
    "ledgerItemId"        TEXT,
    "transactionId"       TEXT,
    "sourceNote"          TEXT,
    "completedAt"         TIMESTAMP(3),
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CalendarEvent_householdId_dueDate_status_idx" ON "CalendarEvent"("householdId", "dueDate", "status");
CREATE INDEX "CalendarEvent_householdId_kind_idx"           ON "CalendarEvent"("householdId", "kind");
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_recurringDecisionId_fkey"
  FOREIGN KEY ("recurringDecisionId") REFERENCES "RecurringDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- --- Append-only operational telemetry --------------------------------------
CREATE TABLE "ActionEvent" (
    "id"               TEXT NOT NULL,
    "householdId"      TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "fromStatus"       "RecommendationStatus",
    "toStatus"         "RecommendationStatus" NOT NULL,
    "dismissalReason"  TEXT,
    "note"             TEXT,
    "actor"            TEXT NOT NULL,
    "at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActionEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ActionEvent_householdId_at_idx"      ON "ActionEvent"("householdId", "at");
CREATE INDEX "ActionEvent_recommendationId_at_idx" ON "ActionEvent"("recommendationId", "at");
ALTER TABLE "ActionEvent" ADD CONSTRAINT "ActionEvent_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActionEvent" ADD CONSTRAINT "ActionEvent_recommendationId_fkey"
  FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- --- Saved import column-mapping profiles -----------------------------------
CREATE TABLE "ImportMappingProfile" (
    "id"            TEXT NOT NULL,
    "householdId"   TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "institutionId" TEXT,
    "adapterId"     TEXT NOT NULL,
    "mapping"       JSONB NOT NULL,
    "version"       INTEGER NOT NULL DEFAULT 1,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ImportMappingProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ImportMappingProfile_householdId_name_key" ON "ImportMappingProfile"("householdId", "name");
ALTER TABLE "ImportMappingProfile" ADD CONSTRAINT "ImportMappingProfile_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
