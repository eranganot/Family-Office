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
  behavioralClass: BehavioralClassSchema.optional(),
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

// ------------------------------------------------------------------ M38a --

/**
 * Full edit of a manually-entered or imported transaction. Every field optional —
 * only what is sent is changed. Changing the amount or the description invalidates
 * the derived merchant key, so the router recomputes it.
 */
export const UpdateTransactionSchema = z
  .object({
    id: z.uuid(),
    bookedAt: z.coerce.date().optional(),
    valueDate: z.coerce.date().nullable().optional(),
    amount: SignedDecimalString.optional(),
    currency: CurrencyCodeSchema.optional(),
    description: z.string().min(1).max(400).optional(),
    categoryId: z.uuid().nullable().optional(),
    behavioralClass: BehavioralClassSchema.nullable().optional(),
    instalmentNumber: z.number().int().min(1).max(999).nullable().optional(),
    instalmentTotal: z.number().int().min(1).max(999).nullable().optional(),
    isRecurringCandidate: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.instalmentNumber === null || v.instalmentTotal === null ||
      v.instalmentNumber === undefined || v.instalmentTotal === undefined ||
      v.instalmentNumber <= v.instalmentTotal,
    { message: "instalmentNumber must not exceed instalmentTotal", path: ["instalmentNumber"] },
  );

/**
 * Removal is a VOID, not a DELETE. A voided transaction is excluded from every
 * calculation but keeps its classification history, which is append-only evidence —
 * and it can be restored. Destroying the row would also destroy the audit trail of
 * how it was ever classified.
 */
export const SetTransactionStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(["BOOKED", "PENDING", "VOID"]),
});

// ------------------------------------------------------------------ M38b --

export const AmountModeSchema = z.enum(["SIGNED", "DEBIT_CREDIT"]);

export const ColumnMappingSchema = z.object({
  date: z.string().min(1),
  description: z.string().min(1),
  amount: z.string().optional(),
  debit: z.string().optional(),
  credit: z.string().optional(),
  currency: z.string().optional(),
  valueDate: z.string().optional(),
  reference: z.string().optional(),
  balance: z.string().optional(),
  direction: z.string().optional(),
  pendingMarker: z.string().optional(),
});

export const MappingProfileSchema = z
  .object({
    amountMode: AmountModeSchema,
    allOutflow: z.boolean().default(false),
    columns: ColumnMappingSchema,
    defaultCurrency: CurrencyCodeSchema.default("ILS"),
    dayFirst: z.boolean().default(true),
  })
  .refine(
    (v) =>
      v.amountMode === "SIGNED" ? Boolean(v.columns.amount) : Boolean(v.columns.debit || v.columns.credit),
    { message: "SIGNED needs an amount column; DEBIT_CREDIT needs a debit and/or credit column", path: ["columns"] },
  );

export const PreviewStatementSchema = z.object({
  documentId: z.uuid(),
  mapping: MappingProfileSchema.optional(),
});

export const CommitStatementSchema = z.object({
  documentId: z.uuid(),
  adapterId: z.string().min(1).max(80).default("generic-tabular"),
  mapping: MappingProfileSchema.optional(),
  /** Persist this mapping for reuse next time this source is imported. */
  saveProfileAs: z.string().min(1).max(120).optional(),
});

export const SaveMappingProfileSchema = z.object({
  name: z.string().min(1).max(120),
  adapterId: z.string().min(1).max(80).default("generic-tabular"),
  mapping: MappingProfileSchema,
});
