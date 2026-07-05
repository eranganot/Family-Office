import { protectedProcedure, publicProcedure, router } from "../trpc.js";

export const healthRouter = router({
  ping: publicProcedure.query(() => ({ ok: true as const, time: new Date().toISOString() })),
  whoami: protectedProcedure.query(({ ctx }) => ({ email: ctx.session.email })),
});
