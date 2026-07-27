import { z } from "zod";
import { CurrencyCodeSchema } from "@wealthos/domain";
import { DecimalString } from "./ledger";

export const BehavioralClassSchema = z.enum([
  "FIXED_CONTRACTUAL",
  "VARIABLE_DISCRETIONARY",
  "FINANCIAL_DRAG",
  "SAVINGS_FLOW",
  "TRANSFER",
]);

export const CategoryAxisSchema = z.enum(["INCOME", "EXPENSE"]);

export const CashFlowTypeSchema = z.enum([
  "SALARY",
  "SELF_EMPLOYMENT_INCOME",
  "RENTAL_INCOME",
  "PENSION_INCOME",
  "OTHER_INCOME",
  "LIVING_EXPENSE",
  "HOUSING_EXPENSE",
  "EDUCATION_EXPENSE",
  "INSURANCE_PREMIUM",
  "LOAN_PAYMENT",
  "OTHER_EXPENSE",
  "HISHTALMUT_CONTRIBUTION",
  "PENSION_CONTRIBUTION",
]);

/** Category keys are stable slugs: lowercase segments joined by dots. */
export const CategoryKeySchema = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/, "Must be a dot-separated lowercase slug");

export const UpsertCategorySchema = z.object({
  id: z.uuid().optional(),
  parentId: z.uuid().nullable().optional(),
  axis: CategoryAxisSchema,
  key: CategoryKeySchema,
  nameEn: z.string().min(1).max(120),
  nameHe: z.string().min(1).max(120),
  defaultBehavioralClass: BehavioralClassSchema,
  mapsToFlowType: CashFlowTypeSchema.nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export const ArchiveCategorySchema = z.object({
  id: z.uuid(),
  /** Where to move transactions currently pointing at the archived category. */
  reassignToId: z.uuid().optional(),
});

/**
 * Signed amount: negative = outflow. Deliberately NOT PositiveDecimalString —
 * refunds and credits are real and must round-trip (real statements carry them,
 * including with a U+2212 minus that the importer normalises).
 */
export const SignedDecimalString = DecimalString.refine(
  (v) => Number(v) !== 0,
  "Amount must not be zero",
);

export const CreateManualTransactionSchema = z
  .object({
    bookedAt: z.coerce.date(),
    valueDate: z.coerce.date().optional(),
    amount: SignedDecimalString,
    currency: CurrencyCodeSchema,
    description: z.string().min(1).max(400),
    categoryId: z.uuid().optional(),
    behavioralClass: BehavioralClassSchema.optional(),
    instalmentNumber: z.number().int().min(1).max(999).optional(),
    instalmentTotal: z.number().int().min(1).max(999).optional(),
    originalAmount: DecimalString.optional(),
    isRecurringCandidate: z.boolean().default(false),
  })
  .refine(
    (v) => (v.instalmentNumber === undefined) === (v.instalmentTotal === undefined),
    { message: "instalmentNumber and instalmentTotal must be provided together", path: ["instalmentTotal"] },
  )
  .refine(
    (v) => v.instalmentNumber === undefined || v.instalmentTotal === undefined || v.instalmentNumber <= v.instalmentTotal,
    { message: "instalmentNumber must not exceed instalmentTotal", path: ["instalmentNumber"] },
  );

export const ListTransactionsSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  categoryId: z.uuid().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  cursor: z.uuid().optional(),
});

export const ClassifyTransactionsSchema = z.object({
  transactionIds: z.array(z.uuid()).min(1).max(500),
  categoryId: z.uuid(),
  behavioralClass: BehavioralClassSchema,
});

// ------------------------------------------------------------------- M37 --

export const PeriodRefSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

export const ClosePeriodSchema = PeriodRefSchema.extend({
  reviewNote: z.string().max(2000).optional(),
});

/**
 * Apply one decision to every transaction from the same merchant. This is the
 * mechanism by which the household teaches the deterministic classifier — no model,
 * just an owner decision that future transactions inherit.
 */
export const BulkClassifyByMerchantSchema = z.object({
  merchantKey: z.string().min(1).max(200),
  categoryId: z.uuid(),
  behavioralClass: BehavioralClassSchema,
});
