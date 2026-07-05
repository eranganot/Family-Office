import { z } from "zod";
import { CurrencyCodeSchema } from "@wealthos/domain";

export const DecimalString = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^-?\d+(\.\d{1,4})?$/, "Must be a decimal with up to 4 places"));

export const PositiveDecimalString = DecimalString.refine((v) => Number(v) > 0, "Must be positive");

export const OwnershipSchema = z
  .array(z.object({ familyMemberId: z.uuid(), sharePct: DecimalString }))
  .min(1);

export const LedgerBaseSchema = z.object({
  name: z.string().min(1).max(200),
  currency: CurrencyCodeSchema,
  notes: z.string().max(2000).optional(),
  ownership: OwnershipSchema,
});

export const ValuationInputSchema = z.object({
  asOf: z.coerce.date(),
  value: DecimalString,
  currency: CurrencyCodeSchema,
  confidence: z.number().int().min(0).max(100).default(50),
});

export const AddValuationSchema = ValuationInputSchema.extend({
  ledgerItemId: z.uuid(),
  supersedesId: z.uuid().optional(),
});

export const LedgerKindSchema = z.enum([
  "ACCOUNT",
  "REAL_ESTATE",
  "MORTGAGE",
  "LOAN",
  "CASH_FLOW",
  "INSURANCE",
  "OTHER_ASSET",
  "OTHER_LIABILITY",
  "SUSPENSE",
]);
