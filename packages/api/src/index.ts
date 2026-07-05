import { healthRouter } from "./routers/health";
import { router } from "./trpc";

export const appRouter = router({
  health: healthRouter,
});

export type AppRouter = typeof appRouter;
export type { Context, Session } from "./context";
