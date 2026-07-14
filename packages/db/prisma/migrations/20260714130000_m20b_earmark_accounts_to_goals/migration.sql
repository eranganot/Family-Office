-- M20b (B7): pin an account/asset to a goal so funding-gap allocation reflects owner intent.
ALTER TABLE "LedgerItem" ADD COLUMN "earmarkedGoalId" TEXT;
ALTER TABLE "LedgerItem" ADD CONSTRAINT "LedgerItem_earmarkedGoalId_fkey"
  FOREIGN KEY ("earmarkedGoalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
