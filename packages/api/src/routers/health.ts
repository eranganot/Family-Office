import { protectedProcedure, publicProcedure, router } from "../trpc";

export const healthRouter = router({
  ping: publicProcedure.query(() => ({ ok: true as const, time: new Date().toISOString() })),
  whoami: protectedProcedure.query(({ ctx }) => ({ email: ctx.session.email })),
});
