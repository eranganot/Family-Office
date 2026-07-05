import { z } from "zod";

/** Every TaxRuleSet payload is validated by one of these — no unvalidated JSONB. */

export const BracketSchema = z.object({
  /** Annual amounts in ILS; null upTo = unbounded top bracket. */
  upToAnnualILS: z.number().positive().nullable(),
  ratePct: z.number().min(0).max(60),
});

export const IncomeTaxBracketsSchema = z.object({
  brackets: z.array(BracketSchema).min(3),
  surtax: z.object({ thresholdAnnualILS: z.number().positive(), ratePct: z.number() }),
  creditPointAnnualILS: z.number().positive(),
  residentCreditPoints: z.number().positive(),
  meta: MetaSchemaShape(),
});

export const CapitalGainsSchema = z.object({
  realGainIndividualPct: z.number(),
  substantialShareholderPct: z.number(),
  meta: MetaSchemaShape(),
});

export const HishtalmutCeilingsSchema = z.object({
  salariedMonthlySalaryCeilingILS: z.number().positive(),
  salariedEmployerPct: z.number(),
  salariedEmployeePct: z.number(),
  selfEmployedExemptDepositAnnualILS: z.number().positive(),
  selfEmployedDeductionPctOfIncome: z.number(),
  selfEmployedIncomeCeilingAnnualILS: z.number().positive(),
  meta: MetaSchemaShape(),
});

export const PensionCeilingsSchema = z.object({
  qualifiedIncomeAnnualILS: z.number().positive(),
  maxBenefitDepositPctOfQualified: z.number(),
  section47MonthlySalaryCeilingILS: z.number().positive(),
  meta: MetaSchemaShape(),
});

export const BituachLeumiSchema = z.object({
  reducedRateMonthlyThresholdILS: z.number().positive(),
  monthlyIncomeCeilingILS: z.number().positive(),
  employeeRates: z.object({
    reducedPct: z.number().nullable(),
    fullPct: z.number().nullable(),
  }),
  meta: MetaSchemaShape(),
});

export const PurchaseTaxSchema = z.object({
  singleHome: z.array(BracketSchema.extend({ upToAnnualILS: z.number().positive().nullable() })),
  additionalHome: z.array(BracketSchema.extend({ upToAnnualILS: z.number().positive().nullable() })),
  meta: MetaSchemaShape(),
});

function MetaSchemaShape() {
  return z.object({
    sources: z.array(z.string().url()).min(1),
    notes: z.array(z.string()).default([]),
    ownerReviewed: z.boolean(),
    capturedAt: z.string(),
  });
}

export const RULE_SCHEMAS = {
  INCOME_TAX_BRACKETS: IncomeTaxBracketsSchema,
  CAPITAL_GAINS: CapitalGainsSchema,
  HISHTALMUT_CEILINGS: HishtalmutCeilingsSchema,
  PENSION_CEILINGS: PensionCeilingsSchema,
  BITUACH_LEUMI: BituachLeumiSchema,
  PURCHASE_TAX: PurchaseTaxSchema,
} as const;

export type RuleType = keyof typeof RULE_SCHEMAS;
export const RuleTypeSchema = z.enum(Object.keys(RULE_SCHEMAS) as [RuleType, ...RuleType[]]);
