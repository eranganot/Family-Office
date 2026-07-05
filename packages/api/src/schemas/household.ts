import { z } from "zod";
import { CurrencyCodeSchema } from "@wealthos/domain";

export const LocaleSchema = z.enum(["he", "en"]);

export const BootstrapHouseholdSchema = z.object({
  name: z.string().min(1).max(120),
  baseCurrency: CurrencyCodeSchema.default("ILS"),
  locale: LocaleSchema.default("he"),
  timezone: z.string().default("Asia/Jerusalem"),
});

export const UpdateHouseholdSchema = BootstrapHouseholdSchema.partial();

export const MemberRoleSchema = z.enum(["ADULT", "CHILD"]);
export const EmploymentStatusSchema = z.enum([
  "EMPLOYED",
  "SELF_EMPLOYED",
  "UNEMPLOYED",
  "RETIRED",
  "STUDENT",
  "MINOR",
]);

export const AddMemberSchema = z.object({
  name: z.string().min(1).max(120),
  role: MemberRoleSchema,
  birthDate: z.coerce.date().optional(),
  taxResidency: z.string().length(2).default("IL"),
  employmentStatus: EmploymentStatusSchema.optional(),
});

export const UpdateMemberSchema = AddMemberSchema.partial().extend({ id: z.uuid() });
