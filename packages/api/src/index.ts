import { accountsRouter } from "./routers/accounts";
import { allocationRouter } from "./routers/allocation";
import { propertyRouter } from "./routers/property";
import { flowsRouter } from "./routers/flows";
import { networthRouter } from "./routers/networth";
import { documentsRouter } from "./routers/documents";
import { importsRouter, suspenseResolutionRouter } from "./routers/imports";
import { verificationRouter } from "./routers/verification";
import { registryRouter } from "./routers/registry";
import { goalsRouter } from "./routers/goals";
import { strategyRouter } from "./routers/strategy";
import { journalRouter } from "./routers/journal";
import { scenariosRouter } from "./routers/scenarios";
import { healthRouter } from "./routers/health";
import { householdRouter } from "./routers/household";
import { ledgerRouter } from "./routers/ledger";
import { workflowRouter } from "./routers/workflow";
import { monitoringRouter } from "./routers/monitoring";
import { router } from "./trpc";

export const appRouter = router({
  health: healthRouter,
  household: householdRouter,
  workflow: workflowRouter,
  ledger: ledgerRouter,
  accounts: accountsRouter,
  allocation: allocationRouter,
  property: propertyRouter,
  flows: flowsRouter,
  networth: networthRouter,
  documents: documentsRouter,
  imports: importsRouter,
  verification: verificationRouter,
  suspense: suspenseResolutionRouter,
  registry: registryRouter,
  goals: goalsRouter,
  strategy: strategyRouter,
  journal: journalRouter,
  scenarios: scenariosRouter,
  monitoring: monitoringRouter,
});

export type AppRouter = typeof appRouter;
export { runMonitoringCycle } from "./services/monitoring-service";
export type { MonitoringCycleResult } from "./services/monitoring-service";
export type { Context, Session } from "./context";
export { refreshFxFromBoi } from "./services/fx-service";
export { refreshBoiRate, latestBoiRate } from "./services/boi-rate-service";
export type { FxRefreshResult } from "./services/fx-service";
