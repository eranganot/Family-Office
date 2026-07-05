import { accountsRouter } from "./routers/accounts";
import { propertyRouter } from "./routers/property";
import { flowsRouter } from "./routers/flows";
import { healthRouter } from "./routers/health";
import { householdRouter } from "./routers/household";
import { ledgerRouter } from "./routers/ledger";
import { workflowRouter } from "./routers/workflow";
import { router } from "./trpc";

export const appRouter = router({
  health: healthRouter,
  household: householdRouter,
  workflow: workflowRouter,
  ledger: ledgerRouter,
  accounts: accountsRouter,
  property: propertyRouter,
  flows: flowsRouter,
});

export type AppRouter = typeof appRouter;
export type { Context, Session } from "./context";
