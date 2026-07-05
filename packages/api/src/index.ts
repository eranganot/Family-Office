import { accountsRouter } from "./routers/accounts";
import { propertyRouter } from "./routers/property";
import { flowsRouter } from "./routers/flows";
import { networthRouter } from "./routers/networth";
import { documentsRouter } from "./routers/documents";
import { importsRouter, suspenseResolutionRouter } from "./routers/imports";
import { verificationRouter } from "./routers/verification";
import { registryRouter } from "./routers/registry";
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
  networth: networthRouter,
  documents: documentsRouter,
  imports: importsRouter,
  verification: verificationRouter,
  suspense: suspenseResolutionRouter,
  registry: registryRouter,
});

export type AppRouter = typeof appRouter;
export type { Context, Session } from "./context";
