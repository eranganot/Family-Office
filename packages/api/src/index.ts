import { healthRouter } from "./routers/health";
import { householdRouter } from "./routers/household";
import { workflowRouter } from "./routers/workflow";
import { router } from "./trpc";

export const appRouter = router({
  health: healthRouter,
  household: householdRouter,
  workflow: workflowRouter,
});

export type AppRouter = typeof appRouter;
export type { Context, Session } from "./context";
