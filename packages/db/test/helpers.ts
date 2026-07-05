import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

export const TEST_URL = process.env["TEST_DATABASE_URL"];

export function testClient(): PrismaClient {
  if (!TEST_URL) throw new Error("TEST_DATABASE_URL not set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: TEST_URL }) });
}

/** Truncate everything between tests — test DB only. */
export async function wipe(db: PrismaClient): Promise<void> {
  await db.$executeRawUnsafe(`
    TRUNCATE "ImportedField","SuspenseItem","ImportBatch","Valuation","OwnershipShare",
      "AccountDetail","MortgageTrack","MortgageDetail","RealEstateDetail","LoanDetail",
      "CashFlowDetail","InsuranceDetail","RecommendationAssumption","RecommendationGoal",
      "RecommendationEvidence","DecisionJournalEntry","Recommendation","GoalDependency","Goal",
      "LedgerItem","Document","Institution","AuditEvent","WorkflowTransition","FamilyMember",
      "User","HouseholdSnapshot","Scenario","Assumption","FxRate","Household" CASCADE
  `);
}
