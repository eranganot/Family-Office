-- CreateEnum
CREATE TYPE "WorkflowState" AS ENUM ('MAPPING', 'VERIFICATION', 'STRATEGY', 'MONITORING');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('ADULT', 'CHILD');

-- CreateEnum
CREATE TYPE "LedgerKind" AS ENUM ('ACCOUNT', 'REAL_ESTATE', 'MORTGAGE', 'LOAN', 'CASH_FLOW', 'INSURANCE', 'OTHER_ASSET', 'OTHER_LIABILITY', 'SUSPENSE');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'REJECTED', 'STALE');

-- CreateEnum
CREATE TYPE "ValuationSource" AS ENUM ('DOCUMENT_IMPORT', 'MANUAL_ENTRY', 'CALCULATED', 'CONNECTOR');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('BANK_CHECKING', 'BANK_SAVINGS', 'BANK_DEPOSIT', 'BROKERAGE_IL', 'BROKERAGE_FOREIGN', 'PENSION_COMPREHENSIVE', 'PENSION_GENERAL', 'KUPAT_GEMEL', 'GEMEL_LEHASHKAA', 'KEREN_HISHTALMUT', 'IRA_GEMEL', 'FOREIGN_RETIREMENT', 'CASH_OTHER');

-- CreateEnum
CREATE TYPE "MortgageTrackType" AS ENUM ('PRIME', 'FIXED_LINKED', 'FIXED_UNLINKED', 'VARIABLE_LINKED', 'VARIABLE_UNLINKED', 'FOREIGN_CURRENCY');

-- CreateEnum
CREATE TYPE "CashFlowType" AS ENUM ('SALARY', 'SELF_EMPLOYMENT_INCOME', 'RENTAL_INCOME', 'PENSION_INCOME', 'OTHER_INCOME', 'LIVING_EXPENSE', 'HOUSING_EXPENSE', 'EDUCATION_EXPENSE', 'INSURANCE_PREMIUM', 'LOAN_PAYMENT', 'OTHER_EXPENSE');

-- CreateEnum
CREATE TYPE "Frequency" AS ENUM ('MONTHLY', 'ANNUAL', 'ONE_TIME');

-- CreateEnum
CREATE TYPE "InsurancePolicyType" AS ENUM ('LIFE', 'DISABILITY', 'HEALTH', 'LONG_TERM_CARE', 'PROPERTY', 'MORTGAGE_LIFE', 'OTHER');

-- CreateEnum
CREATE TYPE "ParseStatus" AS ENUM ('UPLOADED', 'PARSED', 'PARTIALLY_PARSED', 'FAILED', 'NOT_PARSEABLE');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SuspenseStatus" AS ENUM ('PENDING', 'RESOLVED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "GoalType" AS ENUM ('EMERGENCY_FUND', 'RETIREMENT', 'CHILDREN_EDUCATION', 'PROPERTY_PURCHASE', 'INVESTMENT_PROPERTY', 'FINANCIAL_INDEPENDENCE', 'LIFESTYLE', 'LEGACY', 'INHERITANCE', 'PHILANTHROPY', 'OTHER');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'ACHIEVED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED', 'IMPLEMENTED', 'SUPERSEDED', 'INVALIDATED');

-- CreateEnum
CREATE TYPE "SnapshotKind" AS ENUM ('SCHEDULED', 'PRE_STRATEGY', 'MANUAL');

-- CreateTable
CREATE TABLE "Household" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseCurrency" CHAR(3) NOT NULL,
    "workflowState" "WorkflowState" NOT NULL DEFAULT 'MAPPING',
    "locale" TEXT NOT NULL DEFAULT 'he',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jerusalem',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyMember" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL,
    "birthDate" DATE,
    "taxResidency" TEXT NOT NULL DEFAULT 'IL',
    "employmentStatus" TEXT,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "FamilyMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowTransition" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "fromState" "WorkflowState" NOT NULL,
    "toState" "WorkflowState" NOT NULL,
    "reason" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerItem" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "kind" "LedgerKind" NOT NULL,
    "name" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "ItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "verification" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "lastConfirmedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "LedgerItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnershipShare" (
    "ledgerItemId" TEXT NOT NULL,
    "familyMemberId" TEXT NOT NULL,
    "sharePct" DECIMAL(7,4) NOT NULL,

    CONSTRAINT "OwnershipShare_pkey" PRIMARY KEY ("ledgerItemId","familyMemberId")
);

-- CreateTable
CREATE TABLE "Valuation" (
    "id" TEXT NOT NULL,
    "ledgerItemId" TEXT NOT NULL,
    "asOf" DATE NOT NULL,
    "value" DECIMAL(18,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "source" "ValuationSource" NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "documentId" TEXT,
    "supersedesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Valuation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountDetail" (
    "ledgerItemId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "accountType" "AccountType" NOT NULL,
    "accountNumberMasked" TEXT,
    "trackName" TEXT,
    "managementFeePct" DECIMAL(6,4),
    "depositFeePct" DECIMAL(6,4),
    "employerName" TEXT,
    "openedAt" DATE,
    "liquidityClass" TEXT,

    CONSTRAINT "AccountDetail_pkey" PRIMARY KEY ("ledgerItemId")
);

-- CreateTable
CREATE TABLE "Institution" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameHe" TEXT,
    "country" TEXT NOT NULL DEFAULT 'IL',
    "type" TEXT NOT NULL,

    CONSTRAINT "Institution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RealEstateDetail" (
    "ledgerItemId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT,
    "propertyType" TEXT NOT NULL,
    "isPrimaryResidence" BOOLEAN NOT NULL DEFAULT false,
    "purchaseDate" DATE,
    "purchasePrice" DECIMAL(18,4),
    "purchaseCurrency" CHAR(3),

    CONSTRAINT "RealEstateDetail_pkey" PRIMARY KEY ("ledgerItemId")
);

-- CreateTable
CREATE TABLE "MortgageDetail" (
    "ledgerItemId" TEXT NOT NULL,
    "lenderId" TEXT,
    "linkedPropertyId" TEXT,
    "originalPrincipal" DECIMAL(18,4) NOT NULL,
    "startDate" DATE NOT NULL,

    CONSTRAINT "MortgageDetail_pkey" PRIMARY KEY ("ledgerItemId")
);

-- CreateTable
CREATE TABLE "MortgageTrack" (
    "id" TEXT NOT NULL,
    "mortgageId" TEXT NOT NULL,
    "trackType" "MortgageTrackType" NOT NULL,
    "principalRemaining" DECIMAL(18,4) NOT NULL,
    "annualRatePct" DECIMAL(7,4) NOT NULL,
    "cpiLinked" BOOLEAN NOT NULL,
    "monthlyPayment" DECIMAL(18,4),
    "endDate" DATE NOT NULL,

    CONSTRAINT "MortgageTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanDetail" (
    "ledgerItemId" TEXT NOT NULL,
    "lenderName" TEXT,
    "principalRemaining" DECIMAL(18,4) NOT NULL,
    "annualRatePct" DECIMAL(7,4) NOT NULL,
    "endDate" DATE,
    "purpose" TEXT,

    CONSTRAINT "LoanDetail_pkey" PRIMARY KEY ("ledgerItemId")
);

-- CreateTable
CREATE TABLE "CashFlowDetail" (
    "ledgerItemId" TEXT NOT NULL,
    "flowType" "CashFlowType" NOT NULL,
    "direction" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "frequency" "Frequency" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "isGross" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CashFlowDetail_pkey" PRIMARY KEY ("ledgerItemId")
);

-- CreateTable
CREATE TABLE "InsuranceDetail" (
    "ledgerItemId" TEXT NOT NULL,
    "policyType" "InsurancePolicyType" NOT NULL,
    "coverageAmount" DECIMAL(18,4),
    "monthlyPremium" DECIMAL(18,4),
    "throughPension" BOOLEAN NOT NULL DEFAULT false,
    "insuredMemberId" TEXT,
    "endDate" DATE,

    CONSTRAINT "InsuranceDetail_pkey" PRIMARY KEY ("ledgerItemId")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "docType" TEXT,
    "institutionId" TEXT,
    "periodStart" DATE,
    "periodEnd" DATE,
    "parseStatus" "ParseStatus" NOT NULL DEFAULT 'UPLOADED',
    "storageKey" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "documentId" TEXT,
    "adapterId" TEXT NOT NULL,
    "adapterVersion" TEXT NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'RUNNING',
    "rawPayload" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportedField" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "ledgerItemId" TEXT,
    "valuationId" TEXT,
    "fieldPath" TEXT NOT NULL,
    "originalValue" TEXT NOT NULL,
    "originalCurrency" CHAR(3),
    "importDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confidence" INTEGER NOT NULL,
    "verification" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "lastUpdate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportedField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuspenseItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rawData" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "SuspenseStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedLedgerItemId" TEXT,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "SuspenseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRuleSet" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'IL',
    "taxYear" INTEGER NOT NULL,
    "ruleType" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxRuleSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assumption" (
    "id" TEXT NOT NULL,
    "householdId" TEXT,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "value" JSONB NOT NULL,
    "unit" TEXT,
    "description" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "type" "GoalType" NOT NULL,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "targetDate" DATE,
    "requiredFunding" DECIMAL(18,4),
    "currency" CHAR(3) NOT NULL,
    "riskTolerance" TEXT NOT NULL,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalDependency" (
    "goalId" TEXT NOT NULL,
    "dependsOnGoalId" TEXT NOT NULL,

    CONSTRAINT "GoalDependency_pkey" PRIMARY KEY ("goalId","dependsOnGoalId")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleHe" TEXT,
    "rationale" JSONB NOT NULL,
    "confidenceScore" INTEGER NOT NULL,
    "dataCompletenessScore" INTEGER NOT NULL,
    "priorityScore" DECIMAL(8,4) NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'PROPOSED',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationAssumption" (
    "recommendationId" TEXT NOT NULL,
    "assumptionId" TEXT NOT NULL,

    CONSTRAINT "RecommendationAssumption_pkey" PRIMARY KEY ("recommendationId","assumptionId")
);

-- CreateTable
CREATE TABLE "RecommendationGoal" (
    "recommendationId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "impactDescription" TEXT NOT NULL,

    CONSTRAINT "RecommendationGoal_pkey" PRIMARY KEY ("recommendationId","goalId")
);

-- CreateTable
CREATE TABLE "RecommendationEvidence" (
    "id" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "ledgerItemId" TEXT,
    "description" TEXT NOT NULL,

    CONSTRAINT "RecommendationEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionJournalEntry" (
    "id" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedBy" TEXT NOT NULL,
    "implementationDate" DATE,
    "expectedOutcome" TEXT,
    "actualOutcome" TEXT,
    "notes" TEXT,

    CONSTRAINT "DecisionJournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "parameterOverrides" JSONB NOT NULL,
    "resultSnapshot" JSONB,
    "baselineSnapshotId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdSnapshot" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "kind" "SnapshotKind" NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseholdSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FxRate" (
    "id" TEXT NOT NULL,
    "from" CHAR(3) NOT NULL,
    "to" CHAR(3) NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "asOf" DATE NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "FxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "LedgerItem_householdId_kind_status_idx" ON "LedgerItem"("householdId", "kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Valuation_supersedesId_key" ON "Valuation"("supersedesId");

-- CreateIndex
CREATE INDEX "Valuation_ledgerItemId_asOf_idx" ON "Valuation"("ledgerItemId", "asOf");

-- CreateIndex
CREATE UNIQUE INDEX "Institution_name_country_key" ON "Institution"("name", "country");

-- CreateIndex
CREATE UNIQUE INDEX "Document_sha256_key" ON "Document"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "TaxRuleSet_country_taxYear_ruleType_version_key" ON "TaxRuleSet"("country", "taxYear", "ruleType", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Assumption_householdId_key_version_key" ON "Assumption"("householdId", "key", "version");

-- CreateIndex
CREATE INDEX "HouseholdSnapshot_householdId_takenAt_idx" ON "HouseholdSnapshot"("householdId", "takenAt");

-- CreateIndex
CREATE UNIQUE INDEX "FxRate_from_to_asOf_source_key" ON "FxRate"("from", "to", "asOf", "source");

-- CreateIndex
CREATE INDEX "AuditEvent_householdId_at_idx" ON "AuditEvent"("householdId", "at");

-- AddForeignKey
ALTER TABLE "FamilyMember" ADD CONSTRAINT "FamilyMember_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerItem" ADD CONSTRAINT "LedgerItem_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnershipShare" ADD CONSTRAINT "OwnershipShare_ledgerItemId_fkey" FOREIGN KEY ("ledgerItemId") REFERENCES "LedgerItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnershipShare" ADD CONSTRAINT "OwnershipShare_familyMemberId_fkey" FOREIGN KEY ("familyMemberId") REFERENCES "FamilyMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Valuation" ADD CONSTRAINT "Valuation_ledgerItemId_fkey" FOREIGN KEY ("ledgerItemId") REFERENCES "LedgerItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Valuation" ADD CONSTRAINT "Valuation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountDetail" ADD CONSTRAINT "AccountDetail_ledgerItemId_fkey" FOREIGN KEY ("ledgerItemId") REFERENCES "LedgerItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountDetail" ADD CONSTRAINT "AccountDetail_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RealEstateDetail" ADD CONSTRAINT "RealEstateDetail_ledgerItemId_fkey" FOREIGN KEY ("ledgerItemId") REFERENCES "LedgerItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MortgageDetail" ADD CONSTRAINT "MortgageDetail_ledgerItemId_fkey" FOREIGN KEY ("ledgerItemId") REFERENCES "LedgerItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MortgageDetail" ADD CONSTRAINT "MortgageDetail_linkedPropertyId_fkey" FOREIGN KEY ("linkedPropertyId") REFERENCES "RealEstateDetail"("ledgerItemId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MortgageTrack" ADD CONSTRAINT "MortgageTrack_mortgageId_fkey" FOREIGN KEY ("mortgageId") REFERENCES "MortgageDetail"("ledgerItemId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanDetail" ADD CONSTRAINT "LoanDetail_ledgerItemId_fkey" FOREIGN KEY ("ledgerItemId") REFERENCES "LedgerItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashFlowDetail" ADD CONSTRAINT "CashFlowDetail_ledgerItemId_fkey" FOREIGN KEY ("ledgerItemId") REFERENCES "LedgerItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceDetail" ADD CONSTRAINT "InsuranceDetail_ledgerItemId_fkey" FOREIGN KEY ("ledgerItemId") REFERENCES "LedgerItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedField" ADD CONSTRAINT "ImportedField_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedField" ADD CONSTRAINT "ImportedField_ledgerItemId_fkey" FOREIGN KEY ("ledgerItemId") REFERENCES "LedgerItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedField" ADD CONSTRAINT "ImportedField_valuationId_fkey" FOREIGN KEY ("valuationId") REFERENCES "Valuation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuspenseItem" ADD CONSTRAINT "SuspenseItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuspenseItem" ADD CONSTRAINT "SuspenseItem_resolvedLedgerItemId_fkey" FOREIGN KEY ("resolvedLedgerItemId") REFERENCES "LedgerItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assumption" ADD CONSTRAINT "Assumption_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalDependency" ADD CONSTRAINT "GoalDependency_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalDependency" ADD CONSTRAINT "GoalDependency_dependsOnGoalId_fkey" FOREIGN KEY ("dependsOnGoalId") REFERENCES "Goal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "HouseholdSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationAssumption" ADD CONSTRAINT "RecommendationAssumption_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationAssumption" ADD CONSTRAINT "RecommendationAssumption_assumptionId_fkey" FOREIGN KEY ("assumptionId") REFERENCES "Assumption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationGoal" ADD CONSTRAINT "RecommendationGoal_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationGoal" ADD CONSTRAINT "RecommendationGoal_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationEvidence" ADD CONSTRAINT "RecommendationEvidence_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationEvidence" ADD CONSTRAINT "RecommendationEvidence_ledgerItemId_fkey" FOREIGN KEY ("ledgerItemId") REFERENCES "LedgerItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionJournalEntry" ADD CONSTRAINT "DecisionJournalEntry_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdSnapshot" ADD CONSTRAINT "HouseholdSnapshot_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
