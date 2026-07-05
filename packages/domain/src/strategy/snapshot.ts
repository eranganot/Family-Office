import { z } from "zod";

/**
 * SnapshotPayload v1 — the versioned, denormalized household graph that strategy
 * and scenario engines consume. Engines never touch the database; reproducibility
 * comes from snapshotting first. All monetary values converted to base currency at
 * build time; items without an FX rate carry valueBase=null (never guessed).
 */

export const SnapshotMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(["ADULT", "CHILD"]),
  birthDate: z.string().nullable(), // ISO date
  employmentStatus: z.string().nullable(),
});

export const SnapshotMortgageTrackSchema = z.object({
  trackType: z.string(),
  principalRemaining: z.number(),
  annualRatePct: z.number(),
  cpiLinked: z.boolean(),
  endDate: z.string(),
});

export const SnapshotItemSchema = z.object({
  id: z.string(),
  kind: z.string(),
  name: z.string(),
  currency: z.string(),
  accountType: z.string().nullable(),
  institutionName: z.string().nullable(),
  liquidityClass: z.string().nullable(),
  managementFeePct: z.number().nullable(),
  /** Latest valuation converted to base currency; null = no valuation or no FX rate. */
  valueBase: z.number().nullable(),
  valueAsOf: z.string().nullable(),
  verified: z.boolean(),
  ownerMemberIds: z.array(z.string()),
  mortgageTracks: z.array(SnapshotMortgageTrackSchema).nullable(),
  cashFlow: z
    .object({ flowType: z.string(), direction: z.string(), amountBase: z.number().nullable(), frequency: z.string() })
    .nullable(),
});

export const SnapshotGoalSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  priority: z.number(),
  targetDate: z.string().nullable(),
  requiredFundingBase: z.number().nullable(),
});

export const SnapshotPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  takenAt: z.string(),
  baseCurrency: z.string(),
  workflowState: z.string(),
  members: z.array(SnapshotMemberSchema),
  items: z.array(SnapshotItemSchema),
  goals: z.array(SnapshotGoalSchema),
  fxRatesUsed: z.array(z.object({ from: z.string(), to: z.string(), rate: z.number(), asOf: z.string() })),
  dataQuality: z.object({
    completenessScore: z.number(),
    confidenceScore: z.number(),
    pendingSuspense: z.number(),
    unconvertedItemIds: z.array(z.string()),
  }),
});

export type SnapshotPayload = z.infer<typeof SnapshotPayloadSchema>;
export type SnapshotItem = z.infer<typeof SnapshotItemSchema>;
export type SnapshotGoal = z.infer<typeof SnapshotGoalSchema>;
export type SnapshotMember = z.infer<typeof SnapshotMemberSchema>;
