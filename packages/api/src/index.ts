import { healthRouter } from "./routers/health";
import { householdRouter } from "./routers/household";
import { router } from "./trpc";

export const appRouter = router({
  health: healthRouter,
  household: householdRouter,
});

export type AppRouter = typeof appRouter;
export type { Context, Session } from "./context";
