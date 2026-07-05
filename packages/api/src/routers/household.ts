import { TRPCError } from "@trpc/server";
import { householdRepo } from "@wealthos/db";
import { z } from "zod";
import {
  AddMemberSchema,
  BootstrapHouseholdSchema,
  UpdateHouseholdSchema,
  UpdateMemberSchema,
} from "../schemas/household";
import { protectedProcedure, router } from "../trpc";

export const householdRouter = router({
  get: protectedProcedure.query(({ ctx }) => householdRepo.get(ctx.db)),

  bootstrap: protectedProcedure.input(BootstrapHouseholdSchema).mutation(async ({ ctx, input }) => {
    try {
      return await householdRepo.bootstrap(ctx.db, input);
    } catch (e) {
      if (e instanceof Error && e.message === "HOUSEHOLD_ALREADY_EXISTS") {
        throw new TRPCError({ code: "CONFLICT", message: "Household already exists" });
      }
      throw e;
    }
  }),

  update: protectedProcedure
    .input(UpdateHouseholdSchema.extend({ id: z.uuid() }))
    .mutation(({ ctx, input: { id, ...patch } }) => householdRepo.update(ctx.db, id, patch)),

  addMember: protectedProcedure.input(AddMemberSchema).mutation(async ({ ctx, input }) => {
    const household = await householdRepo.get(ctx.db);
    if (!household) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Bootstrap household first" });
    return householdRepo.addMember(ctx.db, household.id, input);
  }),

  updateMember: protectedProcedure
    .input(UpdateMemberSchema)
    .mutation(({ ctx, input: { id, ...patch } }) => householdRepo.updateMember(ctx.db, id, patch)),

  archiveMember: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) => householdRepo.archiveMember(ctx.db, input.id)),
});
